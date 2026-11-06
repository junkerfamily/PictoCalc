// Anyone asking for /config.json gets the saved copy, not the bundled seed.
import { json, readConfig } from "./_lib.js";

export async function onRequestGet({ env, request }) {
  return json(await readConfig(env, request));
}
