const express = require("express");
const basicAuth = require("express-basic-auth");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "config.json");
const BACKUPS_DIR = path.join(ROOT, "backups");

loadDotEnv();

const PORT = Number(process.env.PORT) || 8000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";

const app = express();
app.use(express.json({ limit: "1mb" }));

const requireAdmin = basicAuth({
  users: { [ADMIN_USER]: ADMIN_PASSWORD },
  challenge: true,
  realm: "PictoCalc Admin",
});

app.get("/api/config", (_req, res) => {
  try {
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
app.use(express.static(ROOT));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PictoCalc running on port ${PORT}`);
  console.log(`Admin: /admin.html (user: ${ADMIN_USER})`);
  if (ADMIN_PASSWORD === "changeme") {
    console.log("WARNING: using default ADMIN_PASSWORD. Set ADMIN_PASSWORD in the host environment.");
  }
});

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
  for (const [menuName, items] of Object.entries(body.menus)) {
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
        out.image = String(item.image).trim();
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
  let defaultMenu = body.defaultMenu;
  if (!defaultMenu || !menuNames.includes(defaultMenu)) {
    defaultMenu = menuNames[0] || "Menu A";
  }

  return { defaultMenu, menus };
}

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
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
