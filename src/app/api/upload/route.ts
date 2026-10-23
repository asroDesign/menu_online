import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { HttpError, withAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const MAX_IMAGE = 2_500_000;
const MAX_VIDEO = 20_000_000;
const MAX_VIDEO_STORAGE = 100_000_000;
const MAX_FILES = 400;

async function readUpload(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_VIDEO) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, "حجم فایل بیشتر از ۲۰ مگابایت است");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size);
}

function sniff(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.length > 6 && b.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (b.length > 12 && b.subarray(4, 8).toString("latin1") === "ftyp") return "video/mp4";
  if (b.length > 4 && b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  return null;
}

/** Raw image or short product-video bytes in the request body. */
export const POST = withAuth(
  async (req, { business }) => {
    await enforceRateLimit(req, "business-upload", String(business.id), 20, 60 * 60_000, false);
    const buf = await readUpload(req);
    if (buf.length === 0) throw new HttpError(400, "فایلی ارسال نشد");
    const mime = sniff(buf);
    if (!mime) throw new HttpError(400, "فقط تصویر JPG، PNG، WebP، GIF یا ویدیوی MP4 و WebM مجاز است");
    if (mime.startsWith("video/") && buf.length > MAX_VIDEO) throw new HttpError(413, "حجم ویدیو بیشتر از ۲۰ مگابایت است");
    if (mime.startsWith("image/") && buf.length > MAX_IMAGE) throw new HttpError(413, "حجم تصویر بیشتر از ۲٫۵ مگابایت است");
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(uploads).where(eq(uploads.businessId, business.id));
    if (c.n >= MAX_FILES) throw new HttpError(400, "سقف تعداد فایل‌های بارگذاری‌شده پر شده است؛ تصاویر بلااستفاده را حذف کنید");
    if (mime.startsWith("video/")) {
      const [videoStorage] = await db.select({ size: sql<number>`coalesce(sum(${uploads.size}), 0)::int` }).from(uploads)
        .where(and(eq(uploads.businessId, business.id), sql`${uploads.mime} LIKE 'video/%'`));
      if (videoStorage.size + buf.length > MAX_VIDEO_STORAGE) throw new HttpError(413, "سقف فضای ویدیوی این کسب‌وکار ۱۰۰ مگابایت است؛ یک ویدیو را حذف کنید");
    }
    const id = randomBytes(12).toString("hex");
    await db.insert(uploads).values({ id, businessId: business.id, mime, size: buf.length, data: buf });
    return Response.json({ url: `/api/files/${id}`, size: buf.length, mime }, { status: 201 });
  },
  { manager: true },
);
