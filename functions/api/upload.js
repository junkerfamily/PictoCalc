// Saves an item picture. The admin page shrinks it to 1200px in the browser
// first (Workers can't run sharp), so this only checks and stores it.
import { json, checkAdmin } from "../_lib.js";

const MAX_BYTES = 12 * 1024 * 1024;
const TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

export async function onRequestPost({ env, request }) {
  const denied = checkAdmin(request, env);
  if (denied) return denied;
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!file || typeof file === "string") return json({ error: "No image file provided" }, 400);
    const ext = TYPES[file.type];
    if (!ext) return json({ error: "Only JPEG, PNG, WebP, or GIF images are allowed" }, 400);
    if (file.size > MAX_BYTES) return json({ error: "Image is too large (12 MB max)" }, 400);

    const base = String(file.name || "item").replace(/\.[^.]+$/, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
    const filename = `${base}-${Date.now().toString(36)}${ext}`;
    await env.PICTO.put(`img:${filename}`, await file.arrayBuffer(), { metadata: { type: file.type } });

    const n = (k) => Number(form.get(k)) || undefined;
    return json({
      path: `images/uploads/${filename}`,
      width: n("width"), height: n("height"),
      resized: form.get("resized") === "1",
      originalWidth: n("originalWidth"), originalHeight: n("originalHeight"),
    });
  } catch (err) {
    return json({ error: err.message || "Failed to save image" }, 500);
  }
}
