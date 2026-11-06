import { json, checkAdmin } from "../_lib.js";

export async function onRequestGet({ env, request }) {
  const denied = checkAdmin(request, env);
  if (denied) return denied;
  const { keys } = await env.PICTO.list({ prefix: "backup:" });
  return json({ backups: keys.map((k) => k.name.slice(7)).sort().reverse() });
}
