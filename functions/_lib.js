// Shared helpers for the Cloudflare Pages version of PictoCalc.
// Storage is the PICTO KV namespace:
//   "config"            current menus/prices (falls back to the bundled config.json)
//   "backup:<stamp>"    the 10 most recent configs before each save
//   "img:<filename>"    uploaded item pictures

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// Basic auth like the old express-basic-auth setup. Admin stays locked until
// ADMIN_PASSWORD is set as a Cloudflare secret.
export function checkAdmin(request, env) {
  const user = env.ADMIN_USER || "admin";
  const pass = env.ADMIN_PASSWORD;
  if (!pass) {
    return new Response("Admin is locked: set the ADMIN_PASSWORD secret in Cloudflare first.", { status: 503 });
  }
  const header = request.headers.get("Authorization") || "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try { decoded = atob(header.slice(6)); } catch {}
    const i = decoded.indexOf(":");
    if (i > -1 && safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), pass)) return null;
  }
  return new Response("Login required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="PictoCalc Admin", charset="UTF-8"' },
  });
}

function safeEqual(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export async function readConfig(env, request) {
  let raw = await env.PICTO.get("config", "json");
  if (!raw) {
    const res = await env.ASSETS.fetch(new URL("/config.json", request.url));
    raw = await res.json();
  }
  if (Array.isArray(raw)) return { defaultMenu: "Menu A", menus: { "Menu A": raw } };
  return raw;
}

// Same rules as server.js validateConfig.
export function validateConfig(body) {
  const fail = (m) => { const e = new Error(m); e.statusCode = 400; throw e; };
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("Config must be an object with menus");
  if (!body.menus || typeof body.menus !== "object" || Array.isArray(body.menus)) fail("Config.menus must be an object");

  const menus = {};
  const seenMenus = new Set();
  for (const [rawName, items] of Object.entries(body.menus)) {
    const menuName = String(rawName ?? "").trim();
    if (!menuName) fail("Menu labels cannot be empty");
    if (seenMenus.has(menuName)) fail(`Duplicate menu label "${menuName}"`);
    seenMenus.add(menuName);
    if (!Array.isArray(items)) fail(`Menu "${menuName}" must be an array`);
    const seen = new Set();
    menus[menuName] = items.map((item, index) => {
      if (!item || typeof item !== "object") fail(`Invalid item at ${menuName}[${index}]`);
      const name = String(item.name ?? "").trim();
      if (!name) fail(`Item name required at ${menuName}[${index}]`);
      if (seen.has(name)) fail(`Duplicate item name "${name}" in ${menuName}`);
      seen.add(name);
      const price = Number(item.price);
      if (!Number.isFinite(price) || price < 0) fail(`Invalid price for "${name}" in ${menuName}`);
      const out = { name, price: Math.round(price * 100) / 100 };
      if (item.image != null && String(item.image).trim() !== "") {
        const image = String(item.image).trim().replace(/\\/g, "/");
        if (image.includes("..") || !image.startsWith("images/")) fail(`Image path for "${name}" must be under images/`);
        out.image = image;
      }
      if (item.scale != null && item.scale !== "") {
        const scale = Number(item.scale);
        if (!Number.isInteger(scale) || scale < 1 || scale > 10) fail(`Scale for "${name}" must be an integer 1–10`);
        out.scale = scale;
      }
      if (item.color != null && String(item.color).trim() !== "") out.color = String(item.color).trim();
      return out;
    });
  }
  const names = Object.keys(menus);
  let defaultMenu = body.defaultMenu != null ? String(body.defaultMenu).trim() : "";
  if (!defaultMenu || !names.includes(defaultMenu)) defaultMenu = names[0] || "Menu A";
  return { defaultMenu, menus };
}
