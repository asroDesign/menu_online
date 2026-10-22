import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { staff, staffAttendanceEvents, staffAttendanceRecords, staffSchedules } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { isManagerRole } from "@/lib/roles";
import { parseTehranDateTime } from "@/lib/tehran-time";

const staffRoles = ["waiter", "cashier", "chef", "warehouse", "accountant"];
const validDate = (value: unknown) => {
  const date = parseTehranDateTime(value);
  if (!Number.isFinite(date.getTime())) throw new HttpError(400, "زمان انتخاب‌شده معتبر نیست.");
  return date;
};

export const GET = withAuth(async (req, auth) => {
  const url = new URL(req.url);
  const now = new Date();
  const start = url.searchParams.has("from") ? new Date(url.searchParams.get("from")!) : new Date(now.getTime() - 30 * 86_400_000);
  const end = url.searchParams.has("to") ? new Date(url.searchParams.get("to")!) : new Date(now.getTime() + 86_400_000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 62 * 86_400_000)
    throw new HttpError(400, "بازه گزارش حضور و غیاب باید حداکثر ۶۲ روز باشد.");

  const manager = isManagerRole(auth.role);
  const [member] = manager ? [] : await db.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, auth.business.id), eq(staff.userId, auth.user.id), eq(staff.isActive, true))).limit(2);
  if (!manager && !member) throw new HttpError(403, "حساب کاربری به پروفایل فعال کارکنان متصل نیست.");
  const where = manager
    ? and(eq(staffSchedules.businessId, auth.business.id), inArray(staffSchedules.status, ["scheduled", "absent"]), gte(staffSchedules.startsAt, start), lte(staffSchedules.startsAt, end))
    : and(eq(staffSchedules.businessId, auth.business.id), eq(staffSchedules.staffId, member!.id), inArray(staffSchedules.status, ["scheduled", "absent"]), gte(staffSchedules.startsAt, start), lte(staffSchedules.startsAt, end));

  const items = await db.select({
    scheduleId: staffSchedules.id,
    staffId: staffSchedules.staffId,
    staffName: staff.name,
    startsAt: staffSchedules.startsAt,
    endsAt: staffSchedules.endsAt,
    location: staffSchedules.location,
    scheduleStatus: staffSchedules.status,
    attendanceId: staffAttendanceRecords.id,
    checkInAt: staffAttendanceRecords.checkInAt,
    checkOutAt: staffAttendanceRecords.checkOutAt,
  }).from(staffSchedules)
    .innerJoin(staff, eq(staff.id, staffSchedules.staffId))
    .leftJoin(staffAttendanceRecords, and(eq(staffAttendanceRecords.scheduleId, staffSchedules.id), eq(staffAttendanceRecords.businessId, auth.business.id)))
    .where(where).orderBy(staffSchedules.startsAt).limit(500);
  return Response.json({ items, mine: !manager }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true, roles: staffRoles });

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 4 * 1024);
  const scheduleId = Number(body.scheduleId);
  const action = body.action;
  if (!Number.isSafeInteger(scheduleId) || scheduleId < 1 || (action !== "check_in" && action !== "check_out"))
    throw new HttpError(400, "شیفت و نوع ثبت حضور را انتخاب کنید.");

  const [member] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, auth.business.id), eq(staff.userId, auth.user.id), eq(staff.isActive, true))).limit(2);
  if (!member) throw new HttpError(403, "ثبت ورود و خروج فقط برای کارمند فعال متصل به این حساب ممکن است.");
  const now = new Date();
  const item = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [shift] = await tx.select().from(staffSchedules).where(and(eq(staffSchedules.id, scheduleId), eq(staffSchedules.businessId, auth.business.id), eq(staffSchedules.staffId, member.id))).for("update");
    if (!shift || shift.status !== "scheduled") throw new HttpError(404, "شیفت فعال شما پیدا نشد.");
    if (action === "check_in" && (now < new Date(shift.startsAt.getTime() - 2 * 60 * 60_000) || now > new Date(shift.endsAt.getTime() + 2 * 60 * 60_000)))
      throw new HttpError(409, "ثبت ورود فقط از دو ساعت پیش از شروع تا دو ساعت پس از پایان شیفت ممکن است.");
    if (action === "check_out" && (now < shift.startsAt || now > new Date(shift.endsAt.getTime() + 12 * 60 * 60_000)))
      throw new HttpError(409, "ثبت خروج از زمان شروع تا حداکثر ۱۲ ساعت پس از پایان شیفت ممکن است.");

    const [record] = await tx.select().from(staffAttendanceRecords).where(and(eq(staffAttendanceRecords.businessId, auth.business.id), eq(staffAttendanceRecords.scheduleId, scheduleId))).for("update");
    if (action === "check_in") {
      if (record?.checkInAt) throw new HttpError(409, "ورود این شیفت قبلاً ثبت شده است.");
      if (record?.checkOutAt) throw new HttpError(409, "برای این شیفت خروج ثبت شده و ورود دوباره ممکن نیست.");
      const [saved] = record
        ? await tx.update(staffAttendanceRecords).set({ staffId: member.id, checkInAt: now, checkInBy: auth.user.id, updatedBy: auth.user.id, updatedAt: now }).where(eq(staffAttendanceRecords.id, record.id)).returning()
        : await tx.insert(staffAttendanceRecords).values({ businessId: auth.business.id, scheduleId, staffId: member.id, checkInAt: now, checkInBy: auth.user.id, updatedBy: auth.user.id }).returning();
      await tx.insert(staffAttendanceEvents).values({ businessId: auth.business.id, recordId: saved.id, action: "check_in", occurredAt: now, recordedBy: auth.user.id });
      return saved;
    }
    if (!record?.checkInAt) throw new HttpError(409, "ابتدا ورود خود را ثبت کنید.");
    if (record.checkOutAt) throw new HttpError(409, "خروج این شیفت قبلاً ثبت شده است.");
    if (now < record.checkInAt) throw new HttpError(409, "زمان خروج نمی‌تواند پیش از ورود باشد.");
    const [saved] = await tx.update(staffAttendanceRecords).set({ checkOutAt: now, checkOutBy: auth.user.id, updatedBy: auth.user.id, updatedAt: now }).where(and(eq(staffAttendanceRecords.id, record.id), sql`${staffAttendanceRecords.checkOutAt} is null`)).returning();
    if (!saved) throw new HttpError(409, "ثبت خروج هم‌زمان تغییر کرده است.");
    await tx.insert(staffAttendanceEvents).values({ businessId: auth.business.id, recordId: saved.id, action: "check_out", occurredAt: now, recordedBy: auth.user.id });
    return saved;
  });
  return Response.json({ item }, { status: 201, headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true, roles: staffRoles });

export const PATCH = withAuth(async (req, auth) => {
  if (!isManagerRole(auth.role)) throw new HttpError(403, "اصلاح سوابق حضور فقط برای مدیر مجاز است.");
  const body = await readJson(req, 4 * 1024);
  const recordId = Number(body.recordId);
  const action = body.action;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (!Number.isSafeInteger(recordId) || recordId < 1 || (action !== "adjust_check_in" && action !== "adjust_check_out") || reason.length < 3)
    throw new HttpError(400, "نوع اصلاح، دلیل حداقل ۳ نویسه‌ای و سابقه حضور را وارد کنید.");
  const occurredAt = validDate(body.at);
  const saved = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [record] = await tx.select().from(staffAttendanceRecords).where(and(eq(staffAttendanceRecords.id, recordId), eq(staffAttendanceRecords.businessId, auth.business.id))).for("update");
    if (!record) throw new HttpError(404, "سابقه حضور پیدا نشد.");
    const [shift] = await tx.select().from(staffSchedules).where(and(eq(staffSchedules.id, record.scheduleId), eq(staffSchedules.businessId, auth.business.id))).for("update");
    if (!shift) throw new HttpError(404, "شیفت مرتبط پیدا نشد.");
    if (Math.abs(occurredAt.getTime() - shift.startsAt.getTime()) > 18 * 60 * 60_000 && Math.abs(occurredAt.getTime() - shift.endsAt.getTime()) > 18 * 60 * 60_000)
      throw new HttpError(400, "زمان اصلاح‌شده باید در فاصله ۱۸ ساعته از شیفت باشد.");
    const previousAt = action === "adjust_check_in" ? record.checkInAt : record.checkOutAt;
    if (!previousAt) throw new HttpError(409, "برای اصلاح این زمان ابتدا کارمند باید ورود یا خروج خود را ثبت کند.");
    const checkInAt = action === "adjust_check_in" ? occurredAt : record.checkInAt;
    const checkOutAt = action === "adjust_check_out" ? occurredAt : record.checkOutAt;
    if (checkInAt && checkOutAt && checkOutAt < checkInAt) throw new HttpError(400, "زمان خروج نمی‌تواند پیش از زمان ورود باشد.");
    const [updated] = await tx.update(staffAttendanceRecords).set({
      ...(action === "adjust_check_in" ? { checkInAt: occurredAt } : { checkOutAt: occurredAt }),
      updatedBy: auth.user.id,
      updatedAt: new Date(),
    }).where(and(eq(staffAttendanceRecords.id, recordId), eq(staffAttendanceRecords.businessId, auth.business.id))).returning();
    await tx.insert(staffAttendanceEvents).values({ businessId: auth.business.id, recordId, action, previousAt, occurredAt, reason, recordedBy: auth.user.id });
    return updated;
  });
  return Response.json({ item: saved }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true });
