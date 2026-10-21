import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cashShifts } from "@/db/schema";
import { errorResponse, HttpError, readJson, withAuth } from "@/lib/auth";
import { cashShiftTotals } from "@/lib/cash-shifts";

const shiftAccess = { feature: "cashier_pos", manager: true, roles: ["cashier"] };

export const GET = withAuth(async (_req, auth) => {
  const [shift] = await db.select().from(cashShifts)
    .where(and(eq(cashShifts.businessId, auth.business.id), isNull(cashShifts.closedAt)))
    .orderBy(desc(cashShifts.openedAt)).limit(1);
  if (!shift) return Response.json({ item: null });
  const totals = await cashShiftTotals(db, auth.business.id, shift.id);
  return Response.json({ item: { ...shift, ...totals, expectedCash: shift.openingCash + totals.cashSales } }, { headers: { "Cache-Control": "no-store" } });
}, shiftAccess);

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 4 * 1024);
  const openingCash = Number(body.openingCash);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (!Number.isSafeInteger(openingCash) || openingCash < 0 || openingCash > 2_147_483_647)
    throw new HttpError(400, "موجودی آغاز شیفت معتبر نیست");
  try {
    const [item] = await db.insert(cashShifts).values({ businessId: auth.business.id, openedBy: auth.user.id, openingCash, note })
      .returning();
    return Response.json({ item: { ...item, cashSales: 0, nonCashSales: 0, byMethod: [], expectedCash: openingCash } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}, shiftAccess);
