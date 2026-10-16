import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { adminCan, HttpError, withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
const IMAGE_MAX = 2_500_000;
const VIDEO_MAX = 50_000_000;

function sniff(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.length > 6 && b.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (b.length > 12 && b.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  if (b.length > 4 && b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  return null;
}

export const POST = withAuth(async (req, auth) => {
  if (!adminCan(auth, "content")) throw new HttpError(403, "دسترسی مدیریت محتوا ندارید");
  const buffer = Buffer.from(await req.arrayBuffer());
  if (!buffer.length) throw new HttpError(400, "فایلی ارسال نشد");
  const mime = sniff(buffer);
  if (!mime) throw new HttpError(400, "فرمت فایل پشتیبانی نمی‌شود؛ JPG، PNG، WebP، GIF، MP4 یا WebM مجاز است");
  const max = mime.startsWith("video/") ? VIDEO_MAX : IMAGE_MAX;
  if (buffer.length > max) throw new HttpError(413, mime.startsWith("video/") ? "حجم ویدیو حداکثر ۵۰ مگابایت است" : "حجم تصویر حداکثر ۲٫۵ مگابایت است");
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(uploads).where(eq(uploads.businessId, auth.business.id));
  if (count.n >= 400) throw new HttpError(400, "ظرفیت فایل‌های پنل پر شده است");
  const id = randomBytes(12).toString("hex");
  await db.insert(uploads).values({ id, businessId: auth.business.id, mime, size: buffer.length, data: buffer });
  return Response.json({ url: `/api/files/${id}`, size: buffer.length, mime }, { status: 201 });
}, { admin: true });
