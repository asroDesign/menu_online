import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, HttpError, readJson, verifyPassword, withAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

export const POST = withAuth(async (req, auth) => {
  await enforceRateLimit(req, "business-password-change", String(auth.user.id), 5, 15 * 60_000, false);
  const body = await readJson(req, 8 * 1024);
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  if (currentPassword.length > 256 || newPassword.length > 128 || confirmPassword.length > 128) throw new HttpError(400, "طول گذرواژه بیش از حد مجاز است");
  if (newPassword.length < 8) throw new HttpError(400, "گذرواژهٔ جدید باید دست‌کم ۸ نویسه باشد");
  if (newPassword !== confirmPassword) throw new HttpError(400, "تکرار گذرواژه با گذرواژهٔ جدید یکسان نیست");

  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, auth.user.id)).limit(1);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) throw new HttpError(400, "گذرواژهٔ فعلی صحیح نیست");
  if (verifyPassword(newPassword, user.passwordHash)) throw new HttpError(400, "گذرواژهٔ جدید باید با گذرواژهٔ فعلی متفاوت باشد");
  await db.update(users).set({ passwordHash: hashPassword(newPassword) }).where(eq(users.id, auth.user.id));
  return Response.json({ ok: true });
}, { manager: true });
