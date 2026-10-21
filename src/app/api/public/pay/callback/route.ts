import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, orders, payments } from "@/db/schema";
import { featuresOf } from "@/lib/entitlements";
import { settleOrder, verifyOnlinePayment } from "@/lib/orders";
import { cancelHeldOrder } from "@/lib/pos";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

function origin(req: Request) {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Zarinpal redirects the customer here after payment: verify with the gateway, then settle the order. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const go = (q: Record<string, string>) => Response.redirect(`${origin(req)}/pay/result?${new URLSearchParams(q)}`, 302);
  const [p] = await db.select().from(payments).where(eq(payments.id, Number(u.searchParams.get("p")) || 0));
  if (!p || p.authority !== u.searchParams.get("Authority")) return go({ ok: "0", msg: "تراکنش نامعتبر است" });
  const [biz] = await db.select().from(businesses).where(eq(businesses.id, p.businessId));
  const [o] = await db.select().from(orders).where(eq(orders.id, p.orderId));
  const base = { slug: biz.slug, n: String(o?.number ?? "") };
  if (p.status === "paid") return go({ ...base, ok: "1" });
  if (u.searchParams.get("Status") !== "OK") {
    const [failed] = await db.update(payments).set({ status: "failed" })
      .where(and(eq(payments.id, p.id), eq(payments.status, "pending"))).returning({ id: payments.id });
    if (failed) await cancelHeldOrder(biz, p.orderId);
    return go({ ...base, ok: "0", msg: "پرداخت انجام نشد یا لغو شد" });
  }
  try {
    const v = await verifyOnlinePayment(biz, p);
    if (!v.ok) {
      const [failed] = await db.update(payments).set({ status: "failed" })
        .where(and(eq(payments.id, p.id), eq(payments.status, "pending"))).returning({ id: payments.id });
      if (failed) await cancelHeldOrder(biz, p.orderId);
      return go({ ...base, ok: "0", msg: "تأیید پرداخت توسط درگاه ناموفق بود" });
    }
    await settleOrder(biz, await featuresOf(biz), p.orderId, "ipg", false, { reopen: true, paymentId: p.id, paymentRef: v.ref });
    return go({ ...base, ok: "1", ref: v.ref });
  } catch (e) {
    logError("payment.settlement_failed", e, { paymentId: p.id, orderId: p.orderId, businessId: p.businessId });
    await db.update(payments).set({
      settlementError: "تسویه سفارش پس از تأیید درگاه ناموفق بود؛ تلاش مجدد callback لازم است",
      settlementAttempts: sql`${payments.settlementAttempts} + 1`,
    }).where(and(eq(payments.id, p.id), sql`${payments.status} <> 'paid'`)).catch((logFailure) => {
      logError("payment.settlement_error_persist_failed", logFailure, { paymentId: p.id });
    });
    return go({ ...base, ok: "0", msg: "خطا در ارتباط با درگاه؛ در صورت کسر وجه با رستوران تماس بگیرید" });
  }
}
