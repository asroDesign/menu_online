import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { cheques, diningTables, orders, reservations, waiterServiceRequests } from "@/db/schema";
import { withAuth } from "@/lib/auth";
import { hasAny } from "@/lib/plans";
import { ONLINE_ORDER_ACTION_STATUSES, ONLINE_ORDER_RECENT_STATUSES, ONLINE_ORDER_RECENT_WINDOW_MS } from "@/lib/dashboard-notifications";
import { startOfDayTehran, endOfDayTehran } from "@/lib/jalali";
import { normalizeChequeReminderSettings } from "@/lib/cheque-reminders-core";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, auth) => {
  const canSeeOrders = hasAny(auth.features, "cashier_pos");
  const canSeeReservations = hasAny(auth.features, "reservations");
  const canSeeWaiterCalls = hasAny(auth.features, "waiter_call");
  const canSeeCheques = hasAny(auth.features, "cheque_register");
  const chequeReminderSettings = normalizeChequeReminderSettings(auth.business.settings?.chequeReminders);
  const recentOrderCutoff = new Date(Date.now() - ONLINE_ORDER_RECENT_WINDOW_MS);
  const chequeStart = startOfDayTehran(new Date());
  const chequeEnd = endOfDayTehran(new Date(chequeStart.getTime() + chequeReminderSettings.daysBefore * 86400_000));

  const [onlineOrders, newReservations, waiterCalls, chequeDue] = await Promise.all([
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
    canSeeCheques && chequeReminderSettings.enabled ? db.select({
      id: cheques.id,
      direction: cheques.direction,
      partnerName: cheques.partnerName,
      amount: cheques.amount,
      dueDate: cheques.dueDate,
      chequeNumber: cheques.chequeNumber,
      bank: cheques.bank,
    }).from(cheques).where(and(
      eq(cheques.businessId, auth.business.id),
      eq(cheques.status, "registered"),
      gte(cheques.dueDate, chequeStart),
      lte(cheques.dueDate, chequeEnd),
    )).orderBy(cheques.dueDate).limit(50) : Promise.resolve([]),
  ]);

  return Response.json({ orders: onlineOrders, reservations: newReservations, waiterCalls, cheques: chequeDue, checkedAt: new Date().toISOString() }, {
    headers: { "Cache-Control": "no-store" },
  });
});
