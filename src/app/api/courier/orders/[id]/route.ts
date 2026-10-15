import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { settleOrder } from "@/lib/orders";
import { myCourier } from "@/lib/courier";

/** Courier actions on one of their deliveries: pickup · delivered · not_home · failed */
export const POST = withAuth<{ id: string }>(
  async (req, auth, { id }) => {
    const me = await myCourier(auth);
    const b = await readJson(req);
    const action = String(b.action);
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 300) : "";
    const [o] = await db.select().from(orders).where(and(eq(orders.id, Number(id)), eq(orders.businessId, auth.business.id), eq(orders.courierId, me.id)));
    if (!o) throw new HttpError(404, "این سفارش به شما سپرده نشده است");
    if (o.status === "canceled") throw new HttpError(400, "این سفارش لغو شده است");
    const now = new Date();

    if (action === "pickup") {
      if (o.deliveryStatus !== "assigned") throw new HttpError(400, "وضعیت این سفارش برای تحویل‌گرفتن مناسب نیست");
      if (!["ready", "served"].includes(o.status)) throw new HttpError(400, "سفارش هنوز آماده نیست؛ پس از آماده‌شدن می‌توانید آن را تحویل بگیرید");
      const [r] = await db.update(orders).set({ deliveryStatus: "picked_up", pickedUpAt: now, status: "served", updatedAt: now }).where(and(eq(orders.id, o.id), eq(orders.deliveryStatus, "assigned"))).returning({ id: orders.id });
      if (!r) throw new HttpError(409, "وضعیت سفارش تغییر کرده است؛ صفحه را تازه کنید");
      return Response.json({ ok: true });
    }

    if (!["delivered", "not_home", "failed"].includes(action)) throw new HttpError(400, "عملیات نامعتبر است");
    if (o.deliveryStatus !== "picked_up") throw new HttpError(400, o.deliveryStatus === "assigned" ? "ابتدا سفارش را تحویل بگیرید" : "این سفارش قبلاً نتیجه‌گیری شده است");
    if (action === "failed" && !note) throw new HttpError(400, "دلیل عدم تحویل را بنویسید");

    const [r] = await db.update(orders).set({ deliveryStatus: action, deliveryFinishedAt: now, courierNote: note, updatedAt: now }).where(and(eq(orders.id, o.id), eq(orders.deliveryStatus, "picked_up"))).returning({ id: orders.id });
    if (!r) throw new HttpError(409, "وضعیت سفارش تغییر کرده است؛ صفحه را تازه کنید");

    if (action === "delivered") {
      // cash-on-delivery: the courier reports how the money was collected; prepaid orders are simply closed
      let method: string | null = null;
      if (o.paymentStatus !== "paid") {
        method = ["cash", "pos", "card"].includes(String(b.paymentMethod)) ? String(b.paymentMethod) : "cash";
      }
      await settleOrder(auth.business, auth.planFeatures, o.id, method, true);
    }
    return Response.json({ ok: true });
  },
  { feature: "courier", courierOk: true },
);
void inArray;
