import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { affiliates, businesses, users } from "@/db/schema";
import { createSession, errorResponse, hashPassword, HttpError, readJson } from "@/lib/auth";
import { verifyOtp } from "@/lib/platform-sms";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const b = await readJson(req);
    const id = String(b.challengeId ?? "").slice(0, 64);
    const code = String(b.code ?? "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
    if (!id || !/^\d{6}$/.test(code)) throw new HttpError(400, "کد شش‌رقمی را وارد کنید");
    await enforceRateLimit(req, "otp-verify", id, 8, 15 * 60_000);
    const challenge = await verifyOtp(id, code);
    let user: typeof users.$inferSelect | undefined;
    if (challenge.purpose === "register") {
      const referralCode = (await cookies()).get("affiliate_ref")?.value?.toUpperCase();
      const [affiliate] = referralCode ? await db.select({ id: affiliates.id }).from(affiliates).where(and(eq(affiliates.referralCode, referralCode), eq(affiliates.status, "active"))) : [];
      const result = await db.transaction(async (tx) => {
        const [created] = await tx.insert(users).values({ name: challenge.name, phone: challenge.phone, email: `phone+${challenge.phone}@phone.menudigital.ir`, passwordHash: hashPassword(randomBytes(32).toString("hex")) }).returning();
        await tx.insert(businesses).values({ userId: created.id, affiliateId: affiliate?.id ?? null, name: challenge.businessName, slug: `shop-${randomBytes(4).toString("hex")}`, description: "به منوی دیجیتال ما خوش آمدید!", plan: "pending" });
        return created;
      });
      user = result;
    } else {
      [user] = await db.select().from(users).where(eq(users.phone, challenge.phone)).limit(1);
      if (!user) throw new HttpError(404, "حسابی با این شماره پیدا نشد");
      if (!user.isActive) throw new HttpError(403, "این حساب کاربری غیرفعال شده است");
    }
    await createSession(user.id);
    return Response.json({ ok: true, admin: user.role === "admin" });
  } catch (e) { return errorResponse(e); }
}
