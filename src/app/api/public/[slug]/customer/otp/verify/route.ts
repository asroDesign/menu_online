import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, customers, otpChallenges } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { publicCustomerData } from "@/lib/public-customer-data";
import { createPublicCustomerSession } from "@/lib/public-customer-session";
import { getPublicMenu } from "@/lib/public-menu";
import { enforceRateLimit } from "@/lib/rate-limit";
import { verifyOtp } from "@/lib/platform-sms";

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
    if (!challengeId || !/^\d{6}$/.test(code)) throw new HttpError(400, "کد شش‌رقمی را وارد کنید");
    await enforceRateLimit(req, "customer-otp-verify-ip", String(business.id), 40, 15 * 60_000);
    await enforceRateLimit(req, "customer-otp-verify", `${business.id}:${challengeId}`, 8, 15 * 60_000);
    if (!await getPublicMenu(slug)) throw new HttpError(404, "منو پیدا نشد");
    const [pending] = await db.select().from(otpChallenges).where(eq(otpChallenges.id, challengeId)).limit(1);
    if (!pending || pending.purpose !== `customer:${business.id}`) throw new HttpError(400, "کد اعتبارسنجی معتبر نیست یا منقضی شده است");
    const verified = await verifyOtp(challengeId, code);
    await db.insert(customers).values({ businessId: business.id, name: name || "مشتری", phone: verified.phone, smsOptIn: false })
      .onConflictDoNothing({ target: [customers.businessId, customers.phone] });
    const [customer] = await db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.businessId, business.id), eq(customers.phone, verified.phone))).limit(1);
    if (!customer) throw new HttpError(500, "حساب مشتری ایجاد نشد؛ دوباره تلاش کنید");
    await createPublicCustomerSession({ slug, businessId: business.id, customerId: customer.id });
    const profile = await publicCustomerData(business.id, customer.id);
    return Response.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
