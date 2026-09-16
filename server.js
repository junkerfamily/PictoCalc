const express = require("express");
const basicAuth = require("express-basic-auth");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const sharp = require("sharp");

const ROOT = __dirname;
const MAX_IMAGE_EDGE = 1200;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

loadDotEnv();

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : ROOT;
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const BUNDLED_CONFIG = path.join(ROOT, "config.json");
const BUNDLED_IMAGES = path.join(ROOT, "images");

const PORT = Number(process.env.PORT) || 8000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";

seedPersistentData();

const app = express();
app.use(express.json({ limit: "1mb" }));

const requireAdmin = basicAuth({
  users: { [ADMIN_USER]: ADMIN_PASSWORD },
  challenge: true,
  realm: "PictoCalc Admin",
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter(_req, file, cb) {
    const ok = /^(image\/jpeg|image\/png|image\/webp|image\/gif)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Only JPEG, PNG, WebP, or GIF images are allowed"), ok);
  },
});

app.get("/api/config", (_req, res) => {
  try {
    res.json(readConfig());
  } catch (err) {
    console.error("Failed to read config", err);
    res.status(500).json({ error: "Failed to read config.json" });
  }
});

// Calculator and browsers requesting /config.json must see the persistent copy.
app.get("/config.json", (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(readConfig());
  } catch (err) {
    console.error("Failed to read config", err);
    res.status(500).json({ error: "Failed to read config.json" });
  }
});

app.put("/api/config", requireAdmin, (req, res) => {
  try {
    const validated = validateConfig(req.body);
    ensureBackupsDir();
    createBackup();
    atomicWriteJson(CONFIG_PATH, validated);
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to save config", err);
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || "Failed to save config" });
  }
});

app.post("/api/upload", requireAdmin, (req, res) => {
  upload.single("image")(req, res, async (err) => {
    try {
      if (err) {
        const status = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE" ? 400 : 400;
        return res.status(status).json({ error: err.message || "Upload failed" });
      }
      if (!req.file) return res.status(400).json({ error: "No image file provided" });

      ensureImagesDir();
      const result = await saveResizedImage(req.file);
      res.json(result);
    } catch (uploadErr) {
      console.error("Failed to upload image", uploadErr);
      res.status(500).json({ error: uploadErr.message || "Failed to process image" });
    }
  });
});

app.get("/api/backups", requireAdmin, (_req, res) => {
  try {
    ensureBackupsDir();
    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith("config-") && f.endsWith(".json"))
      .sort()
      .reverse();
    res.json({ backups: files });
  } catch (err) {
    console.error("Failed to list backups", err);
    res.status(500).json({ error: "Failed to list backups" });
  }
});

app.use("/admin.html", requireAdmin);
// Prefer persistent images (Railway volume / local DATA_DIR) over bundled copies.
app.use("/images", express.static(IMAGES_DIR));
app.use(express.static(ROOT));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PictoCalc running on port ${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Admin: /admin.html (user: ${ADMIN_USER})`);
  if (ADMIN_PASSWORD === "changeme") {
    console.log("WARNING: using default ADMIN_PASSWORD. Set ADMIN_PASSWORD in the host environment.");
  }
});

async function saveResizedImage(file) {
  const originalName = path.basename(file.originalname || "upload");
  const base = sanitizeBaseName(originalName.replace(/\.[^.]+$/, "") || "item");
  const stamp = Date.now().toString(36);
  const meta = await sharp(file.buffer, { failOn: "none" }).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const needsResize = width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE;

  // Prefer PNG when source has alpha; otherwise JPEG for smaller files.
  const hasAlpha = Boolean(meta.hasAlpha);
  const outExt = hasAlpha ? ".png" : ".jpg";
  const filename = `${base}-${stamp}${outExt}`;
  const absPath = path.join(IMAGES_DIR, filename);

  let pipeline = sharp(file.buffer, { failOn: "none" }).rotate();
  if (needsResize) {
    pipeline = pipeline.resize({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (outExt === ".png") {
    await pipeline.png({ compressionLevel: 8 }).toFile(absPath);
  } else {
    await pipeline.jpeg({ quality: 82, mozjpeg: true }).toFile(absPath);
  }

  const saved = await sharp(absPath).metadata();
  return {
    path: `images/${filename}`,
    width: saved.width,
    height: saved.height,
    resized: needsResize,
    originalWidth: width,
    originalHeight: height,
  };
}

function sanitizeBaseName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";
}

function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function readConfig() {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  if (Array.isArray(raw)) {
    return { defaultMenu: "Menu A", menus: { "Menu A": raw } };
  }
  return raw;
}

function validateConfig(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throwObject(400, "Config must be an object with menus");
  }
  if (!body.menus || typeof body.menus !== "object" || Array.isArray(body.menus)) {
    throwObject(400, "Config.menus must be an object");
  }

  const menus = {};
  const seenMenuNames = new Set();
  for (const [rawMenuName, items] of Object.entries(body.menus)) {
    const menuName = String(rawMenuName ?? "").trim();
    if (!menuName) throwObject(400, "Menu labels cannot be empty");
    if (seenMenuNames.has(menuName)) {
      throwObject(400, `Duplicate menu label "${menuName}"`);
    }
    seenMenuNames.add(menuName);
    if (!Array.isArray(items)) {
      throwObject(400, `Menu "${menuName}" must be an array`);
    }
    const seen = new Set();
    menus[menuName] = items.map((item, index) => {
      if (!item || typeof item !== "object") {
        throwObject(400, `Invalid item at ${menuName}[${index}]`);
      }
      const name = String(item.name ?? "").trim();
      if (!name) throwObject(400, `Item name required at ${menuName}[${index}]`);
      if (seen.has(name)) {
        throwObject(400, `Duplicate item name "${name}" in ${menuName}`);
      }
      seen.add(name);

      const price = Number(item.price);
      if (!Number.isFinite(price) || price < 0) {
        throwObject(400, `Invalid price for "${name}" in ${menuName}`);
      }

      const out = { name, price: Math.round(price * 100) / 100 };
      if (item.image != null && String(item.image).trim() !== "") {
        const image = String(item.image).trim().replace(/\\/g, "/");
        if (image.includes("..") || !image.startsWith("images/")) {
          throwObject(400, `Image path for "${name}" must be under images/`);
        }
        out.image = image;
      }
      if (item.scale != null && item.scale !== "") {
        const scale = Number(item.scale);
        if (!Number.isInteger(scale) || scale < 1 || scale > 10) {
          throwObject(400, `Scale for "${name}" must be an integer 1–10`);
        }
        out.scale = scale;
      }
      if (item.color != null && String(item.color).trim() !== "") {
        out.color = String(item.color).trim();
      }
      return out;
    });
  }

  const menuNames = Object.keys(menus);
  let defaultMenu = body.defaultMenu != null ? String(body.defaultMenu).trim() : "";
  if (!defaultMenu || !menuNames.includes(defaultMenu)) {
    defaultMenu = menuNames[0] || "Menu A";
  }

  return { defaultMenu, menus };
}

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function ensureImagesDir() {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function seedPersistentData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  ensureImagesDir();
  ensureBackupsDir();

  if (!fs.existsSync(CONFIG_PATH)) {
    if (!fs.existsSync(BUNDLED_CONFIG)) {
      throw new Error(`Missing config.json at ${BUNDLED_CONFIG}`);
    }
    fs.copyFileSync(BUNDLED_CONFIG, CONFIG_PATH);
    console.log(`Seeded config.json -> ${CONFIG_PATH}`);
  }

  if (DATA_DIR !== ROOT && fs.existsSync(BUNDLED_IMAGES)) {
    for (const name of fs.readdirSync(BUNDLED_IMAGES)) {
      const src = path.join(BUNDLED_IMAGES, name);
      const dest = path.join(IMAGES_DIR, name);
      if (!fs.statSync(src).isFile()) continue;
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    }
  }
}

function createBackup() {
  if (!fs.existsSync(CONFIG_PATH)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(CONFIG_PATH, path.join(BACKUPS_DIR, `config-${stamp}.json`));
  cleanupOldBackups(10);
}

function cleanupOldBackups(keep) {
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith("config-") && f.endsWith(".json"))
    .sort();
  while (files.length > keep) {
    const oldest = files.shift();
    fs.unlinkSync(path.join(BACKUPS_DIR, oldest));
  }
}

function atomicWriteJson(filePath, data) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

function throwObject(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}
