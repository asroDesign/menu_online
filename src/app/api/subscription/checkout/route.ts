import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { couponRedemptions, promoCoupons, subscriptionInvoices, subscriptionPayments, users } from "@/db/schema";
import { withAuth, HttpError } from "@/lib/auth";
import { subscriptionQuote } from "@/lib/subscription-checkout";
import { settleSubscriptionInvoice } from "@/lib/admin-api";
import { notifyPlatformManager } from "@/lib/platform-sms";
import { planName } from "@/lib/plans";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, { business, user }) => {
  const b = await req.json().catch(() => ({}));
  const result = await db.transaction(async (tx) => {
    const quote = await subscriptionQuote(b.plan, b.months, b.couponCode, true, tx, business.id);
    if (quote.amount === 0 && (!quote.couponCode || quote.couponDiscount <= 0))
      throw new HttpError(400, "این پلن مبلغ قابل پرداخت دارد؛ برای فعال‌سازی از درگاه پرداخت استفاده کنید");
    const reusableWhere = quote.couponCode
      ? and(eq(subscriptionInvoices.businessId, business.id), eq(subscriptionInvoices.status, "unpaid"), eq(subscriptionInvoices.plan, quote.plan), eq(subscriptionInvoices.months, quote.months), eq(subscriptionInvoices.couponCode, quote.couponCode), gte(subscriptionInvoices.createdAt, new Date(Date.now() - 24 * 60 * 60_000)))
      : and(eq(subscriptionInvoices.businessId, business.id), eq(subscriptionInvoices.status, "unpaid"), eq(subscriptionInvoices.plan, quote.plan), eq(subscriptionInvoices.months, quote.months), eq(subscriptionInvoices.note, "خرید آنلاین اشتراک"));
    const [existing] = await tx.select().from(subscriptionInvoices).where(reusableWhere).orderBy(desc(subscriptionInvoices.id)).limit(1).for("update");
    if (existing) return { invoice: existing, created: false };
    if (quote.couponCode) {
      const [coupon] = await tx.select().from(promoCoupons).where(eq(promoCoupons.code, quote.couponCode)).for("update");
      if (coupon) {
        const prior = await tx.select({ invoiceId: couponRedemptions.invoiceId }).from(couponRedemptions).innerJoin(subscriptionInvoices, eq(subscriptionInvoices.id, couponRedemptions.invoiceId)).where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.businessId, business.id), eq(couponRedemptions.status, "reserved"), eq(subscriptionInvoices.status, "unpaid"))).for("update");
        for (const reserved of prior) {
          const [active] = await tx.select({ id: subscriptionPayments.id }).from(subscriptionPayments).where(and(eq(subscriptionPayments.invoiceId, reserved.invoiceId), eq(subscriptionPayments.status, "pending"), sql`${subscriptionPayments.createdAt} >= now() - interval '30 minutes'`)).limit(1);
          if (active) throw new HttpError(409, "برای فاکتور قبلی با همین کد تخفیف پرداخت در حال انجام است؛ ابتدا آن را تکمیل کنید");
          await tx.update(subscriptionInvoices).set({ status: "void" }).where(and(eq(subscriptionInvoices.id, reserved.invoiceId), eq(subscriptionInvoices.status, "unpaid")));
          await tx.update(couponRedemptions).set({ status: "released" }).where(and(eq(couponRedemptions.invoiceId, reserved.invoiceId), eq(couponRedemptions.status, "reserved")));
          await tx.update(subscriptionPayments).set({ status: "failed", detail: "فاکتور جایگزین شد" }).where(and(eq(subscriptionPayments.invoiceId, reserved.invoiceId), eq(subscriptionPayments.status, "pending")));
        }
      }
    }
    const [mx] = await tx.select({ number: sql<number>`coalesce(max(${subscriptionInvoices.number}),1000)::int` }).from(subscriptionInvoices);
    const [row] = await tx.insert(subscriptionInvoices).values({ number: mx.number + 1, businessId: business.id, plan: quote.plan, months: quote.months, amount: quote.amount, discount: quote.termDiscount + quote.couponDiscount, couponCode: quote.couponCode, note: quote.couponCode ? `کد تخفیف ${quote.couponCode}` : "خرید آنلاین اشتراک", createdBy: user.name }).returning();
    if (quote.couponCode) {
      const [coupon] = await tx.select().from(promoCoupons).where(eq(promoCoupons.code, quote.couponCode)).for("update");
      if (coupon) await tx.insert(couponRedemptions).values({ couponId: coupon.id, invoiceId: row.id, businessId: business.id, discount: quote.couponDiscount, status: "reserved" });
    }
    return { invoice: row, created: true };
  });
  const invoice = result.invoice;
  if (result.created) {
    const [owner] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, business.userId)).limit(1);
    await notifyPlatformManager({ kind: "plan_request", name: business.name, phone: business.phone || owner?.phone || "", details: `${planName(invoice.plan)} · ${invoice.months} ماهه · فاکتور #${invoice.number}` });
  }
  if (invoice.amount === 0) {
    const item = await settleSubscriptionInvoice(invoice.id, "coupon", "");
    return Response.json({ item, paid: true }, { status: 201 });
  }
  return Response.json({ item: invoice, paid: false }, { status: 201 });
}, { manager: true, allowUnpaid: true });
