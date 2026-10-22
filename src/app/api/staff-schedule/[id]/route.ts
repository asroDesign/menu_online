import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { staff, staffLeaveRequests, staffSchedules } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { parseTehranDateTime } from "@/lib/tehran-time";

export const PATCH = withAuth<{ id: string }>(async (req, auth, { id }) => {
  const shiftId = Number(id);
  if (!Number.isSafeInteger(shiftId) || shiftId < 1) throw new HttpError(404, "شیفت پیدا نشد.");
  const body = await readJson(req, 4 * 1024);
  const status = body.status;
  const item = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [current] = await tx.select().from(staffSchedules).where(and(eq(staffSchedules.id, shiftId), eq(staffSchedules.businessId, auth.business.id))).for("update");
    if (!current || current.status !== "scheduled") throw new HttpError(404, "شیفت فعال پیدا نشد.");
    if (status === "scheduled") {
      if (current.startsAt.getTime() <= Date.now()) throw new HttpError(409, "شیفتی که شروع شده قابل ویرایش نیست.");
      const staffId = Number(body.staffId), expectedVersion = Number(body.version);
      const startsAt = parseTehranDateTime(body.startsAt), endsAt = parseTehranDateTime(body.endsAt);
      if (!Number.isSafeInteger(staffId) || staffId < 1 || !Number.isSafeInteger(expectedVersion) || expectedVersion !== current.version || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 24 * 60 * 60_000)
        throw new HttpError(400, "کارمند، نسخه و بازه زمانی معتبر برای ویرایش شیفت لازم است.");
      const location = typeof body.location === "string" ? body.location.trim().slice(0, 100) : "";
      const [member] = await tx.select({ id: staff.id, isActive: staff.isActive }).from(staff).where(and(eq(staff.id, staffId), eq(staff.businessId, auth.business.id))).for("update");
      if (!member?.isActive) throw new HttpError(404, "کارمند فعال در این کسب‌وکار پیدا نشد.");
      const [overlap] = await tx.select({ id: staffSchedules.id }).from(staffSchedules).where(and(eq(staffSchedules.businessId, auth.business.id), eq(staffSchedules.staffId, staffId), eq(staffSchedules.status, "scheduled"), ne(staffSchedules.id, current.id), lt(staffSchedules.startsAt, endsAt), gt(staffSchedules.endsAt, startsAt))).limit(1);
      if (overlap) throw new HttpError(409, "این کارمند در بازه انتخاب‌شده شیفت دیگری دارد.");
      const [leave] = await tx.select({ id: staffLeaveRequests.id }).from(staffLeaveRequests).where(and(eq(staffLeaveRequests.businessId, auth.business.id), eq(staffLeaveRequests.staffId, staffId), eq(staffLeaveRequests.status, "approved"), lt(staffLeaveRequests.startsAt, endsAt), gt(staffLeaveRequests.endsAt, startsAt))).limit(1);
      if (leave) throw new HttpError(409, "برای این کارمند در بازه انتخاب‌شده مرخصی تأییدشده وجود دارد.");
      const [updated] = await tx.update(staffSchedules).set({ staffId, startsAt, endsAt, location, templateId: null, version: sql`${staffSchedules.version} + 1`, updatedBy: auth.user.id, updatedAt: new Date() })
        .where(and(eq(staffSchedules.id, current.id), eq(staffSchedules.businessId, auth.business.id), eq(staffSchedules.version, expectedVersion), eq(staffSchedules.status, "scheduled"))).returning();
      if (!updated) throw new HttpError(409, "این شیفت هم‌زمان تغییر کرده است؛ صفحه را تازه‌سازی کنید.");
      return updated;
    }
    if (status !== "canceled" && status !== "absent") throw new HttpError(400, "وضعیت شیفت معتبر نیست.");
    if (status === "absent" && current.startsAt.getTime() > Date.now()) throw new HttpError(409, "غیبت را فقط برای شیفتی که شروع شده ثبت کنید.");
    const [updated] = await tx.update(staffSchedules).set({
      status,
      absenceNote: status === "absent" && typeof body.note === "string" ? body.note.trim().slice(0, 300) : "",
      absenceRecordedBy: status === "absent" ? auth.user.id : null,
      absenceRecordedAt: status === "absent" ? new Date() : null,
      version: sql`${staffSchedules.version} + 1`,
      updatedBy: auth.user.id,
      updatedAt: new Date(),
    }).where(and(eq(staffSchedules.id, shiftId), eq(staffSchedules.businessId, auth.business.id), eq(staffSchedules.status, "scheduled"))).returning();
    if (!updated) throw new HttpError(409, "شیفت هم‌زمان تغییر کرده است.");
    return updated;
  });
  return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true });
