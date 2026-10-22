import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { staff, staffLeaveRequests, staffSchedules, staffShiftTemplates } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const tehranParts = (date: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
const dateKey = (date: Date) => {
  const parts = tehranParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const dateOnlyNumber = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};
const atTehranTime = (day: string, time: string) => new Date(`${day}T${time}:00+03:30`);

export const GET = withAuth(async (_req, auth) => {
  const items = await db.select({ id: staffShiftTemplates.id, staffId: staffShiftTemplates.staffId, staffName: staff.name, name: staffShiftTemplates.name, weekdays: staffShiftTemplates.weekdays, startTime: staffShiftTemplates.startTime, endTime: staffShiftTemplates.endTime, location: staffShiftTemplates.location, isActive: staffShiftTemplates.isActive })
    .from(staffShiftTemplates).innerJoin(staff, eq(staff.id, staffShiftTemplates.staffId))
    .where(and(eq(staffShiftTemplates.businessId, auth.business.id), eq(staffShiftTemplates.isActive, true))).limit(200);
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true });

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 8 * 1024);
  const from = new Date(String(body.from ?? "")), to = new Date(String(body.to ?? ""));
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 32 * 86_400_000)
    throw new HttpError(400, "دوره اعمال الگو باید حداکثر یک ماه باشد.");

  const result = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    let template: typeof staffShiftTemplates.$inferSelect;
    if (body.templateId !== undefined) {
      const templateId = Number(body.templateId);
      if (!Number.isSafeInteger(templateId) || templateId < 1) throw new HttpError(400, "الگوی شیفت معتبر نیست.");
      const [found] = await tx.select().from(staffShiftTemplates).where(and(eq(staffShiftTemplates.id, templateId), eq(staffShiftTemplates.businessId, auth.business.id), eq(staffShiftTemplates.isActive, true))).for("update");
      if (!found) throw new HttpError(404, "الگوی فعال پیدا نشد.");
      template = found;
    } else {
      const staffId = Number(body.staffId);
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
      const weekdays = Array.isArray(body.weekdays) ? [...new Set(body.weekdays.map(Number))].sort((a, b) => a - b) : [];
      const startTime = String(body.startTime ?? "");
      const endTime = String(body.endTime ?? "");
      const location = typeof body.location === "string" ? body.location.trim().slice(0, 100) : "";
      if (!Number.isSafeInteger(staffId) || staffId < 1 || !name || !weekdays.length || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || !timePattern.test(startTime) || !timePattern.test(endTime) || startTime === endTime)
        throw new HttpError(400, "نام، کارمند، روزهای هفته و ساعت شروع و پایان الگو را کامل و درست وارد کنید.");
      const [created] = await tx.insert(staffShiftTemplates).values({ businessId: auth.business.id, staffId, name, weekdays: weekdays.join(","), startTime, endTime, location, createdBy: auth.user.id }).returning();
      template = created;
    }

    const [member] = await tx.select({ id: staff.id, isActive: staff.isActive }).from(staff)
      .where(and(eq(staff.id, template.staffId), eq(staff.businessId, auth.business.id))).for("update");
    if (!member?.isActive) throw new HttpError(409, "کارمند این الگو فعال نیست.");

    const weekdaySet = new Set(template.weekdays.split(",").map(Number));
    const firstDay = dateKey(from), lastDay = dateKey(to);
    const dayLimit = Math.ceil((dateOnlyNumber(lastDay) - dateOnlyNumber(firstDay)) / 86_400_000);
    if (dayLimit < 1 || dayLimit > 31) throw new HttpError(400, "بازه اعمال باید بین یک تا ۳۱ روز باشد.");
    let createdCount = 0, existingCount = 0;
    for (let offset = 0; offset < dayLimit; offset++) {
      const dayDate = new Date(dateOnlyNumber(firstDay) + offset * 86_400_000);
      const weekday = dayDate.getUTCDay();
      if (!weekdaySet.has(weekday)) continue;
      const day = `${dayDate.getUTCFullYear()}-${String(dayDate.getUTCMonth() + 1).padStart(2, "0")}-${String(dayDate.getUTCDate()).padStart(2, "0")}`;
      const startsAt = atTehranTime(day, template.startTime);
      let endsAt = atTehranTime(day, template.endTime);
      if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86_400_000);
      if (endsAt.getTime() - startsAt.getTime() > 24 * 60 * 60_000) throw new HttpError(400, "مدت شیفت الگو نمی‌تواند بیشتر از ۲۴ ساعت باشد.");
      if (startsAt < from || startsAt >= to) continue;

      const [generated] = await tx.select({ id: staffSchedules.id }).from(staffSchedules).where(and(
        eq(staffSchedules.businessId, auth.business.id), eq(staffSchedules.templateId, template.id),
        eq(staffSchedules.staffId, template.staffId), eq(staffSchedules.startsAt, startsAt), eq(staffSchedules.endsAt, endsAt),
      )).limit(1);
      if (generated) { existingCount++; continue; }
      const [overlap] = await tx.select({ id: staffSchedules.id }).from(staffSchedules).where(and(
        eq(staffSchedules.businessId, auth.business.id), eq(staffSchedules.staffId, template.staffId), eq(staffSchedules.status, "scheduled"),
        lt(staffSchedules.startsAt, endsAt), gt(staffSchedules.endsAt, startsAt),
      )).limit(1);
      if (overlap) throw new HttpError(409, `برای ${day} شیفت دیگری با این الگو تداخل دارد؛ هیچ تغییری ثبت نشد.`);
      const [leave] = await tx.select({ id: staffLeaveRequests.id }).from(staffLeaveRequests).where(and(
        eq(staffLeaveRequests.businessId, auth.business.id), eq(staffLeaveRequests.staffId, template.staffId), eq(staffLeaveRequests.status, "approved"),
        lt(staffLeaveRequests.startsAt, endsAt), gt(staffLeaveRequests.endsAt, startsAt),
      )).limit(1);
      if (leave) throw new HttpError(409, `برای ${day} مرخصی تأییدشده وجود دارد؛ هیچ تغییری ثبت نشد.`);
      await tx.insert(staffSchedules).values({ businessId: auth.business.id, staffId: template.staffId, templateId: template.id, startsAt, endsAt, location: template.location, createdBy: auth.user.id, updatedBy: auth.user.id });
      createdCount++;
    }
    return { template, createdCount, existingCount };
  });
  return Response.json({ ...result }, { status: 201, headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true });
