import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { cashShifts, users } from "@/db/schema";
import { HttpError, withAuth } from "@/lib/auth";
import { cashShiftTotalsByShift } from "@/lib/cash-shifts";

export const GET = withAuth(async (req, auth) => {
  const requested = Number(new URL(req.url).searchParams.get("days"));
  const days = [7, 14, 30].includes(requested) ? requested : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);
  const rows = await db.select().from(cashShifts)
    .where(and(eq(cashShifts.businessId, auth.business.id), isNotNull(cashShifts.closedAt), gte(cashShifts.openedAt, since)))
    .orderBy(desc(cashShifts.closedAt)).limit(100);
  const userIds = [...new Set(rows.flatMap((row) => [row.openedBy, row.closedBy].filter((id): id is number => id !== null)))];
  const usersRows = userIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [];
  const userNames = new Map(usersRows.map((user) => [user.id, user.name]));
  const totals = await cashShiftTotalsByShift(db, auth.business.id, rows.map((row) => row.id));
  return Response.json({
    days,
    items: rows.map((row) => {
      const shiftTotals = totals.get(row.id) ?? { cashSales: 0, nonCashSales: 0, byMethod: [] };
      return { ...row, ...shiftTotals, openedByName: userNames.get(row.openedBy) ?? "کاربر", closedByName: row.closedBy ? userNames.get(row.closedBy) ?? "کاربر" : "—" };
    }),
    limited: rows.length === 100,
  }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "cashier_pos", manager: true });
