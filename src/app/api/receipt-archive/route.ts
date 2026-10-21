import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { HttpError, withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export const GET = withAuth(async (req, auth) => {
  const url = new URL(req.url);
  const term = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw ? Number(cursorRaw) : null;
  if (cursor !== null && (!Number.isSafeInteger(cursor) || cursor < 1)) throw new HttpError(400, "ادامه صفحه معتبر نیست");
  const conditions = [eq(orders.businessId, auth.business.id), isNull(orders.deletedAt)];
  if (term) {
    const normalized = term.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
    const pattern = `%${normalized}%`;
    const number = Number(normalized);
    conditions.push(or(
      ...(Number.isSafeInteger(number) && number > 0 ? [eq(orders.number, number)] : []),
      sql`${orders.customerName} ILIKE ${pattern}`,
      sql`${orders.customerPhone} ILIKE ${pattern}`,
    )!);
  }
  if (cursor !== null) conditions.push(lt(orders.id, cursor));
  const rows = await db.select({ id: orders.id, number: orders.number, createdAt: orders.createdAt, status: orders.status, paymentStatus: orders.paymentStatus, total: orders.total, type: orders.type })
    .from(orders).where(and(...conditions)).orderBy(desc(orders.id)).limit(PAGE_SIZE + 1);
  const hasMore = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);
  return Response.json({ items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null, pageSize: PAGE_SIZE }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "cashier_pos", manager: true });
