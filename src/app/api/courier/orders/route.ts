import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { withAuth } from "@/lib/auth";
import { myCourier } from "@/lib/courier";
import { startOfDayTehran } from "@/lib/jalali";
import { listOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** The courier's own work list: active deliveries + everything finished today. */
export const GET = withAuth(
  async (_req, auth) => {
    const me = await myCourier(auth);
    const since = startOfDayTehran(new Date());
    const rows = await listOrders(auth.business.id, {
      limit: 120,
      where: and(eq(orders.courierId, me.id), or(inArray(orders.deliveryStatus, ["assigned", "picked_up"]), gte(orders.deliveryFinishedAt, since)))!,
    });
    // only what a courier needs (no costs / accounting fields)
    const items = rows.map((o) => ({
      id: o.id, number: o.number, status: o.status, deliveryStatus: o.deliveryStatus, customerName: o.customerName, customerPhone: o.customerPhone,
      address: o.address, lat: o.lat, lng: o.lng, note: o.note, total: o.total, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod,
      deliveryFee: o.deliveryFee, courierNote: o.courierNote, assignedAt: o.assignedAt, pickedUpAt: o.pickedUpAt, deliveryFinishedAt: o.deliveryFinishedAt, createdAt: o.createdAt,
      items: o.items.map((i) => ({ id: i.id, name: i.name, emoji: i.emoji, quantity: i.quantity, note: i.note })),
    }));
    const [cnt] = await db.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.courierId, me.id), eq(orders.deliveryStatus, "delivered"), gte(orders.deliveryFinishedAt, since)));
    return Response.json({ courier: { id: me.id, name: me.name, status: me.status, phone: me.phone }, business: { name: auth.business.name, emoji: auth.business.logoEmoji, phone: auth.business.phone }, items, deliveredToday: cnt.n });
  },
  { feature: "courier", courierOk: true },
);
