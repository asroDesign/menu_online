import { and, eq, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { couponRedemptions, promoCoupons, subscriptionInvoices } from "@/db/schema";
import { getPlanList } from "@/lib/app-settings";
import { HttpError } from "@/lib/auth";
import { PLAN_KEYS } from "@/lib/plans";
import { isBillingTerm, type BillingTerm } from "@/lib/plan-pricing";

export type SubscriptionQuote = { plan: string; months: BillingTerm; base: number; termDiscount: number; couponDiscount: number; amount: number; couponCode: string };

export async function subscriptionQuote(planInput: unknown, monthsInput: unknown, couponInput: unknown, lock = false, executor: any = db, ignoreReservedBusinessId?: number): Promise<SubscriptionQuote> {
  const plan = String(planInput ?? "");
  const months = Number(monthsInput);
  if (!PLAN_KEYS.includes(plan as never)) throw new HttpError(400, "پلن نامعتبر است");
  if (!isBillingTerm(months)) throw new HttpError(400, "دوره اشتراک باید ۱، ۳، ۶ یا ۱۲ ماهه باشد");
  const plans = await getPlanList();
  const selected = plans.find((p) => p.key === plan)!.terms[months];
  const code = String(couponInput ?? "").trim().toUpperCase().slice(0, 32);
  if (!code) return { plan, months, base: selected.base, termDiscount: selected.base - selected.total, couponDiscount: 0, amount: selected.total, couponCode: "" };
  const query = executor.select().from(promoCoupons).where(eq(promoCoupons.code, code));
  const [coupon] = lock ? await query.for("update") : await query;
  const now = new Date();
  if (!coupon || !coupon.isActive || (coupon.startsAt && coupon.startsAt > now) || (coupon.endsAt && coupon.endsAt < now)) throw new HttpError(400, "کد تخفیف نامعتبر یا منقضی شده است");
  if (coupon.planKeys.length && !coupon.planKeys.includes(plan)) throw new HttpError(400, "این کد برای پلن انتخاب‌شده قابل استفاده نیست");
  if (coupon.maxRedemptions !== null) {
    const [used] = await executor.select({ count: sql<number>`count(*)::int` }).from(couponRedemptions).innerJoin(subscriptionInvoices, eq(subscriptionInvoices.id, couponRedemptions.invoiceId)).where(and(eq(couponRedemptions.couponId, coupon.id), or(eq(couponRedemptions.status, "redeemed"), and(ne(couponRedemptions.status, "released"), ignoreReservedBusinessId ? ne(couponRedemptions.businessId, ignoreReservedBusinessId) : sql`true`, sql`${subscriptionInvoices.createdAt} >= now() - interval '24 hours'`))));
    if (Number(used.count) >= coupon.maxRedemptions) throw new HttpError(400, "ظرفیت استفاده از این کد تخفیف تکمیل شده است");
  }
  const couponDiscount = Math.min(selected.total, coupon.kind === "percent" ? Math.floor(selected.total * coupon.value / 100) : coupon.value);
  return { plan, months, base: selected.base, termDiscount: selected.base - selected.total, couponDiscount, amount: selected.total - couponDiscount, couponCode: code };
}
