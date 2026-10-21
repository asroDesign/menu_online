import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { diningTables, orders, reservations, tableStatusEvents } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { canTransitionTable, isOperationalTableState, type OperationalTableState } from "@/lib/table-lifecycle-core";

export async function transitionTable(businessId: number, tableId: number, actorId: number, target: string, reasonInput: string) {
  if (!isOperationalTableState(target)) throw new HttpError(400, "وضعیت عملیاتی میز معتبر نیست");
  const reason = reasonInput.trim().slice(0, 240);
  if (target === "out_of_service" && !reason) throw new HttpError(400, "برای خارج‌کردن میز از سرویس، علت را بنویسید");
  return db.transaction(async (tx) => {
    const [table] = await tx.select().from(diningTables)
      .where(and(eq(diningTables.id, tableId), eq(diningTables.businessId, businessId))).for("update").limit(1);
    if (!table) throw new HttpError(404, "میز در این کسب‌وکار پیدا نشد");
    const current = table.operationalStatus as OperationalTableState;
    if (current === target) return { item: table, unchanged: true };
    if (!canTransitionTable(current, target)) throw new HttpError(409, "این تغییر وضعیت از مرحله فعلی مجاز نیست");

    const [openOrder] = await tx.select({ number: orders.number }).from(orders).where(and(
      eq(orders.businessId, businessId), eq(orders.tableId, tableId),
      inArray(orders.status, ["awaiting_payment", "pending", "preparing", "ready", "served"]),
      sql`${orders.paymentStatus} <> 'paid'`, isNull(orders.deletedAt),
    )).limit(1);
    if (openOrder) throw new HttpError(409, `این میز سفارش باز شماره ${openOrder.number.toLocaleString("fa-IR")} دارد`);

    const now = new Date();
    const [activeReservation] = await tx.select({ id: reservations.id }).from(reservations).where(and(
      eq(reservations.businessId, businessId), eq(reservations.tableId, tableId),
      inArray(reservations.status, ["requested", "confirmed"]),
      gt(sql`${reservations.startsAt} + (${reservations.durationMinutes} * interval '1 minute')`, now),
    )).limit(1);
    if (activeReservation) throw new HttpError(409, "برای این میز رزرو فعال وجود دارد؛ ابتدا رزرو را تعیین‌تکلیف کنید");

    const [updated] = await tx.update(diningTables).set({ operationalStatus: target })
      .where(and(eq(diningTables.id, tableId), eq(diningTables.businessId, businessId), eq(diningTables.operationalStatus, current))).returning();
    if (!updated) throw new HttpError(409, "وضعیت میز هم‌زمان تغییر کرده است؛ صفحه را تازه کنید");
    await tx.insert(tableStatusEvents).values({ businessId, tableId, tableName: table.name, fromStatus: current, toStatus: target, reason, actorId });
    return { item: updated, unchanged: false };
  });
}

export async function deleteDiningTable(businessId: number, tableId: number) {
  return db.transaction(async (tx) => {
    const [table] = await tx.select().from(diningTables)
      .where(and(eq(diningTables.id, tableId), eq(diningTables.businessId, businessId))).for("update").limit(1);
    if (!table) throw new HttpError(404, "میز پیدا نشد");
    const [openOrder] = await tx.select({ number: orders.number }).from(orders).where(and(
      eq(orders.businessId, businessId), eq(orders.tableId, tableId),
      inArray(orders.status, ["awaiting_payment", "pending", "preparing", "ready", "served"]),
      sql`${orders.paymentStatus} <> 'paid'`, isNull(orders.deletedAt),
    )).limit(1);
    if (openOrder) throw new HttpError(409, `این میز سفارش باز شماره ${openOrder.number.toLocaleString("fa-IR")} دارد`);
    const [reservation] = await tx.select({ id: reservations.id }).from(reservations).where(and(
      eq(reservations.businessId, businessId), eq(reservations.tableId, tableId),
      inArray(reservations.status, ["requested", "confirmed"]),
      gt(sql`${reservations.startsAt} + (${reservations.durationMinutes} * interval '1 minute')`, new Date()),
    )).limit(1);
    if (reservation) throw new HttpError(409, "این میز رزرو فعال یا آینده دارد؛ ابتدا رزرو را تعیین‌تکلیف کنید");
    await tx.delete(diningTables).where(and(eq(diningTables.id, tableId), eq(diningTables.businessId, businessId)));
    return { ok: true };
  });
}
