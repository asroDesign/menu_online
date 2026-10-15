import { eq } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";

/** Public (menu images). Ids are random and unguessable; content is immutable so it is cached for a year. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{24}$/.test(id)) return new Response("not found", { status: 404 });
  if (req.headers.get("if-none-match") === `"${id}"`) return new Response(null, { status: 304 });
  const [f] = await db.select().from(uploads).where(eq(uploads.id, id));
  if (!f) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.mime, "Content-Length": String(f.size), "Cache-Control": "public, max-age=31536000, immutable", ETag: `"${id}"`, "X-Content-Type-Options": "nosniff" } });
}
