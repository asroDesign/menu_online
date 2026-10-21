import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, transactions } from "@/db/schema";

type QueryDb = typeof db;

export async function cashShiftTotals(executor: QueryDb, businessId: number, shiftId: number) {
  const method = sql<string | null>`coalesce(${transactions.settlementMethod}, ${orders.paymentMethod})`;
  const signedAmount = sql<number>`coalesce(sum(case when ${transactions.kind} = 'expense' then -${transactions.amount} else ${transactions.amount} end), 0)::int`;
  const rows = await executor.select({
    method,
    amount: signedAmount,
  }).from(transactions)
    .leftJoin(orders, and(eq(orders.id, transactions.orderId), eq(orders.businessId, transactions.businessId)))
    .where(and(
      eq(transactions.businessId, businessId),
      eq(transactions.shiftId, shiftId),
      eq(transactions.kind, "income"),
      inArray(transactions.source, ["sale", "receivable", "receivable_reversal"]),
    )).groupBy(method);
  return summarize(rows);
}

function summarize(rows: { method: string | null; amount: number }[]) {
  const byMethod = rows.map((row) => ({ method: row.method ?? "unknown", amount: Number(row.amount) }));
  const cashSales = byMethod.filter((row) => row.method === "cash").reduce((sum, row) => sum + row.amount, 0);
  const nonCashSales = byMethod.filter((row) => row.method !== "cash").reduce((sum, row) => sum + row.amount, 0);
  return { cashSales, nonCashSales, byMethod };
}

export async function cashShiftTotalsByShift(executor: QueryDb, businessId: number, shiftIds: number[]) {
  const result = new Map<number, ReturnType<typeof summarize>>();
  if (!shiftIds.length) return result;
  const method = sql<string | null>`coalesce(${transactions.settlementMethod}, ${orders.paymentMethod})`;
  const signedAmount = sql<number>`coalesce(sum(case when ${transactions.kind} = 'expense' then -${transactions.amount} else ${transactions.amount} end), 0)::int`;
  const rows = await executor.select({
    shiftId: transactions.shiftId,
    method,
    amount: signedAmount,
  }).from(transactions)
    .leftJoin(orders, and(eq(orders.id, transactions.orderId), eq(orders.businessId, transactions.businessId)))
    .where(and(
      eq(transactions.businessId, businessId),
      inArray(transactions.shiftId, shiftIds),
      eq(transactions.kind, "income"),
      inArray(transactions.source, ["sale", "receivable", "receivable_reversal"]),
    )).groupBy(transactions.shiftId, method);
  for (const shiftId of shiftIds) result.set(shiftId, summarize(rows.filter((row) => row.shiftId === shiftId)));
  return result;
}
