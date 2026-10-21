import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, errorResponse, HttpError, readJson, verifyPassword } from "@/lib/auth";
import { DEMO_LOGIN_EMAILS } from "@/lib/demo-mode";
import { enforceRateLimit } from "@/lib/rate-limit";

const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

export async function POST(req: Request) {
  try {
    const b = await readJson(req, 16 * 1024);
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    if (email.length > 254 || password.length > 1024) throw new HttpError(400, "اطلاعات ورود بیش از حد مجاز است");
    await enforceRateLimit(req, "auth-login-account", email || "invalid", 20, 15 * 60_000, false);
    await enforceRateLimit(req, "auth-login-address", "all", 60, 60_000);
    const demoBlocked = DEMO_LOGIN_EMAILS.has(email);
    const [user] = await db.select().from(users).where(eq(users.email, email));
    const passwordValid = verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !passwordValid || !user.isActive || demoBlocked)
      throw new HttpError(401, "ایمیل یا رمز عبور اشتباه است");
    await createSession(user.id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
