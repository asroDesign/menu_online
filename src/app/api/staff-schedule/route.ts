import { and, eq, inArray, lt, gt } from "drizzle-orm";
import { db } from "@/db";
import { staff, staffLeaveRequests, staffSchedules } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { isManagerRole } from "@/lib/roles";
import { parseTehranDateTime } from "@/lib/tehran-time";

const staffRoles = ["waiter", "cashier", "chef", "warehouse", "accountant"];
const interval = (start: unknown, end: unknown) => {
  const startsAt = parseTehranDateTime(start), endsAt = parseTehranDateTime(end);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 24 * 60 * 60_000)
    throw new HttpError(400, "بازه زمانی معتبر نیست؛ مدت هر شیفت باید حداکثر ۲۴ ساعت باشد.");
  return { startsAt, endsAt };
};

export const GET = withAuth(async (req, auth) => {
  const url = new URL(req.url);
  const requestedStart = url.searchParams.get("from");
  const requestedEnd = url.searchParams.get("to");
  const start = requestedStart ? new Date(requestedStart) : new Date(Date.now() - 7 * 86_400_000);
  const end = requestedEnd ? new Date(requestedEnd) : new Date(Date.now() + 30 * 86_400_000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 32 * 86_400_000)
    throw new HttpError(400, "بازه برنامه باید حداکثر یک ماه باشد.");
  const manager = isManagerRole(auth.role);
  const [member] = manager ? [] : await db.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, auth.business.id), eq(staff.userId, auth.user.id), eq(staff.isActive, true)));
  if (!manager && !member) throw new HttpError(403, "حساب کاربری به پروفایل فعال کارکنان متصل نیست.");
  const scheduleWhere = manager
    ? and(eq(staffSchedules.businessId, auth.business.id), lt(staffSchedules.startsAt, end), gt(staffSchedules.endsAt, start))
    : and(eq(staffSchedules.businessId, auth.business.id), eq(staffSchedules.staffId, member!.id), inArray(staffSchedules.status, ["scheduled", "absent"]), lt(staffSchedules.startsAt, end), gt(staffSchedules.endsAt, start));
  const leaveWhere = manager
    ? and(eq(staffLeaveRequests.businessId, auth.business.id), lt(staffLeaveRequests.startsAt, end), gt(staffLeaveRequests.endsAt, start))
    : and(eq(staffLeaveRequests.businessId, auth.business.id), eq(staffLeaveRequests.staffId, member!.id), lt(staffLeaveRequests.startsAt, end), gt(staffLeaveRequests.endsAt, start));
  const [schedules, leaves, activeStaff] = await Promise.all([
    db.select({ id: staffSchedules.id, staffId: staffSchedules.staffId, staffName: staff.name, startsAt: staffSchedules.startsAt, endsAt: staffSchedules.endsAt, location: staffSchedules.location, status: staffSchedules.status, absenceNote: staffSchedules.absenceNote, version: staffSchedules.version })
      .from(staffSchedules).innerJoin(staff, eq(staff.id, staffSchedules.staffId)).where(scheduleWhere).orderBy(staffSchedules.startsAt).limit(500),
    db.select({ id: staffLeaveRequests.id, staffId: staffLeaveRequests.staffId, staffName: staff.name, startsAt: staffLeaveRequests.startsAt, endsAt: staffLeaveRequests.endsAt, kind: staffLeaveRequests.kind, reason: staffLeaveRequests.reason, status: staffLeaveRequests.status, decisionNote: staffLeaveRequests.decisionNote })
      .from(staffLeaveRequests).innerJoin(staff, eq(staff.id, staffLeaveRequests.staffId)).where(leaveWhere).orderBy(staffLeaveRequests.startsAt).limit(500),
    db.select({ id: staff.id, name: staff.name, role: staff.role }).from(staff).where(and(eq(staff.businessId, auth.business.id), eq(staff.isActive, true))).orderBy(staff.name).limit(300),
  ]);
  return Response.json({ items: schedules, leaveRequests: leaves, staff: activeStaff, mine: !manager, staffId: member?.id ?? null, range: { from: start.toISOString(), to: end.toISOString() } }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true, roles: staffRoles });

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 8 * 1024);
  const staffId = Number(body.staffId);
  const { startsAt, endsAt } = interval(body.startsAt, body.endsAt);
  if (!Number.isSafeInteger(staffId) || staffId < 1) throw new HttpError(400, "کارمند انتخاب‌شده معتبر نیست.");
  const location = typeof body.location === "string" ? body.location.trim().slice(0, 100) : "";
  const item = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [member] = await tx.select().from(staff).where(and(eq(staff.id, staffId), eq(staff.businessId, auth.business.id), eq(staff.isActive, true))).for("update");
    if (!member) throw new HttpError(404, "کارمند فعال در این کسب‌وکار پیدا نشد.");
    const [overlap] = await tx.select({ id: staffSchedules.id }).from(staffSchedules).where(and(eq(staffSchedules.businessId, auth.business.id), eq(staffSchedules.staffId, staffId), eq(staffSchedules.status, "scheduled"), lt(staffSchedules.startsAt, endsAt), gt(staffSchedules.endsAt, startsAt))).limit(1);
    if (overlap) throw new HttpError(409, "این کارمند در این بازه شیفت دیگری دارد.");
    const [leave] = await tx.select({ id: staffLeaveRequests.id }).from(staffLeaveRequests).where(and(eq(staffLeaveRequests.businessId, auth.business.id), eq(staffLeaveRequests.staffId, staffId), eq(staffLeaveRequests.status, "approved"), lt(staffLeaveRequests.startsAt, endsAt), gt(staffLeaveRequests.endsAt, startsAt))).limit(1);
    if (leave) throw new HttpError(409, "برای این بازه مرخصی تأییدشده ثبت شده است.");
    const [created] = await tx.insert(staffSchedules).values({ businessId: auth.business.id, staffId, startsAt, endsAt, location, createdBy: auth.user.id, updatedBy: auth.user.id }).returning();
    return created;
  });
  return Response.json({ item }, { status: 201, headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true });
