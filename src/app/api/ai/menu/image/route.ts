import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const MAX_IMAGE_BYTES = 2_500_000;

function imageInput(value: unknown) {
  if (typeof value !== "string") throw new HttpError(400, "عکس را انتخاب کنید");
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || match[2].length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8) throw new HttpError(400, "فرمت یا اندازه عکس معتبر نیست");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, "حجم عکس باید حداکثر ۲٫۵ مگابایت باشد");
  const isPng = match[1] === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = match[1] === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = match[1] === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!isPng && !isJpeg && !isWebp) throw new HttpError(400, "محتوای تصویر با فرمت اعلام‌شده سازگار نیست");
  return { bytes, mime: match[1] };
}

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 3_800_000);
  await enforceRateLimit(req, "ai-menu-image", `${auth.business.id}:${auth.user.id}`, 8, 60 * 60_000);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 400) : "";
  const mode = body.mode;
  if (!name || !["generate", "improve"].includes(String(mode))) throw new HttpError(400, "نام محصول و نوع ساخت تصویر را کامل کنید");
  const source = mode === "improve" ? imageInput(body.imageData) : null;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new HttpError(503, "ساخت و بهبود عکس با هوش مصنوعی در دسترس نیست؛ OPENAI_API_KEY را در تنظیمات سرور قرار دهید.");
  const [usage] = await db.select({ count: sql<number>`count(*)::int` }).from(uploads).where(eq(uploads.businessId, auth.business.id));
  if (usage.count >= 400) throw new HttpError(400, "سقف تعداد فایل‌های این کسب‌وکار پر شده است؛ فایل‌های بلااستفاده را پاک کنید");
  const prompt = `Create a photorealistic restaurant menu product photo of ${name}. ${description ? `Description: ${description}.` : ""} The food should be the only hero, styled naturally on a simple clean plate, appetizing warm light, tasteful restaurant photography, close-up overhead three-quarter view, uncluttered background. No text, no watermark, no logos, no hands, no people.`;
  const endpoint = source ? "edits" : "generations";
  const requestBody = source
    ? { model: "gpt-image-2.5-sunburst", prompt, images: [{ image_url: `data:${source.mime};base64,${source.bytes.toString("base64")}` }], size: "1024x1024", quality: "medium", output_format: "webp", output_compression: 82 }
    : { model: "gpt-image-2.5-sunburst", prompt, size: "1024x1024", quality: "medium", output_format: "webp", output_compression: 82 };
  const response = await fetch(`https://api.openai.com/v1/images/${endpoint}`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new HttpError(502, "سرویس تصویر نتوانست عکس را آماده کند؛ تنظیمات سرویس را بررسی و دوباره تلاش کنید.");
  const result = await response.json().catch(() => null) as { data?: { b64_json?: string }[] } | null;
  const encoded = result?.data?.[0]?.b64_json;
  if (!encoded || encoded.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8) throw new HttpError(502, "تصویر خروجی قابل ذخیره نیست یا از سقف مجاز بزرگ‌تر است.");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new HttpError(502, "حجم تصویر خروجی بیشتر از ۲٫۵ مگابایت است.");
  const id = randomBytes(12).toString("hex");
  await db.insert(uploads).values({ id, businessId: auth.business.id, mime: "image/webp", size: bytes.length, data: bytes });
  return Response.json({ url: `/api/files/${id}`, size: bytes.length, mime: "image/webp" }, { status: 201, headers: { "Cache-Control": "no-store" } });
}, { feature: "ai", manager: true });
