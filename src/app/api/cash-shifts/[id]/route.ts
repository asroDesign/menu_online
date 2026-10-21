import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cashShifts } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { cashShiftTotals } from "@/lib/cash-shifts";

export const POST = withAuth<{ id: string }>(async (req, auth, { id }) => {
  const shiftId = Number(id);
  if (!Number.isInteger(shiftId) || shiftId < 1) throw new HttpError(404, "شیفت صندوق پیدا نشد");
  const body = await readJson(req, 4 * 1024);
  const closingCash = Number(body.closingCash);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (!Number.isSafeInteger(closingCash) || closingCash < 0 || closingCash > 2_147_483_647)
    throw new HttpError(400, "موجودی پایان شیفت معتبر نیست");
  const item = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [shift] = await tx.select().from(cashShifts)
      .where(and(eq(cashShifts.id, shiftId), eq(cashShifts.businessId, auth.business.id)))
      .for("update");
    if (!shift) throw new HttpError(404, "شیفت صندوق پیدا نشد");
    if (shift.closedAt) throw new HttpError(409, "این شیفت قبلاً بسته شده است");
    const totals = await cashShiftTotals(tx, auth.business.id, shift.id);
    const expectedCash = shift.openingCash + totals.cashSales;
    const [closed] = await tx.update(cashShifts).set({
      closedBy: auth.user.id,
      closedAt: new Date(),
      closingCash,
      expectedCash,
      cashDifference: closingCash - expectedCash,
      note: [shift.note, note].filter(Boolean).join("\n").slice(0, 1000),
    }).where(and(eq(cashShifts.id, shift.id), eq(cashShifts.businessId, auth.business.id), isNull(cashShifts.closedAt))).returning();
    if (!closed) throw new HttpError(409, "این شیفت قبلاً بسته شده است");
    return { ...closed, ...totals };
  });
  return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "cashier_pos", manager: true, roles: ["cashier"] });
