import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { staffSchedules } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";

export const PATCH = withAuth<{ id: string }>(async (req, auth, { id }) => {
  const shiftId = Number(id);
  if (!Number.isSafeInteger(shiftId) || shiftId < 1) throw new HttpError(404, "شیفت پیدا نشد.");
  const body = await readJson(req, 4 * 1024);
  if (body.status !== "canceled") throw new HttpError(400, "فقط لغو شیفت پشتیبانی می‌شود.");
  const [item] = await db.update(staffSchedules).set({ status: "canceled", version: sql`${staffSchedules.version} + 1`, updatedBy: auth.user.id, updatedAt: new Date() }).where(and(eq(staffSchedules.id, shiftId), eq(staffSchedules.businessId, auth.business.id), eq(staffSchedules.status, "scheduled"))).returning();
  if (!item) throw new HttpError(404, "شیفت فعال پیدا نشد.");
  return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "staff_scheduling", manager: true });
