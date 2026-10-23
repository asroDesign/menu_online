import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerPointEntries, customers } from "@/db/schema";
import { HttpError } from "@/lib/auth";

type PointDb = typeof db;

/** The caller supplies a transaction so the immutable entry and cached customer balance commit together. */
export async function addCustomerPoints(tx: PointDb, input: {
  businessId: number;
  customerId: number;
  amount: number;
  kind: "purchase" | "referral" | "review" | "redeem" | "adjustment";
  idempotencyKey: string;
  note: string;
  orderId?: number | null;
  reviewId?: number | null;
}) {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0 || Math.abs(input.amount) > 100_000_000)
    throw new HttpError(400, "مقدار امتیاز معتبر نیست");
  const key = input.idempotencyKey.trim().slice(0, 160);
  if (!key) throw new HttpError(400, "شناسهٔ یکتای امتیاز لازم است");
  const [entry] = await tx.insert(customerPointEntries).values({
    businessId: input.businessId,
    customerId: input.customerId,
    orderId: input.orderId ?? null,
    reviewId: input.reviewId ?? null,
    kind: input.kind,
    amount: input.amount,
    idempotencyKey: key,
    note: input.note.slice(0, 300),
  }).onConflictDoNothing().returning({ id: customerPointEntries.id });
  if (!entry) return false;

  const [updated] = await tx.update(customers).set({ points: sql`${customers.points} + ${input.amount}` })
    .where(input.amount < 0
      ? and(eq(customers.id, input.customerId), eq(customers.businessId, input.businessId), sql`${customers.points} >= ${-input.amount}`)
      : and(eq(customers.id, input.customerId), eq(customers.businessId, input.businessId)))
    .returning({ id: customers.id });
  if (!updated) throw new HttpError(input.amount < 0 ? 409 : 404, input.amount < 0 ? "امتیاز کافی نیست" : "مشتری برای ثبت امتیاز پیدا نشد");
  return true;
}
