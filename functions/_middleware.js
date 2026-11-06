// Password-protect the admin page, like server.js did.
import { checkAdmin } from "./_lib.js";

export async function onRequest({ request, env, next }) {
  const path = new URL(request.url).pathname;
  if (path === "/admin.html" || path === "/admin") {
    const denied = checkAdmin(request, env);
    if (denied) return denied;
  }
  return next();
}
