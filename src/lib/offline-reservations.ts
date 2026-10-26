import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, offlineTerminals, offlineWorkspaceCommands, offlineWorkspaceSnapshots, reservations } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { logInfo, logWarn } from "@/lib/logger";
import { offlineAuth } from "@/lib/offline-pos";
import { hasAny } from "@/lib/plans";
import { sendReservationStatusSms } from "@/lib/sms";

type StatusCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "reservations";
  action: "set_status";
  baseDataset: "reservations";
  baseSnapshotId: string;
  baseRevision: number;
  payload: { reservationId: number; expectedStatus: "requested" | "confirmed"; expectedUpdatedAt: string; status: "confirmed" | "cancelled" | "completed" | "no_show" };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function parseStatusCommand(raw: unknown): StatusCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "فرمان تغییر وضعیت رزرو معتبر نیست");
  const command = raw as Record<string, unknown>;
  const commandKeys = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(command).some((key) => !commandKeys.includes(key)) || command.schemaVersion !== 1 || command.module !== "reservations" || command.action !== "set_status" || command.baseDataset !== "reservations") throw new HttpError(400, "نسخه یا نوع فرمان وضعیت رزرو پشتیبانی نمی‌شود");
  if (typeof command.id !== "string" || !UUID.test(command.id) || !Number.isSafeInteger(command.businessId) || Number(command.businessId) < 1 || typeof command.baseSnapshotId !== "string" || !UUID.test(command.baseSnapshotId) || !Number.isSafeInteger(command.baseRevision) || Number(command.baseRevision) < 1) throw new HttpError(400, "شناسهٔ فرمان یا snapshot رزرو معتبر نیست");
  if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) throw new HttpError(400, "اطلاعات تغییر وضعیت رزرو معتبر نیست");
  const payload = command.payload as Record<string, unknown>;
  const payloadKeys = ["reservationId", "expectedStatus", "expectedUpdatedAt", "status"];
  if (Object.keys(payload).some((key) => !payloadKeys.includes(key)) || !Number.isSafeInteger(payload.reservationId) || Number(payload.reservationId) < 1 || !["requested", "confirmed"].includes(String(payload.expectedStatus)) || !["confirmed", "cancelled", "completed", "no_show"].includes(String(payload.status)) || typeof payload.expectedUpdatedAt !== "string" || payload.expectedUpdatedAt.length > 40 || !RFC3339.test(payload.expectedUpdatedAt) || !Number.isFinite(Date.parse(payload.expectedUpdatedAt))) throw new HttpError(400, "اطلاعات وضعیت رزرو ناقص یا نامعتبر است");
  const allowed = payload.expectedStatus === "requested"
    ? ["confirmed", "cancelled"].includes(String(payload.status))
    : ["cancelled", "completed", "no_show"].includes(String(payload.status));
  if (!allowed) throw new HttpError(400, "تغییر وضعیت رزرو با وضعیت قبلی سازگار نیست");
  return raw as StatusCommand;
}

async function notifyStatus(business: Parameters<typeof sendReservationStatusSms>[0], phone: string, reservationId: number, status: "confirmed" | "cancelled") {
  try {
    const result = await sendReservationStatusSms(business, phone, status);
    if (result.status === "sent") logInfo("offline.reservation_status_sms_sent", { businessId: business.id, reservationId, status });
    else logWarn("offline.reservation_status_sms_not_sent", { businessId: business.id, reservationId, status, reason: result.detail });
    return result;
  } catch (error) {
    logWarn("offline.reservation_status_sms_error", { businessId: business.id, reservationId, status, error: error instanceof Error ? error.message : String(error) });
    return { status: "failed", detail: "وضعیت ذخیره شد؛ ارسال پیامک ناموفق بود" };
  }
}

export async function syncOfflineReservationStatus(req: Request, raw: unknown) {
  const command = parseStatusCommand(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "reservations")) throw new HttpError(403, "صندوق آفلاین و رزرو میز باید در اشتراک فعال باشند");
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");
  const payload = command.payload;

  const outcome = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این دستگاه لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.payloadHash !== payloadHash) return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسهٔ فرمان قبلاً با محتوای دیگری ثبت شده است" }, replayed: true };
      return { httpStatus: previous.httpStatus, response: previous.result as Record<string, unknown>, replayed: true };
    }

    const record = async (state: "applied" | "conflict" | "rejected", httpStatus: 200 | 409 | 422, error = "", receipt = "", details: Record<string, unknown> = {}) => {
      const response: Record<string, unknown> = { commandId: command.id, state, receipt, ...details, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({ id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy, module: command.module, action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>, state, httpStatus, error, receipt, result: response });
      return { httpStatus, response, replayed: false };
    };
    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(
      eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId), eq(offlineWorkspaceSnapshots.terminalId, terminal.id),
      eq(offlineWorkspaceSnapshots.businessId, business.id), eq(offlineWorkspaceSnapshots.dataset, "reservations"),
      eq(offlineWorkspaceSnapshots.revision, command.baseRevision),
    )).for("update");
    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "نسخهٔ رزرو مبنا منقضی شده یا پیدا نمی‌شود؛ snapshot تازه دریافت کنید");
    const baseRows = Array.isArray(snapshot.payload.reservations) ? snapshot.payload.reservations as Record<string, unknown>[] : [];
    const base = baseRows.find((row) => row.id === payload.reservationId);
    if (!base || base.status !== payload.expectedStatus || Date.parse(String(base.updatedAt)) !== Date.parse(payload.expectedUpdatedAt)) return record("conflict", 409, "وضعیت رزرو با نسخهٔ محلی سازگار نیست؛ فهرست رزروها را تازه کنید");
    const [current] = await tx.select().from(reservations).where(and(eq(reservations.id, payload.reservationId), eq(reservations.businessId, business.id))).for("update");
    if (!current || current.status !== payload.expectedStatus || current.updatedAt.getTime() !== Date.parse(payload.expectedUpdatedAt)) return record("conflict", 409, "رزرو از زمان دریافت نسخه تغییر کرده است؛ فهرست را تازه کنید");
    if (payload.status === "confirmed" && current.depositStatus === "pending") return record("rejected", 422, "پیش‌پرداخت هنوز تسویه نشده است و آفلاین قابل تأیید نیست");

    const [updated] = await tx.update(reservations).set({ status: payload.status, updatedAt: new Date() }).where(and(
      eq(reservations.id, current.id), eq(reservations.businessId, business.id), eq(reservations.status, current.status), eq(reservations.updatedAt, current.updatedAt),
    )).returning();
    if (!updated) return record("conflict", 409, "وضعیت رزرو هم‌زمان تغییر کرده است؛ فهرست را تازه کنید");
    const receipt = `reservation-status-${updated.id}-${command.id}`;
    return record("applied", 200, "", receipt, { reservationId: updated.id, status: updated.status });
  }, { isolationLevel: "repeatable read" });

  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, typeof outcome.response.error === "string" ? outcome.response.error : "تغییر وضعیت رزرو آفلاین اعمال نشد");
  const reservationId = Number(outcome.response.reservationId ?? command.payload.reservationId);
  const smsNotification = !outcome.replayed && (command.payload.status === "confirmed" || command.payload.status === "cancelled")
    ? await db.select({ customerPhone: reservations.customerPhone }).from(reservations).where(and(eq(reservations.id, reservationId), eq(reservations.businessId, business.id))).then(([row]) => row ? notifyStatus(business, row.customerPhone, reservationId, command.payload.status as "confirmed" | "cancelled") : undefined)
    : undefined;
  logInfo("offline.reservation_status_synced", { businessId: business.id, terminalId: terminal.id, reservationId, status: command.payload.status, commandId: command.id, replayed: outcome.replayed });
  return { ...outcome.response, ...(smsNotification ? { smsNotification } : {}) };
}
