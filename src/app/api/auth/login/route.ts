import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, errorResponse, HttpError, readJson, verifyPassword } from "@/lib/auth";
import { DEMO_ENABLED, DEMO_LOGIN_EMAILS } from "@/lib/demo-mode";

export async function POST(req: Request) {
  try {
    const b = await readJson(req);
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    if (!DEMO_ENABLED && DEMO_LOGIN_EMAILS.has(email) && ["demo1234", "admin1234"].includes(password))
      throw new HttpError(401, "حساب‌های آزمایشی غیرفعال هستند");
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || !verifyPassword(password, user.passwordHash))
      throw new HttpError(401, "ایمیل یا رمز عبور اشتباه است");
    if (!user.isActive) throw new HttpError(403, "این حساب کاربری غیرفعال شده است");
    await createSession(user.id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
