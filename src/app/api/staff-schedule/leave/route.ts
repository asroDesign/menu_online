import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { staff, staffLeaveRequests, staffSchedules } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { parseTehranDateTime } from "@/lib/tehran-time";

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 8 * 1024);
  const startsAt = parseTehranDateTime(body.startsAt), endsAt = parseTehranDateTime(body.endsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 31 * 86_400_000)
    throw new HttpError(400, "بازه مرخصی معتبر نیست.");
  const kind = ["personal", "sick", "unpaid"].includes(String(body.kind)) ? String(body.kind) : "personal";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const [member] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, auth.business.id), eq(staff.userId, auth.user.id), eq(staff.isActive, true)));
  if (!member) throw new HttpError(403, "درخواست مرخصی فقط برای کارمند فعال متصل به این حساب ممکن است.");
  const [item] = await db.insert(staffLeaveRequests).values({ businessId: auth.business.id, staffId: member.id, startsAt, endsAt, kind, reason }).returning();
  return Response.json({ item }, { status: 201, headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true, roles: ["waiter", "cashier", "chef", "warehouse", "accountant"] });

export const PATCH = withAuth(async (req, auth) => {
  const body = await readJson(req, 4 * 1024);
  const id = Number(body.id);
  const rawDecision = body.status;
  if (!Number.isSafeInteger(id) || id < 1 || (rawDecision !== "approved" && rawDecision !== "rejected")) throw new HttpError(400, "تصمیم مرخصی معتبر نیست.");
  const decision: "approved" | "rejected" = rawDecision;
  const item = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [leave] = await tx.select().from(staffLeaveRequests).where(and(eq(staffLeaveRequests.id, id), eq(staffLeaveRequests.businessId, auth.business.id))).for("update");
    if (!leave) throw new HttpError(404, "درخواست مرخصی پیدا نشد.");
    if (leave.status !== "pending") throw new HttpError(409, "این درخواست قبلاً بررسی شده است.");
    if (decision === "approved") {
      await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.id, leave.staffId), eq(staff.businessId, auth.business.id))).for("update");
      const [overlap] = await tx.select({ id: staffLeaveRequests.id }).from(staffLeaveRequests).where(and(eq(staffLeaveRequests.businessId, auth.business.id), eq(staffLeaveRequests.staffId, leave.staffId), eq(staffLeaveRequests.status, "approved"), lt(staffLeaveRequests.startsAt, leave.endsAt), gt(staffLeaveRequests.endsAt, leave.startsAt))).limit(1);
      if (overlap) throw new HttpError(409, "با مرخصی تأییدشده دیگری تداخل دارد.");
      const [shift] = await tx.select({ id: staffSchedules.id }).from(staffSchedules).where(and(eq(staffSchedules.businessId, auth.business.id), eq(staffSchedules.staffId, leave.staffId), eq(staffSchedules.status, "scheduled"), lt(staffSchedules.startsAt, leave.endsAt), gt(staffSchedules.endsAt, leave.startsAt))).limit(1);
      if (shift) throw new HttpError(409, "برای این بازه شیفت فعال ثبت شده است.");
    }
    const [updated] = await tx.update(staffLeaveRequests).set({ status: decision, decidedBy: auth.user.id, decidedAt: new Date(), decisionNote: typeof body.note === "string" ? body.note.trim().slice(0, 300) : "" }).where(and(eq(staffLeaveRequests.id, id), eq(staffLeaveRequests.businessId, auth.business.id), eq(staffLeaveRequests.status, "pending"))).returning();
    if (!updated) throw new HttpError(409, "درخواست هم‌زمان تغییر کرده است.");
    return updated;
  });
  return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true });
