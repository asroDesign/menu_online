import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { affiliates, businesses, users } from "@/db/schema";
import { createSession, errorResponse, hashPassword, HttpError, readJson } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const b = await readJson(req);
    const name = String(b.name ?? "").trim();
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    const businessName = String(b.businessName ?? "").trim();
    if (!name || !businessName) throw new HttpError(400, "نام و نام کسب‌وکار را وارد کنید");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "ایمیل معتبر نیست");
    if (password.length < 6) throw new HttpError(400, "رمز عبور باید حداقل ۶ کاراکتر باشد");
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (exists) throw new HttpError(409, "این ایمیل قبلاً ثبت‌نام کرده است");

    const [user] = await db
      .insert(users)
      .values({ name, email, passwordHash: hashPassword(password) })
      .returning();
    const referralCode = (await cookies()).get("affiliate_ref")?.value?.toUpperCase();
    const [affiliate] = referralCode ? await db.select({ id: affiliates.id }).from(affiliates).where(and(eq(affiliates.referralCode, referralCode), eq(affiliates.status, "active"))) : [];
    await db.insert(businesses).values({
      userId: user.id,
      affiliateId: affiliate?.id ?? null,
      name: businessName,
      slug: `shop-${randomBytes(3).toString("hex")}`,
      description: "به منوی دیجیتال ما خوش آمدید!",
    });
    await createSession(user.id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
