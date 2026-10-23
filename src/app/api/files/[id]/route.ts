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
  const headers = new Headers({ "Content-Type": f.mime, "Cache-Control": "public, max-age=31536000, immutable", ETag: `"${id}"`, "X-Content-Type-Options": "nosniff" });
  const range = req.headers.get("range");
  if (f.mime.startsWith("video/") && range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${f.size}`, "Accept-Ranges": "bytes" } });
    const start = match[1] ? Number(match[1]) : Math.max(0, f.size - Number(match[2]));
    const requestedEnd = match[2] ? Number(match[2]) : f.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= f.size || requestedEnd < start) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${f.size}`, "Accept-Ranges": "bytes" } });
    }
    const end = Math.min(requestedEnd, f.size - 1);
    const bytes = f.data.subarray(start, end + 1);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Range", `bytes ${start}-${end}/${f.size}`);
    headers.set("Content-Length", String(bytes.length));
    return new Response(new Uint8Array(bytes), { status: 206, headers });
  }
  if (f.mime.startsWith("video/")) headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(f.size));
  return new Response(new Uint8Array(f.data), { headers });
}
