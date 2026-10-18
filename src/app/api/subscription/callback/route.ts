import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, subscriptionInvoices, subscriptionPayments } from "@/db/schema";
import { settleSubscriptionInvoice } from "@/lib/admin-api";

export const dynamic = "force-dynamic";
function origin(req: Request) {
  const h = req.headers; const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const u = new URL(req.url); const id = u.searchParams.get("p") ?? "";
  const go = (ok: boolean, invoice = "") => Response.redirect(`${origin(req)}/dashboard/plan?payment=${ok ? "success" : "failed"}${invoice ? `&invoice=${encodeURIComponent(invoice)}` : ""}`, 302);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return go(false);
  const [payment] = await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.id, id));
  if (!payment) return go(false);
  const [invoice] = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.id, payment.invoiceId));
  if (!invoice) return go(false);
  if (payment.status === "paid" || invoice.status === "paid") return go(true, String(invoice.number));
  const token = payment.provider === "zarinpal" ? u.searchParams.get("Authority") : u.searchParams.get("trackId");
  if (!token || token !== payment.token) return go(false, String(invoice.number));
  if (payment.provider === "zarinpal" && u.searchParams.get("Status") !== "OK") {
    await db.update(subscriptionPayments).set({ status: "failed", detail: "پرداخت توسط کاربر لغو شد" }).where(and(eq(subscriptionPayments.id, id), eq(subscriptionPayments.status, "pending")));
    return go(false, String(invoice.number));
  }
  if (payment.provider === "zibal" && (u.searchParams.get("success") !== "1" || u.searchParams.get("status") !== "2")) {
    await db.update(subscriptionPayments).set({ status: "failed", detail: "پرداخت توسط کاربر لغو شد" }).where(and(eq(subscriptionPayments.id, id), eq(subscriptionPayments.status, "pending")));
    return go(false, String(invoice.number));
  }
  const [settings] = await db.select().from(appSettings).where(eq(appSettings.key, "platformPayments"));
  const config = (settings?.value ?? {}) as Record<string, any>;
  const amount = Math.round(payment.amount * 10);
  const failPayment = async (detail: string) => db.update(subscriptionPayments).set({ status: "failed", detail: detail.slice(0, 300) }).where(and(eq(subscriptionPayments.id, id), eq(subscriptionPayments.status, "pending")));
  try {
    let refNo = "";
    if (payment.provider === "zarinpal") {
      const res = await fetch("https://payment.zarinpal.com/pg/v4/payment/verify.json", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ merchant_id: config.zarinpalMerchantId, amount, authority: payment.token }), signal: AbortSignal.timeout(15000) });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.errors?.message || data?.data?.message || `زرین‌پال پاسخ ${res.status} داد`);
      if (![100, 101].includes(Number(data?.data?.code))) {
        const detail = data?.errors?.message || data?.data?.message || "زرین‌پال پرداخت را تأیید نکرد";
        await failPayment(detail);
        return go(false, String(invoice.number));
      }
      refNo = String(data?.data?.ref_id ?? "");
    } else {
      const res = await fetch("https://gateway.zibal.ir/v1/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ merchant: config.zibalMerchantId, trackId: payment.token }), signal: AbortSignal.timeout(15000) });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `زیبال پاسخ ${res.status} داد`);
      if (![100, 201].includes(Number(data?.result)) || (data?.amount != null && Number(data.amount) !== amount)) {
        await failPayment(data?.message || "زیبال پرداخت را تأیید نکرد یا مبلغ آن با فاکتور برابر نیست");
        return go(false, String(invoice.number));
      }
      refNo = String(data?.refNumber ?? data?.paidAt ?? payment.token);
    }
    await settleSubscriptionInvoice(invoice.id, payment.provider, refNo, payment.id);
    return go(true, String(invoice.number));
  } catch (error) {
    // Network or database errors are ambiguous: keep the attempt pending so a retry cannot
    // create a second charge while the gateway may already have accepted the first request.
    await db.update(subscriptionPayments).set({ detail: `نیازمند بررسی مجدد: ${(error as Error).message}`.slice(0, 300) }).where(and(eq(subscriptionPayments.id, id), eq(subscriptionPayments.status, "pending")));
    return go(false, String(invoice.number));
  }
}
