// Serves pictures uploaded through the admin page.
export async function onRequestGet({ env, params }) {
  const { value, metadata } = await env.PICTO.getWithMetadata(`img:${params.name}`, "arrayBuffer");
  if (!value) return new Response("Not found", { status: 404 });
  return new Response(value, {
    headers: {
      "Content-Type": metadata?.type || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
