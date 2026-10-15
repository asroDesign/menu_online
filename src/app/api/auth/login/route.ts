import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, errorResponse, HttpError, readJson, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const b = await readJson(req);
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
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
