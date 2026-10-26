import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { offlineStaffAttendanceRequests, offlineTerminals, offlineWorkspaceSnapshots, staffAttendanceRecords, staffSchedules } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { hasAny } from "@/lib/plans";
import { offlineAuth } from "@/lib/offline-pos";

type Command = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "staff";
  action: "attendance";
  baseDataset: "shifts";
  baseSnapshotId: string;
  baseRevision: number;
  payload: {
    scheduleId: number;
    staffId: number;
    action: "check_in" | "check_out";
    occurredAt: string;
    previousRequestId: string | null;
  };
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
function parseCommand(raw: unknown): Command {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "فرمان حضور آفلاین معتبر نیست");
  const value = raw as Record<string, unknown>;
  const allowed = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new HttpError(400, "فرمان حضور آفلاین فیلد ناشناخته دارد");
  if (value.schemaVersion !== 1 || value.module !== "staff" || value.action !== "attendance" || value.baseDataset !== "shifts") throw new HttpError(400, "نسخه یا نوع فرمان حضور آفلاین پشتیبانی نمی‌شود");
  if (typeof value.id !== "string" || !uuid.test(value.id) || !Number.isSafeInteger(value.businessId) || Number(value.businessId) < 1) throw new HttpError(400, "شناسهٔ فرمان یا کسب‌وکار معتبر نیست");
  if (typeof value.baseSnapshotId !== "string" || !uuid.test(value.baseSnapshotId) || !Number.isSafeInteger(value.baseRevision) || Number(value.baseRevision) < 1) throw new HttpError(400, "نسخهٔ مبنای برنامهٔ شیفت معتبر نیست");
  const payload = value.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new HttpError(400, "اطلاعات ثبت حضور معتبر نیست");
  const body = payload as Record<string, unknown>;
  const payloadKeys = ["scheduleId", "staffId", "action", "occurredAt", "previousRequestId"];
  if (Object.keys(body).some((key) => !payloadKeys.includes(key))) throw new HttpError(400, "اطلاعات ثبت حضور فیلد ناشناخته دارد");
  if (!Number.isSafeInteger(body.scheduleId) || Number(body.scheduleId) < 1 || !Number.isSafeInteger(body.staffId) || Number(body.staffId) < 1) throw new HttpError(400, "شیفت یا کارمند معتبر نیست");
  if (body.action !== "check_in" && body.action !== "check_out") throw new HttpError(400, "نوع ثبت حضور معتبر نیست");
  if (typeof body.occurredAt !== "string" || body.occurredAt.length > 40 || !rfc3339.test(body.occurredAt) || !Number.isFinite(Date.parse(body.occurredAt))) throw new HttpError(400, "زمان ثبت حضور باید RFC3339 معتبر با منطقهٔ زمانی باشد");
  if (body.previousRequestId !== null && (typeof body.previousRequestId !== "string" || !uuid.test(body.previousRequestId))) throw new HttpError(400, "پیوند ثبت ورود قبلی معتبر نیست");
  if (body.action === "check_in" && body.previousRequestId !== null) throw new HttpError(400, "ثبت ورود نباید به درخواست حضور قبلی وابسته باشد");
  return raw as Command;
}

export async function syncOfflineAttendanceCommand(req: Request, raw: unknown) {
  const command = parseCommand(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "staff_scheduling")) throw new HttpError(403, "صندوق آفلاین و برنامه‌ریزی کارکنان باید در اشتراک فعال باشند");
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان حضور متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");

  return db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این دستگاه لغو شده است");
    const existing = await tx.select().from(offlineStaffAttendanceRequests).where(eq(offlineStaffAttendanceRequests.id, command.id)).for("update").then((rows) => rows[0]);
    if (existing) {
      if (existing.terminalId !== terminal.id || existing.businessId !== business.id || existing.payloadHash !== payloadHash) throw new HttpError(409, "شناسهٔ فرمان قبلاً با محتوای دیگری ثبت شده است");
      return { commandId: command.id, state: "applied", receipt: existing.id, reviewStatus: existing.status, duplicate: true };
    }

    const snapshot = await tx.select().from(offlineWorkspaceSnapshots).where(and(
      eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId), eq(offlineWorkspaceSnapshots.terminalId, terminal.id),
      eq(offlineWorkspaceSnapshots.businessId, business.id), eq(offlineWorkspaceSnapshots.dataset, "shifts"),
      eq(offlineWorkspaceSnapshots.revision, command.baseRevision),
    )).for("update").then((rows) => rows[0]);
    if (!snapshot || snapshot.validUntil <= new Date()) throw new HttpError(409, "نسخهٔ برنامهٔ شیفت این دستگاه منقضی شده یا پیدا نمی‌شود");
    const schedules = Array.isArray(snapshot.payload.schedules) ? snapshot.payload.schedules as Record<string, unknown>[] : [];
    const base = schedules.find((row) => row.id === command.payload.scheduleId);
    if (!base || base.staffId !== command.payload.staffId || base.status !== "scheduled") throw new HttpError(409, "شیفت در نسخهٔ ذخیره‌شده موجود یا فعال نیست");

    const [shift] = await tx.select().from(staffSchedules).where(and(eq(staffSchedules.id, command.payload.scheduleId), eq(staffSchedules.businessId, business.id))).for("update");
    if (!shift || shift.staffId !== command.payload.staffId || shift.status !== "scheduled" || shift.version !== base.version || shift.startsAt.toISOString() !== base.startsAt || shift.endsAt.toISOString() !== base.endsAt) throw new HttpError(409, "برنامهٔ شیفت پس از دریافت نسخهٔ آفلاین تغییر کرده است؛ درخواست حضور نیازمند بازبینی است");
    const [currentAttendance] = await tx.select().from(staffAttendanceRecords).where(and(eq(staffAttendanceRecords.businessId, business.id), eq(staffAttendanceRecords.scheduleId, shift.id))).for("update");
    const baseAttendance = base.attendance as { checkInAt?: string | null; checkOutAt?: string | null } | null;
    const baseCheckIn = baseAttendance?.checkInAt ?? null;
    const baseCheckOut = baseAttendance?.checkOutAt ?? null;
    if ((currentAttendance?.checkInAt?.toISOString() ?? null) !== baseCheckIn || (currentAttendance?.checkOutAt?.toISOString() ?? null) !== baseCheckOut) throw new HttpError(409, "سابقهٔ حضور از زمان دریافت نسخه تغییر کرده است؛ دادهٔ جاری را تازه کنید");

    const occurredAt = new Date(command.payload.occurredAt);
    const now = new Date();
    if (occurredAt.getTime() > now.getTime() + 5 * 60_000) throw new HttpError(409, "زمان دستگاه بیش از پنج دقیقه جلوتر از سرور است");
    const earliest = command.payload.action === "check_in" ? shift.startsAt.getTime() - 2 * 60 * 60_000 : shift.startsAt.getTime();
    const latest = command.payload.action === "check_in" ? shift.endsAt.getTime() + 2 * 60 * 60_000 : shift.endsAt.getTime() + 12 * 60 * 60_000;
    if (occurredAt.getTime() < earliest || occurredAt.getTime() > latest) throw new HttpError(409, "زمان ثبت‌شده خارج از بازهٔ مجاز این شیفت است");

    let expectedCheckInAt: Date | null = null;
    let previousRequestId: string | null = null;
    if (command.payload.action === "check_in") {
      if (baseCheckIn || baseCheckOut) throw new HttpError(409, "برای این شیفت قبلاً ورود یا خروج ثبت شده است");
    } else if (baseCheckIn) {
      if (baseCheckOut || occurredAt < new Date(baseCheckIn)) throw new HttpError(409, "خروج قبلاً ثبت شده یا پیش از ورود است");
      if (command.payload.previousRequestId !== null) throw new HttpError(409, "ورود این شیفت از قبل در نسخهٔ سرور ثبت شده است");
      expectedCheckInAt = new Date(baseCheckIn);
    } else {
      const previousId = command.payload.previousRequestId;
      if (!previousId) throw new HttpError(409, "برای ثبت خروج آفلاین، درخواست ورود قبلی لازم است");
      const previous = await tx.select().from(offlineStaffAttendanceRequests).where(and(
        eq(offlineStaffAttendanceRequests.id, previousId), eq(offlineStaffAttendanceRequests.terminalId, terminal.id),
        eq(offlineStaffAttendanceRequests.businessId, business.id), eq(offlineStaffAttendanceRequests.scheduleId, shift.id),
        eq(offlineStaffAttendanceRequests.staffId, shift.staffId), eq(offlineStaffAttendanceRequests.action, "check_in"),
      )).for("update").then((rows) => rows[0]);
      if (!previous || !["pending", "approved"].includes(previous.status) || occurredAt < previous.occurredAt) throw new HttpError(409, "درخواست ورود معتبر یا مقدم بر خروج پیدا نشد");
      expectedCheckInAt = previous.occurredAt;
      previousRequestId = previous.id;
    }
    const pending = await tx.select({ id: offlineStaffAttendanceRequests.id }).from(offlineStaffAttendanceRequests).where(and(
      eq(offlineStaffAttendanceRequests.businessId, business.id), eq(offlineStaffAttendanceRequests.scheduleId, shift.id),
      eq(offlineStaffAttendanceRequests.action, command.payload.action), eq(offlineStaffAttendanceRequests.status, "pending"),
    )).for("update").then((rows) => rows[0]);
    if (pending) throw new HttpError(409, "یک درخواست همسان برای این شیفت در انتظار تأیید مدیر است");

    const [saved] = await tx.insert(offlineStaffAttendanceRequests).values({
      id: command.id, terminalId: terminal.id, businessId: business.id, scheduleId: shift.id, staffId: shift.staffId,
      scheduleVersion: shift.version, action: command.payload.action, occurredAt, expectedCheckInAt, previousRequestId,
      snapshotId: snapshot.id, snapshotRevision: snapshot.revision, payloadHash,
    }).returning({ id: offlineStaffAttendanceRequests.id, status: offlineStaffAttendanceRequests.status });
    if (!saved) throw new HttpError(500, "درخواست حضور آفلاین ذخیره نشد");
    return { commandId: command.id, state: "applied", receipt: saved.id, reviewStatus: saved.status, duplicate: false };
  }, { isolationLevel: "repeatable read" });
}
