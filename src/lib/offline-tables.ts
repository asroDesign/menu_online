import { createHash } from "node:crypto";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, diningTables, offlineTerminals, offlineWorkspaceCommands, offlineWorkspaceSnapshots, orders, reservations, tableStatusEvents } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { hasAny } from "@/lib/plans";
import { offlineAuth } from "@/lib/offline-pos";
import { canTransitionTable, type OperationalTableState } from "@/lib/table-lifecycle-core";
import { parseOfflineTableStatusCommand } from "@/lib/offline-table-status-core";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function syncOfflineTableStatusCommand(req: Request, raw: unknown) {
  let command: ReturnType<typeof parseOfflineTableStatusCommand>;
  try { command = parseOfflineTableStatusCommand(raw); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "فرمان وضعیت میز معتبر نیست"); }

  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos")) throw new HttpError(403, "مدیریت میز آفلاین در اشتراک فعلی فعال نیست");
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");

  const outcome = await db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses)
      .where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.payloadHash !== payloadHash) {
        return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسه فرمان قبلاً با محتوای دیگری ثبت شده است" } };
      }
      return { httpStatus: previous.httpStatus, response: previous.result };
    }

    const snapshot = await tx.select().from(offlineWorkspaceSnapshots).where(and(
      eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId),
      eq(offlineWorkspaceSnapshots.terminalId, terminal.id),
      eq(offlineWorkspaceSnapshots.businessId, business.id),
      eq(offlineWorkspaceSnapshots.dataset, "menu"),
      eq(offlineWorkspaceSnapshots.revision, command.baseRevision),
    )).for("update").then((rows) => rows[0]);

    const record = async (state: "applied" | "conflict", httpStatus: 200 | 409, error = "", receipt = "") => {
      const response = { commandId: command.id, state, receipt, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({
        id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy,
        module: command.module, action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>,
        state, httpStatus, error, receipt, result: response,
      });
      return { httpStatus, response };
    };

    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "snapshot میز پیدا نشد یا اعتبارش پایان یافته است؛ داده را تازه کنید");
    const tables = Array.isArray(snapshot.payload.tables) ? snapshot.payload.tables as Record<string, unknown>[] : [];
    const baseTable = tables.find((table) => table.id === command.payload.tableId);
    if (!baseTable || baseTable.operationalStatus !== command.payload.expectedStatus) return record("conflict", 409, "وضعیت میز با نسخهٔ این دستگاه هم‌خوان نیست؛ فهرست را تازه کنید");

    const [table] = await tx.select().from(diningTables).where(and(
      eq(diningTables.id, command.payload.tableId), eq(diningTables.businessId, business.id),
    )).for("update").limit(1);
    if (!table) return record("conflict", 409, "میز در این کسب‌وکار پیدا نشد");
    const current = table.operationalStatus as OperationalTableState;
    if (current !== command.payload.expectedStatus) return record("conflict", 409, "وضعیت میز در سرور تغییر کرده است؛ فهرست را تازه کنید");
    if (!canTransitionTable(current, command.payload.status)) return record("conflict", 409, "این تغییر از وضعیت فعلی میز مجاز نیست");
    const reason = command.payload.reason.trim();
    if (command.payload.status === "out_of_service" && !reason) return record("conflict", 409, "برای خارج‌کردن میز از سرویس، علت لازم است");

    const [openOrder] = await tx.select({ number: orders.number }).from(orders).where(and(
      eq(orders.businessId, business.id), eq(orders.tableId, table.id),
      inArray(orders.status, ["awaiting_payment", "pending", "preparing", "ready", "served"]),
      sql`${orders.paymentStatus} <> 'paid'`, isNull(orders.deletedAt),
    )).limit(1);
    if (openOrder) return record("conflict", 409, `این میز سفارش باز شماره ${openOrder.number.toLocaleString("fa-IR")} دارد`);

    const [activeReservation] = await tx.select({ id: reservations.id }).from(reservations).where(and(
      eq(reservations.businessId, business.id), eq(reservations.tableId, table.id),
      inArray(reservations.status, ["requested", "confirmed"]),
      gt(sql`${reservations.startsAt} + (${reservations.durationMinutes} * interval '1 minute')`, new Date()),
    )).limit(1);
    if (activeReservation) return record("conflict", 409, "برای این میز رزرو فعال یا آینده وجود دارد؛ ابتدا آن را تعیین‌تکلیف کنید");

    const [updated] = await tx.update(diningTables).set({ operationalStatus: command.payload.status })
      .where(and(eq(diningTables.id, table.id), eq(diningTables.businessId, business.id), eq(diningTables.operationalStatus, current))).returning();
    if (!updated) return record("conflict", 409, "وضعیت میز هم‌زمان تغییر کرده است؛ فهرست را تازه کنید");
    await tx.insert(tableStatusEvents).values({
      businessId: business.id, tableId: table.id, tableName: table.name,
      fromStatus: current, toStatus: command.payload.status, reason, actorId: terminal.createdBy,
    });
    return record("applied", 200, "", String(table.id));
  }, { isolationLevel: "repeatable read" });

  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, typeof outcome.response.error === "string" ? outcome.response.error : "تغییر وضعیت میز همگام نشد");
  return outcome.response;
}
