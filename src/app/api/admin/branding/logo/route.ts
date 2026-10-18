import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { HttpError, withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
const MAX_IMAGE_SIZE = 2_500_000;

function sniffImage(buffer: Buffer): string | null {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length > 12 && buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buffer.length > 6 && buffer.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  return null;
}

export const POST = withAuth(async (req) => {
  const buffer = Buffer.from(await req.arrayBuffer());
  if (!buffer.length) throw new HttpError(400, "فایلی ارسال نشد");
  if (buffer.length > MAX_IMAGE_SIZE) throw new HttpError(413, "حجم لوگو حداکثر ۲٫۵ مگابایت است");
  const mime = sniffImage(buffer);
  if (!mime) throw new HttpError(400, "فقط تصویر JPG، PNG، WebP یا GIF مجاز است");
  const id = randomBytes(12).toString("hex");
  await db.insert(uploads).values({ id, businessId: null, mime, size: buffer.length, data: buffer });
  return Response.json({ url: `/api/files/${id}`, size: buffer.length, mime }, { status: 201 });
}, { admin: true, perm: "settings" });
