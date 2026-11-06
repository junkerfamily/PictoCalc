import { json, checkAdmin, readConfig, validateConfig } from "../_lib.js";

export async function onRequestGet({ env, request }) {
  try {
    return json(await readConfig(env, request));
  } catch (err) {
    return json({ error: "Failed to read config" }, 500);
  }
}

export async function onRequestPut({ env, request }) {
  const denied = checkAdmin(request, env);
  if (denied) return denied;
  try {
    const validated = validateConfig(await request.json());
    // Back up the current config, keep the newest 10.
    const current = await env.PICTO.get("config");
    if (current) {
      await env.PICTO.put(`backup:${new Date().toISOString()}`, current);
      const { keys } = await env.PICTO.list({ prefix: "backup:" });
      const old = keys.map((k) => k.name).sort().slice(0, -10);
      await Promise.all(old.map((k) => env.PICTO.delete(k)));
    }
    await env.PICTO.put("config", JSON.stringify(validated));
    return json({ success: true });
  } catch (err) {
    return json({ error: err.message || "Failed to save config" }, err.statusCode || 500);
  }
}
