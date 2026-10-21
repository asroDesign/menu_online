import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, orders, posRequests } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { featuresOf } from "@/lib/entitlements";
import { cancelHeldOrder, cancelPendingRequests, createPosRequest, expirePosRequests, POS_TIMEOUT_MS, posOnline, releaseHeldOrder } from "@/lib/pos";
import type { Settings } from "@/lib/plans";
import { isReadOnlyDemoSlug } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string; id: string }> };

async function load(ctx: Ctx, token: string) {
  const { slug, id } = await ctx.params;
  const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug));
  if (!biz) throw new HttpError(404, "پیدا نشد");
  await expirePosRequests(biz.id);
  const [r] = await db.select().from(posRequests).where(and(eq(posRequests.id, Number(id)), eq(posRequests.businessId, biz.id)));
  if (!r || !token || r.token !== token) throw new HttpError(404, "درخواست پرداخت پیدا نشد");
  const [o] = await db.select().from(orders).where(eq(orders.id, r.orderId));
  return { biz, r, o };
}

const view = (r: typeof posRequests.$inferSelect, o: typeof orders.$inferSelect) => ({
  id: r.id, status: o.paymentStatus === "paid" ? "approved" : r.status, picked: !!r.pickedAt, detail: r.detail, number: o.number, total: o.total,
  remainingSec: Math.max(0, Math.round((r.createdAt.getTime() + POS_TIMEOUT_MS - Date.now()) / 1000)), orderStatus: o.status, paid: o.paymentStatus === "paid", refNo: r.refNo,
});

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { r, o } = await load(ctx, new URL(req.url).searchParams.get("t") ?? "");
    return Response.json(view(r, o));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Kiosk actions on a card payment: retry · pay at the counter · cancel the order. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    if (isReadOnlyDemoSlug(slug)) throw new HttpError(403, "منوی نمونه فقط برای پیش‌نمایش است");
    const b = await readJson(req);
    const { biz, r, o } = await load(ctx, String(b.t ?? ""));
    if (o.paymentStatus === "paid") return Response.json(view(r, o));
    const busy = r.status === "pending" && !!r.pickedAt; // the terminal may be taking the card right now
    const action = String(b.action);
    const features = await featuresOf(biz);
    if (action === "retry") {
      if (busy) throw new HttpError(409, "پرداخت روی دستگاه در حال انجام است");
      if (o.status !== "awaiting_payment") throw new HttpError(400, "این سفارش دیگر قابل پرداخت نیست");
      const kst = ((biz.settings ?? {}) as Settings).kiosk;
      if (!(await posOnline(biz.id, kst?.posDeviceId))) throw new HttpError(503, "کارتخوان در دسترس نیست");
      await cancelPendingRequests(o.id, "جایگزین درخواست جدید شد");
      const { req: nr } = await createPosRequest(biz, o.id, kst?.posDeviceId);
      return Response.json({ ...view(nr, o), token: nr.token });
    }
    if (busy) throw new HttpError(409, "پرداخت روی دستگاه در حال انجام است؛ برای لغو، تراکنش را روی خود کارتخوان لغو کنید");
    if (action === "cash") {
      await cancelPendingRequests(o.id, "پرداخت در صندوق انتخاب شد");
      await releaseHeldOrder(biz, features, o.id);
      return Response.json({ ok: true, number: o.number, total: o.total });
    }
    if (action === "cancel") {
      await cancelPendingRequests(o.id, "لغو توسط مشتری");
      await cancelHeldOrder(biz, o.id);
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "عملیات نامعتبر است");
  } catch (e) {
    return errorResponse(e);
  }
}
