import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { businesses, otpChallenges, users } from "@/db/schema";
import { createSession, errorResponse, HttpError, readJson } from "@/lib/auth";
import { verifyOtp } from "@/lib/platform-sms";
import { enforceRateLimit } from "@/lib/rate-limit";
import { REGISTRATION_FLOW_COOKIE, verifyRegistrationFlow } from "@/lib/registration-flow";
import { ensurePendingBusinessTrial } from "@/lib/trial-grants";

export async function POST(req: Request) {
  try {
    const b = await readJson(req);
    const id = String(b.challengeId ?? "").slice(0, 64);
    const code = String(b.code ?? "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
    if (!id || !/^\d{6}$/.test(code)) throw new HttpError(400, "کد شش‌رقمی را وارد کنید");
    await enforceRateLimit(req, "otp-verify", id, 8, 15 * 60_000);
    const [pending] = await db.select().from(otpChallenges).where(eq(otpChallenges.id, id)).limit(1);
    if (!pending) throw new HttpError(400, "کد اعتبارسنجی معتبر نیست یا منقضی شده است");
    let registrationFlow: ReturnType<typeof verifyRegistrationFlow> = null;
    if (pending.purpose === "register") {
      const jar = await cookies();
      registrationFlow = verifyRegistrationFlow(jar.get(REGISTRATION_FLOW_COOKIE)?.value, process.env.OTP_SECRET ?? "");
      if (!registrationFlow || registrationFlow.challengeId !== id) throw new HttpError(400, "فرایند ثبت‌نام معتبر نیست؛ دوباره کد درخواست کنید");
      if (pending.consumedAt && pending.consumedAt.getTime() > Date.now() - 20 * 60_000)
        return Response.json({ ok: true, registrationRequired: true });
    }
    const challenge = await verifyOtp(id, code);
    if (challenge.purpose === "register") return Response.json({ ok: true, registrationRequired: true });
    let user: typeof users.$inferSelect | undefined;
    [user] = await db.select().from(users).where(eq(users.phone, challenge.phone)).limit(1);
    if (!user) throw new HttpError(404, "حسابی با این شماره پیدا نشد");
    if (!user.isActive) throw new HttpError(403, "این حساب کاربری غیرفعال شده است");
    const [ownedBusiness] = await db.select({ id: businesses.id, plan: businesses.plan }).from(businesses)
      .where(eq(businesses.userId, user.id)).limit(1);
    const recoveredTrial = ownedBusiness?.plan === "pending"
      ? await ensurePendingBusinessTrial(ownedBusiness.id)
      : { granted: false, durationDays: 0 };
    await createSession(user.id);
    const jar = await cookies();
    jar.set(REGISTRATION_FLOW_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth", maxAge: 0 });
    return Response.json({ ok: true, admin: user.role === "admin", trialGranted: recoveredTrial.granted });
  } catch (e) { return errorResponse(e); }
}
