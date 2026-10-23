import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { businesses, customers, orders, otpChallenges } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { publicCustomerData } from "@/lib/public-customer-data";
import { createPublicCustomerSession } from "@/lib/public-customer-session";
import { getPublicMenu } from "@/lib/public-menu";
import { enforceRateLimit } from "@/lib/rate-limit";
import { verifyOtp } from "@/lib/platform-sms";
import { canAttachReferral, normalizeReferralCode } from "@/lib/customer-analytics-core";

type Context = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Context) {
  try {
    const { slug } = await params;
    const [business] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug)).limit(1);
    if (!business) throw new HttpError(404, "منو پیدا نشد");
    const body = await readJson(req);
    const challengeId = String(body.challengeId ?? "").slice(0, 64);
    const code = String(body.code ?? "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const referralCode = normalizeReferralCode(body.referralCode);
    if (!challengeId || !/^\d{6}$/.test(code)) throw new HttpError(400, "کد شش‌رقمی را وارد کنید");
    if (referralCode === null) throw new HttpError(400, "کد معرفی معتبر نیست");
    await enforceRateLimit(req, "customer-otp-verify-ip", String(business.id), 40, 15 * 60_000);
    await enforceRateLimit(req, "customer-otp-verify", `${business.id}:${challengeId}`, 8, 15 * 60_000);
    if (!await getPublicMenu(slug)) throw new HttpError(404, "منو پیدا نشد");
    const [pending] = await db.select().from(otpChallenges).where(eq(otpChallenges.id, challengeId)).limit(1);
    if (!pending || pending.purpose !== `customer:${business.id}`) throw new HttpError(400, "کد اعتبارسنجی معتبر نیست یا منقضی شده است");
    const [referrer] = referralCode ? await db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.businessId, business.id), eq(customers.referralCode, referralCode))).limit(1) : [];
    if (referralCode && !referrer) throw new HttpError(400, "کد معرفی در این رستوران پیدا نشد");
    const verified = await verifyOtp(challengeId, code);
    const customerId = await db.transaction(async (tx) => {
      const [created] = await tx.insert(customers).values({
        businessId: business.id,
        name: name || "مشتری",
        phone: verified.phone,
        smsOptIn: false,
        referredByCustomerId: referrer?.id ?? null,
      }).onConflictDoNothing({ target: [customers.businessId, customers.phone] }).returning({ id: customers.id });
      const [customer] = created ? [{ id: created.id, referredByCustomerId: referrer?.id ?? null }] : await tx.select({ id: customers.id, referredByCustomerId: customers.referredByCustomerId })
        .from(customers).where(and(eq(customers.businessId, business.id), eq(customers.phone, verified.phone))).for("update").limit(1);
      if (!customer) throw new HttpError(500, "حساب مشتری ایجاد نشد؛ دوباره تلاش کنید");
      if (!created && referrer) {
        const [previousPurchase] = await tx.select({ id: orders.id }).from(orders).where(and(
          eq(orders.businessId, business.id), eq(orders.customerId, customer.id),
          eq(orders.status, "paid"), eq(orders.paymentStatus, "paid"), isNull(orders.deletedAt),
        )).limit(1);
        if (canAttachReferral({
          customerId: customer.id,
          referrerId: referrer.id,
          currentReferrerId: customer.referredByCustomerId,
          hasPaidOrders: !!previousPurchase,
        })) {
          await tx.update(customers).set({ referredByCustomerId: referrer.id })
            .where(and(eq(customers.id, customer.id), eq(customers.businessId, business.id), isNull(customers.referredByCustomerId)));
        }
      }
      return customer.id;
    });
    await createPublicCustomerSession({ slug, businessId: business.id, customerId });
    const profile = await publicCustomerData(business.id, customerId);
    return Response.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
