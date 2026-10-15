import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { HttpError, withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
const MAX = 2_500_000;
const MAX_FILES = 400;

function sniff(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.length > 6 && b.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  return null;
}

/** Raw image bytes in the request body (the browser already resizes/compresses before sending). */
export const POST = withAuth(
  async (req, { business }) => {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0) throw new HttpError(400, "فایلی ارسال نشد");
    if (buf.length > MAX) throw new HttpError(413, "حجم تصویر بیشتر از ۲٫۵ مگابایت است");
    const mime = sniff(buf);
    if (!mime) throw new HttpError(400, "فقط تصویر JPG، PNG، WebP یا GIF مجاز است");
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(uploads).where(eq(uploads.businessId, business.id));
    if (c.n >= MAX_FILES) throw new HttpError(400, "سقف تعداد فایل‌های بارگذاری‌شده پر شده است؛ تصاویر بلااستفاده را حذف کنید");
    const id = randomBytes(12).toString("hex");
    await db.insert(uploads).values({ id, businessId: business.id, mime, size: buf.length, data: buf });
    return Response.json({ url: `/api/files/${id}`, size: buf.length, mime }, { status: 201 });
  },
  { manager: true },
);
