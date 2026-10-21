/** Shared demo sessions can mutate tenant data; public demo login is intentionally retired. */
export async function POST() {
  return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
