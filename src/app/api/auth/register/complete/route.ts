import { randomBytes } from "node:crypto";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { affiliates, businesses, otpChallenges, trialGrants, users } from "@/db/schema";
import { createSession, errorResponse, hashPassword, HttpError, readJson } from "@/lib/auth";
import { getSetting } from "@/lib/app-settings";
import { getPlanOverrides } from "@/lib/entitlements";
import { resolveFeatures } from "@/lib/plans";
import { recordPlatformEvent } from "@/lib/platform-events";
import { enforceRateLimit } from "@/lib/rate-limit";
import { REGISTRATION_FLOW_COOKIE, REGISTRATION_FLOW_TTL_MS, verifyRegistrationFlow } from "@/lib/registration-flow";
import { trialDurationDays } from "@/lib/trial-policy";
import { seedBusinessMenuTemplate } from "@/lib/business-menu-seed";

export async function POST(req: Request) {
  try {
    const body = await readJson(req, 8 * 1024);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const businessName = typeof body.businessName === "string" ? body.businessName.trim() : "";
    const businessType = typeof body.businessType === "string" ? body.businessType : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!name || name.length > 100 || businessName.length < 2 || businessName.length > 120)
      throw new HttpError(400, "نام و نام فروشگاه را به‌درستی وارد کنید");
    if (!["cafe", "restaurant", "fastfood", "bakery", "shop"].includes(businessType))
      throw new HttpError(400, "نوع کسب‌وکار را انتخاب کنید");
    if (address.length > 240) throw new HttpError(400, "نشانی فروشگاه حداکثر باید ۲۴۰ نویسه باشد");

    const jar = await cookies();
    const flow = verifyRegistrationFlow(jar.get(REGISTRATION_FLOW_COOKIE)?.value, process.env.OTP_SECRET ?? "");
    if (!flow) throw new HttpError(401, "مهلت ثبت‌نام تمام شده است؛ شماره تلفن را دوباره تأیید کنید");
    await enforceRateLimit(req, "auth-register-complete", flow.challengeId, 10, REGISTRATION_FLOW_TTL_MS);
    const [challenge] = await db.select().from(otpChallenges).where(and(
      eq(otpChallenges.id, flow.challengeId),
      eq(otpChallenges.purpose, "register"),
      isNotNull(otpChallenges.consumedAt),
      gt(otpChallenges.consumedAt, new Date(Date.now() - REGISTRATION_FLOW_TTL_MS)),
    )).limit(1);
    if (!challenge) throw new HttpError(401, "احراز شماره کامل نیست یا مهلت آن پایان یافته است؛ دوباره کد درخواست کنید");

    const [alreadyRegistered] = await db.select({ id: users.id }).from(users).where(eq(users.phone, challenge.phone)).limit(1);
    if (alreadyRegistered) throw new HttpError(409, "این شماره قبلاً حساب کاربری دارد؛ وارد شوید");

    const referralCode = jar.get("affiliate_ref")?.value?.toUpperCase();
    const [affiliate] = referralCode ? await db.select({ id: affiliates.id }).from(affiliates).where(and(eq(affiliates.referralCode, referralCode), eq(affiliates.status, "active"))) : [];
    const policy = await getSetting<{ enabled?: boolean; durationDays?: number }>("trialPolicy", { enabled: true, durationDays: 14 });
    const durationDays = trialDurationDays(policy.durationDays);
    const trialPlan = "premium_plus";
    const featureSnapshot = resolveFeatures(trialPlan, null, await getPlanOverrides());

    const created = await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      const [user] = await tx.insert(users).values({
        name,
        phone: challenge.phone,
        email: `phone+${challenge.phone}@phone.menudigital.ir`,
        passwordHash: hashPassword(randomBytes(32).toString("hex")),
      }).onConflictDoNothing({ target: users.phone }).returning();
      if (!user) throw new HttpError(409, "این شماره در همین زمان ثبت‌نام شده است؛ وارد شوید");
      const [business] = await tx.insert(businesses).values({
        userId: user.id,
        affiliateId: affiliate?.id ?? null,
        name: businessName,
        type: businessType,
        phone: challenge.phone,
        address,
        slug: `shop-${randomBytes(6).toString("hex")}`,
        description: "به منوی دیجیتال ما خوش آمدید!",
        plan: "pending",
      }).returning({ id: businesses.id });
      await seedBusinessMenuTemplate(tx, business.id, businessType);
      const startsAt = new Date();
      await tx.insert(trialGrants).values({
        businessId: business.id,
        plan: trialPlan,
        startsAt,
        endsAt: new Date(startsAt.getTime() + durationDays * 86_400_000),
        featureSetVersion: `trial-v1:${trialPlan}`,
        featureSnapshot,
        status: "active",
      });
      return user;
    });

    await createSession(created.id);
    jar.set(REGISTRATION_FLOW_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth", maxAge: 0 });
    await recordPlatformEvent("signup_complete").catch(() => false);
    return Response.json({ ok: true, admin: false, trialGranted: true, trialPlan, trialDays: durationDays });
  } catch (error) {
    return errorResponse(error);
  }
}
