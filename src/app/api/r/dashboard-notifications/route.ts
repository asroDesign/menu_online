import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { diningTables, orders, reservations, waiterServiceRequests } from "@/db/schema";
import { withAuth } from "@/lib/auth";
import { hasAny } from "@/lib/plans";
import { ONLINE_ORDER_ACTION_STATUSES, ONLINE_ORDER_RECENT_STATUSES, ONLINE_ORDER_RECENT_WINDOW_MS } from "@/lib/dashboard-notifications";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, auth) => {
  const canSeeOrders = hasAny(auth.features, "cashier_pos");
  const canSeeReservations = hasAny(auth.features, "reservations");
  const canSeeWaiterCalls = hasAny(auth.features, "waiter_call");
  const recentOrderCutoff = new Date(Date.now() - ONLINE_ORDER_RECENT_WINDOW_MS);

  const [onlineOrders, newReservations, waiterCalls] = await Promise.all([
    canSeeOrders ? db.select({
      id: orders.id,
      number: orders.number,
      customerName: orders.customerName,
      type: orders.type,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      total: orders.total,
      createdAt: orders.createdAt,
      tableName: diningTables.name,
    }).from(orders)
      .leftJoin(diningTables, and(eq(diningTables.id, orders.tableId), eq(diningTables.businessId, auth.business.id)))
      .where(and(
        eq(orders.businessId, auth.business.id),
        eq(orders.source, "customer"),
        isNull(orders.deletedAt),
        or(
          inArray(orders.status, [...ONLINE_ORDER_ACTION_STATUSES]),
          and(inArray(orders.status, [...ONLINE_ORDER_RECENT_STATUSES]), gte(orders.createdAt, recentOrderCutoff)),
        ),
      ))
      .orderBy(desc(orders.createdAt))
      .limit(30) : Promise.resolve([]),
    canSeeReservations ? db.select({
      id: reservations.id,
      customerName: reservations.customerName,
      guestCount: reservations.guestCount,
      startsAt: reservations.startsAt,
      status: reservations.status,
      createdAt: reservations.createdAt,
      tableName: diningTables.name,
    }).from(reservations)
      .leftJoin(diningTables, and(eq(diningTables.id, reservations.tableId), eq(diningTables.businessId, auth.business.id)))
      .where(and(eq(reservations.businessId, auth.business.id), eq(reservations.status, "requested")))
      .orderBy(desc(reservations.createdAt))
      .limit(30) : Promise.resolve([]),
    canSeeWaiterCalls ? db.select({
      id: waiterServiceRequests.id,
      tableName: diningTables.name,
      kind: waiterServiceRequests.kind,
      message: waiterServiceRequests.message,
      createdAt: waiterServiceRequests.createdAt,
    }).from(waiterServiceRequests)
      .innerJoin(diningTables, and(eq(diningTables.id, waiterServiceRequests.tableId), eq(diningTables.businessId, auth.business.id)))
      .where(and(eq(waiterServiceRequests.businessId, auth.business.id), eq(waiterServiceRequests.status, "open")))
      .orderBy(desc(waiterServiceRequests.createdAt))
      .limit(30) : Promise.resolve([]),
  ]);

  return Response.json({ orders: onlineOrders, reservations: newReservations, waiterCalls, checkedAt: new Date().toISOString() }, {
    headers: { "Cache-Control": "no-store" },
  });
});
