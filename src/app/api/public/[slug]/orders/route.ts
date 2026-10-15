import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { featuresOf } from "@/lib/entitlements";
import { createOrder, parseOrderInput, settleOrder, startOnlinePayment } from "@/lib/orders";
import { cancelHeldOrder, createPosRequest, posOnline } from "@/lib/pos";
import { hasAny, type Settings } from "@/lib/plans";

export const originOf = (req: Request) => {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
};

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug));
    if (!biz || biz.isSuspended) throw new HttpError(404, "کسب‌وکار پیدا نشد");
    const features = await featuresOf(biz);
    const can = (k: string) => hasAny(features, k);
    if (!biz.acceptOrders) throw new HttpError(403, "سفارش‌گیری آنلاین فعلاً غیرفعال است");
    const raw = await readJson(req);
    const input = parseOrderInput(raw);
    const kiosk = raw.kiosk === true;
    const st = (biz.settings ?? {}) as Settings;
    input.appendTo = null;
    input.waiterId = null;
    input.payNow = null;
    if (kiosk) {
      if (!can("kiosk")) throw new HttpError(403, "سفارش‌گیر کیوسک در پلن این رستوران فعال نیست");
      if (input.type === "delivery") throw new HttpError(400, "کیوسک سفارش ارسال نمی‌پذیرد");
      input.scheduledFor = null;
    } else if (input.type === "delivery") {
      if (!can("delivery_order")) throw new HttpError(403, "سفارش دلیوری فعال نیست");
    } else if (!can("self_order")) {
      throw new HttpError(403, "ثبت سفارش توسط مشتری در پلن این کسب‌وکار فعال نیست");
    }
    const pay = input.payment ?? "cash";
    if (!["cash", "ipg", "pos"].includes(pay)) throw new HttpError(400, "این روش پرداخت پشتیبانی نمی‌شود");
    if (pay === "ipg" && !(can("ipg") && st.ipg?.merchantId)) throw new HttpError(403, "پرداخت آنلاین فعال نیست");
    if (pay === "pos") {
      if (!kiosk) throw new HttpError(403, "پرداخت با کارتخوان فقط در کیوسک فعال است");
      if (!can("tablet_pos") || !st.kiosk?.allowPos) throw new HttpError(403, "پرداخت با کارتخوان در کیوسک فعال نیست");
      if (!(await posOnline(biz.id, st.kiosk.posDeviceId))) throw new HttpError(503, "کارتخوان در دسترس نیست؛ لطفاً در صندوق پرداخت کنید");
    }

    const order = await createOrder(biz, input, kiosk ? "kiosk" : "customer", features, { hold: pay !== "cash" });
    let payUrl: string | null = null;
    let pos: { id: number; token: string } | null = null;
    try {
      if (order.total === 0 && order.cashbackUsed > 0) await settleOrder(biz, features, order.id, "cashback", false);
      else if (pay === "ipg") payUrl = await startOnlinePayment(biz, order.id, order.total, pay, originOf(req));
      else if (pay === "pos") {
        const { req: pr } = await createPosRequest(biz, order.id, st.kiosk?.posDeviceId);
        pos = { id: pr.id, token: pr.token };
      }
    } catch (e) {
      await cancelHeldOrder(biz, order.id);
      throw e;
    }
    return Response.json({ item: { id: order.id, number: order.number, total: order.total, payUrl, pos } }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
