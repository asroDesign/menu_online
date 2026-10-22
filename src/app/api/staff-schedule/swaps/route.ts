import { and, asc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { staff, staffLeaveRequests, staffSchedules, staffShiftSwapRequests } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { isManagerRole } from "@/lib/roles";

const staffRoles = ["waiter", "cashier", "chef", "warehouse", "accountant"];

async function currentStaffId(businessId: number, userId: number) {
  const members = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, businessId), eq(staff.userId, userId), eq(staff.isActive, true))).limit(2);
  if (members.length !== 1) throw new HttpError(403, members.length ? "حساب شما به چند پروفایل کارکنان متصل است؛ مدیر باید اتصال را اصلاح کند." : "حساب کاربری به پروفایل فعال کارکنان متصل نیست.");
  return members[0].id;
}

export const GET = withAuth(async (_req, auth) => {
  const manager = isManagerRole(auth.role);
  const ownId = manager ? null : await currentStaffId(auth.business.id, auth.user.id);
  const where = manager
    ? eq(staffShiftSwapRequests.businessId, auth.business.id)
    : and(eq(staffShiftSwapRequests.businessId, auth.business.id), or(eq(staffShiftSwapRequests.fromStaffId, ownId!), eq(staffShiftSwapRequests.toStaffId, ownId!)));
  const items = await db.select({
    id: staffShiftSwapRequests.id,
    scheduleId: staffShiftSwapRequests.scheduleId,
    fromStaffId: staffShiftSwapRequests.fromStaffId,
    toStaffId: staffShiftSwapRequests.toStaffId,
    status: staffShiftSwapRequests.status,
    reason: staffShiftSwapRequests.reason,
    decisionNote: staffShiftSwapRequests.decisionNote,
    startsAt: staffSchedules.startsAt,
    endsAt: staffSchedules.endsAt,
  }).from(staffShiftSwapRequests)
    .innerJoin(staffSchedules, and(eq(staffSchedules.id, staffShiftSwapRequests.scheduleId), eq(staffSchedules.businessId, auth.business.id)))
    .where(where).orderBy(asc(staffShiftSwapRequests.createdAt)).limit(300);
  // Resolve names in one tenant-scoped batch rather than exposing staff fields beyond display names.
  const ids = [...new Set(items.flatMap((item) => [item.fromStaffId, item.toStaffId]))];
  const names = ids.length ? await db.select({ id: staff.id, name: staff.name }).from(staff).where(and(eq(staff.businessId, auth.business.id), inArray(staff.id, ids))) : [];
  const nameById = new Map(names.map((item) => [item.id, item.name]));
  return Response.json({ items: items.map((item) => ({ ...item, fromStaffName: nameById.get(item.fromStaffId) ?? "کارمند", toStaffName: nameById.get(item.toStaffId) ?? "کارمند" })), staffId: ownId }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true, roles: staffRoles });

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 4 * 1024);
  const scheduleId = Number(body.scheduleId), targetStaffId = Number(body.targetStaffId);
  if (!Number.isSafeInteger(scheduleId) || scheduleId < 1 || !Number.isSafeInteger(targetStaffId) || targetStaffId < 1)
    throw new HttpError(400, "شیفت و همکار مقصد را انتخاب کنید.");
  const ownId = await currentStaffId(auth.business.id, auth.user.id);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  const item = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [shift] = await tx.select().from(staffSchedules).where(and(eq(staffSchedules.id, scheduleId), eq(staffSchedules.businessId, auth.business.id))).for("update");
    if (!shift || shift.status !== "scheduled" || shift.staffId !== ownId) throw new HttpError(404, "شیفت فعال شما پیدا نشد.");
    if (shift.startsAt.getTime() <= Date.now()) throw new HttpError(409, "برای شیفتی که شروع شده یا گذشته است نمی‌توان جابه‌جایی درخواست کرد.");
    if (targetStaffId === ownId) throw new HttpError(400, "همکار مقصد باید با شما متفاوت باشد.");
    const [target] = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.id, targetStaffId), eq(staff.businessId, auth.business.id), eq(staff.isActive, true))).for("update");
    if (!target) throw new HttpError(404, "همکار فعال در این کسب‌وکار پیدا نشد.");
    const [pending] = await tx.select({ id: staffShiftSwapRequests.id }).from(staffShiftSwapRequests).where(and(eq(staffShiftSwapRequests.businessId, auth.business.id), eq(staffShiftSwapRequests.scheduleId, scheduleId), or(eq(staffShiftSwapRequests.status, "pending_target"), eq(staffShiftSwapRequests.status, "pending_manager")))).limit(1);
    if (pending) throw new HttpError(409, "برای این شیفت درخواست جابه‌جایی در حال بررسی وجود دارد.");
    const [created] = await tx.insert(staffShiftSwapRequests).values({ businessId: auth.business.id, scheduleId, fromStaffId: ownId, toStaffId: targetStaffId, requestedBy: auth.user.id, reason }).returning();
    return created;
  });
  return Response.json({ item }, { status: 201, headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true, roles: staffRoles });

export const PATCH = withAuth(async (req, auth) => {
  const body = await readJson(req, 4 * 1024);
  const id = Number(body.id);
  const action = String(body.action ?? "");
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "درخواست جابه‌جایی معتبر نیست.");
  const manager = isManagerRole(auth.role);
  const ownId = manager ? null : await currentStaffId(auth.business.id, auth.user.id);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  const item = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [request] = await tx.select().from(staffShiftSwapRequests).where(and(eq(staffShiftSwapRequests.id, id), eq(staffShiftSwapRequests.businessId, auth.business.id))).for("update");
    if (!request) throw new HttpError(404, "درخواست جابه‌جایی پیدا نشد.");

    if (action === "respond") {
      if (manager || request.toStaffId !== ownId || request.status !== "pending_target") throw new HttpError(403, "این درخواست برای پاسخ شما در دسترس نیست.");
      if (body.decision !== "accept" && body.decision !== "reject") throw new HttpError(400, "پاسخ معتبر نیست.");
      if (body.decision === "accept") {
        const [shift] = await tx.select().from(staffSchedules).where(and(eq(staffSchedules.id, request.scheduleId), eq(staffSchedules.businessId, auth.business.id))).for("update");
        if (!shift || shift.status !== "scheduled" || shift.staffId !== request.fromStaffId || shift.startsAt.getTime() <= Date.now())
          throw new HttpError(409, "این شیفت تغییر کرده یا دیگر برای جابه‌جایی در دسترس نیست.");
      }
      const [updated] = await tx.update(staffShiftSwapRequests).set({ status: body.decision === "accept" ? "pending_manager" : "rejected", decisionNote: note, decidedBy: body.decision === "reject" ? auth.user.id : null, decidedAt: body.decision === "reject" ? new Date() : null })
        .where(and(eq(staffShiftSwapRequests.id, id), eq(staffShiftSwapRequests.status, "pending_target"))).returning();
      if (!updated) throw new HttpError(409, "درخواست هم‌زمان بررسی شده است.");
      return updated;
    }

    if (action !== "decide" || !manager || request.status !== "pending_manager" || (body.decision !== "approve" && body.decision !== "reject"))
      throw new HttpError(403, "تصمیم نهایی این درخواست فقط برای مدیر در دسترس است.");
    if (body.decision === "reject") {
      const [updated] = await tx.update(staffShiftSwapRequests).set({ status: "rejected", decisionNote: note, decidedBy: auth.user.id, decidedAt: new Date() }).where(and(eq(staffShiftSwapRequests.id, id), eq(staffShiftSwapRequests.status, "pending_manager"))).returning();
      if (!updated) throw new HttpError(409, "درخواست هم‌زمان بررسی شده است.");
      return updated;
    }

    const [shift] = await tx.select().from(staffSchedules).where(and(eq(staffSchedules.id, request.scheduleId), eq(staffSchedules.businessId, auth.business.id))).for("update");
    if (!shift || shift.status !== "scheduled" || shift.staffId !== request.fromStaffId || shift.startsAt.getTime() <= Date.now())
      throw new HttpError(409, "شیفت از زمان ثبت درخواست تغییر کرده یا دیگر قابل جابه‌جایی نیست.");
    const lockedStaff = await tx.select({ id: staff.id, isActive: staff.isActive }).from(staff).where(and(eq(staff.businessId, auth.business.id), inArray(staff.id, [request.fromStaffId, request.toStaffId]))).orderBy(asc(staff.id)).for("update");
    if (lockedStaff.length !== 2 || lockedStaff.some((member) => !member.isActive)) throw new HttpError(409, "هر دو کارمند باید همچنان فعال باشند.");
    const [overlap] = await tx.select({ id: staffSchedules.id }).from(staffSchedules).where(and(eq(staffSchedules.businessId, auth.business.id), eq(staffSchedules.staffId, request.toStaffId), eq(staffSchedules.status, "scheduled"), ne(staffSchedules.id, shift.id), lt(staffSchedules.startsAt, shift.endsAt), gt(staffSchedules.endsAt, shift.startsAt))).limit(1);
    if (overlap) throw new HttpError(409, "کارمند مقصد در این بازه شیفت دیگری دارد.");
    const [leave] = await tx.select({ id: staffLeaveRequests.id }).from(staffLeaveRequests).where(and(eq(staffLeaveRequests.businessId, auth.business.id), eq(staffLeaveRequests.staffId, request.toStaffId), eq(staffLeaveRequests.status, "approved"), lt(staffLeaveRequests.startsAt, shift.endsAt), gt(staffLeaveRequests.endsAt, shift.startsAt))).limit(1);
    if (leave) throw new HttpError(409, "کارمند مقصد برای این بازه مرخصی تأییدشده دارد.");
    const [updatedShift] = await tx.update(staffSchedules).set({ staffId: request.toStaffId, version: sql`${staffSchedules.version} + 1`, updatedBy: auth.user.id, updatedAt: new Date() })
      .where(and(eq(staffSchedules.id, shift.id), eq(staffSchedules.businessId, auth.business.id), eq(staffSchedules.staffId, request.fromStaffId), eq(staffSchedules.status, "scheduled"))).returning();
    if (!updatedShift) throw new HttpError(409, "شیفت هم‌زمان تغییر کرده است.");
    const [updated] = await tx.update(staffShiftSwapRequests).set({ status: "approved", decisionNote: note, decidedBy: auth.user.id, decidedAt: new Date() }).where(and(eq(staffShiftSwapRequests.id, id), eq(staffShiftSwapRequests.status, "pending_manager"))).returning();
    if (!updated) throw new HttpError(409, "درخواست هم‌زمان بررسی شده است.");
    return updated;
  });
  return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true, roles: staffRoles });
