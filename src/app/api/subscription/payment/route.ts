import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, couponRedemptions, subscriptionInvoices, subscriptionPayments } from "@/db/schema";
import { withAuth, HttpError } from "@/lib/auth";
import { recordPlatformEvent } from "@/lib/platform-events";

export const dynamic = "force-dynamic";
type PaymentsConfig = { zarinpalEnabled: boolean; zarinpalMerchantId: string; zibalEnabled: boolean; zibalMerchantId: string };
const settings = async () => { const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "platformPayments")); return (row?.value ?? {}) as PaymentsConfig; };
function origin(req: Request) {
  const h = req.headers; const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export const POST = withAuth(async (req, { business }) => {
  const body = await req.json().catch(() => ({}));
  const invoiceId = Number(body.invoiceId);
  const provider = String(body.provider ?? "");
  if (!Number.isInteger(invoiceId) || !["zarinpal", "zibal"].includes(provider)) throw new HttpError(400, "درگاه یا فاکتور معتبر نیست");
  const [invoice] = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.id, invoiceId));
  if (!invoice || invoice.businessId !== business.id) throw new HttpError(404, "فاکتور پیدا نشد");
  if (invoice.couponCode && invoice.createdAt.getTime() < Date.now() - 24 * 60 * 60_000) {
    await db.update(couponRedemptions).set({ status: "released" }).where(eq(couponRedemptions.invoiceId, invoice.id));
    throw new HttpError(400, "مهلت این فاکتور تخفیف‌دار پایان یافته است؛ لطفاً فاکتور جدید بسازید");
  }
  if (invoice.status !== "unpaid" || invoice.amount <= 0) throw new HttpError(400, "این فاکتور قابل پرداخت آنلاین نیست");
  await db.update(subscriptionPayments).set({ status: "failed", detail: "مهلت پرداخت پایان یافت" }).where(and(eq(subscriptionPayments.invoiceId, invoice.id), eq(subscriptionPayments.status, "pending"), sql`${subscriptionPayments.createdAt} < now() - interval '30 minutes'`));
  const [activePayment] = await db.select({ id: subscriptionPayments.id }).from(subscriptionPayments).where(and(eq(subscriptionPayments.invoiceId, invoice.id), eq(subscriptionPayments.status, "pending"))).limit(1);
  if (activePayment) throw new HttpError(409, "برای این فاکتور یک تلاش پرداخت در حال انجام است؛ کمی بعد دوباره بررسی کنید");
  const cfg = await settings();
  if (provider === "zarinpal" && (!cfg.zarinpalEnabled || !cfg.zarinpalMerchantId)) throw new HttpError(400, "درگاه زرین‌پال فعال یا پیکربندی نشده است");
  if (provider === "zibal" && (!cfg.zibalEnabled || !cfg.zibalMerchantId)) throw new HttpError(400, "درگاه زیبال فعال یا پیکربندی نشده است");
  const id = randomUUID();
  try {
    await db.insert(subscriptionPayments).values({ id, invoiceId, provider, amount: invoice.amount });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new HttpError(409, "برای این فاکتور یک تلاش پرداخت در حال انجام است");
    throw error;
  }
  const callbackUrl = `${origin(req)}/api/subscription/callback?p=${encodeURIComponent(id)}`;
  const rial = Math.round(invoice.amount * 10);
  let definitiveFailure = false;
  try {
    let token = "", url = "";
    if (provider === "zarinpal") {
      const res = await fetch("https://payment.zarinpal.com/pg/v4/payment/request.json", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ merchant_id: cfg.zarinpalMerchantId, amount: rial, callback_url: callbackUrl, description: `تمدید اشتراک فاکتور ${invoice.number}`, metadata: { mobile: business.phone || undefined } }), signal: AbortSignal.timeout(15000) });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || Number(data?.data?.code) !== 100 || !data?.data?.authority) {
        definitiveFailure = res.status < 500;
        throw new Error(data?.errors?.message || data?.data?.message || `زرین‌پال ${res.status}`);
      }
      token = String(data.data.authority); url = `https://www.zarinpal.com/pg/StartPay/${encodeURIComponent(token)}`;
    } else {
      const res = await fetch("https://gateway.zibal.ir/v1/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ merchant: cfg.zibalMerchantId, amount: rial, callbackUrl, description: `تمدید اشتراک فاکتور ${invoice.number}`, orderId: id }), signal: AbortSignal.timeout(15000) });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || Number(data?.result) !== 100 || !data?.trackId) {
        definitiveFailure = res.status < 500;
        throw new Error(data?.message || `زیبال ${res.status}`);
      }
      token = String(data.trackId); url = `https://gateway.zibal.ir/start/${encodeURIComponent(token)}`;
    }
    await db.update(subscriptionPayments).set({ token }).where(eq(subscriptionPayments.id, id));
    await recordPlatformEvent("checkout_start").catch(() => false);
    return Response.json({ url });
  } catch (error) {
    await db.update(subscriptionPayments).set({ status: definitiveFailure ? "failed" : "pending", detail: (error as Error).message.slice(0, 300) }).where(eq(subscriptionPayments.id, id));
    throw new HttpError(502, definitiveFailure ? "درگاه درخواست پرداخت را نپذیرفت؛ تنظیمات را بررسی و دوباره تلاش کنید" : "پاسخ درگاه دریافت نشد؛ وضعیت درخواست در حال بررسی است، کمی بعد دوباره تلاش کنید");
  }
}, { manager: true, allowUnpaid: true });
