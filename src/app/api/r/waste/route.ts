import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, stockMovements, stockReceipts, warehouses } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { saveStockReceipt } from "@/lib/stock-receipts";
import { csvCell } from "@/lib/csv";
import { isWasteReason } from "@/lib/stock-waste";

export const dynamic = "force-dynamic";

const access = { feature: "stock_movements", manager: true, roles: ["warehouse"] };
const DAY_MS = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function parseDay(value: string, label: string) {
  if (!DAY_RE.test(value)) throw new HttpError(400, `${label} را با تقویم شمسی انتخاب کنید`);
  const noon = new Date(`${value}T12:00:00+03:30`);
  if (!Number.isFinite(noon.getTime()) || dayKey(noon) !== value) throw new HttpError(400, `${label} معتبر نیست`);
  return new Date(`${value}T00:00:00+03:30`);
}

function csvResponse(rows: Array<{ createdAt: Date; itemName: string; quantity: number; unit: string; wasteReason: string | null; amount: number; balanceAfter: number; warehouseName: string | null; note: string; documentId: number | null }>) {
  const header = ["تاریخ", "ماده", "مقدار", "واحد", "دلیل", "هزینه (تومان)", "مانده پس از ثبت", "انبار", "توضیحات", "شناسه سند"];
  const body = rows.map((row) => [row.createdAt.toISOString(), row.itemName, row.quantity, row.unit, row.wasteReason || "other", row.amount, row.balanceAfter, row.warehouseName ?? "", row.note, row.documentId ?? ""]);
  const csv = `\uFEFF${[header, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename*=UTF-8''inventory-waste.csv", "Cache-Control": "no-store" } });
}

export const GET = withAuth(async (req, auth) => {
  const url = new URL(req.url);
  const today = dayKey(new Date());
  const defaultFrom = dayKey(new Date(Date.now() - 29 * DAY_MS));
  const from = url.searchParams.get("from") || defaultFrom;
  const to = url.searchParams.get("to") || today;
  const fromDate = parseDay(from, "تاریخ شروع");
  const toDate = parseDay(to, "تاریخ پایان");
  if (fromDate > toDate) throw new HttpError(400, "تاریخ شروع باید پیش از تاریخ پایان باشد");
  const toExclusive = new Date(toDate.getTime() + DAY_MS);
  const rangeMs = toExclusive.getTime() - fromDate.getTime();
  if (rangeMs > 367 * DAY_MS) throw new HttpError(400, "بازه گزارش حداکثر یک سال است");

  const rawItemId = url.searchParams.get("itemId");
  const itemId = rawItemId ? Number(rawItemId) : null;
  if (itemId !== null && (!Number.isSafeInteger(itemId) || itemId < 1)) throw new HttpError(400, "قلم انبار معتبر نیست");
  const rawReason = url.searchParams.get("reason");
  if (rawReason && rawReason !== "all" && !isWasteReason(rawReason)) throw new HttpError(400, "دلیل ضایعات معتبر نیست");
  const reason = rawReason && rawReason !== "all" ? rawReason : null;
  const conditions = [eq(stockMovements.businessId, auth.business.id), eq(stockMovements.type, "waste"), gte(stockMovements.createdAt, fromDate), lt(stockMovements.createdAt, toExclusive)];
  if (itemId) conditions.push(eq(stockMovements.itemId, itemId));
  if (reason) conditions.push(eq(stockReceipts.wasteReason, reason));
  const where = and(...conditions);
  const baseConditions = [eq(stockMovements.businessId, auth.business.id), eq(stockMovements.type, "waste"), gte(stockMovements.createdAt, new Date(fromDate.getTime() - rangeMs)), lt(stockMovements.createdAt, fromDate)];
  if (itemId) baseConditions.push(eq(stockMovements.itemId, itemId));
  if (reason) baseConditions.push(eq(stockReceipts.wasteReason, reason));
  const previousWhere = and(...baseConditions);

  const rawPage = Number(url.searchParams.get("page") ?? 1);
  const rawPageSize = Number(url.searchParams.get("pageSize") ?? 30);
  if (!Number.isSafeInteger(rawPage) || rawPage < 1 || rawPage > 100_000 || !Number.isSafeInteger(rawPageSize) || rawPageSize < 1 || rawPageSize > 100)
    throw new HttpError(400, "صفحه‌بندی گزارش معتبر نیست");
  const exporting = url.searchParams.get("format") === "csv";
  const limit = exporting ? 5000 : rawPageSize;
  const offset = exporting ? 0 : (rawPage - 1) * rawPageSize;

  const [aggregate, previousAggregate, countResult, rows, topItems, reasons, daily, quantityByUnit] = await Promise.all([
    db.select({ entryCount: sql<number>`count(*)::int`, receiptCount: sql<number>`count(distinct ${stockMovements.receiptId})::int`, totalCost: sql<number>`coalesce(sum(${stockMovements.amount}), 0)::float8` })
      .from(stockMovements).leftJoin(stockReceipts, eq(stockReceipts.id, stockMovements.receiptId)).where(where),
    db.select({ totalCost: sql<number>`coalesce(sum(${stockMovements.amount}), 0)::float8` })
      .from(stockMovements).leftJoin(stockReceipts, eq(stockReceipts.id, stockMovements.receiptId)).where(previousWhere),
    db.select({ count: sql<number>`count(*)::int` }).from(stockMovements).leftJoin(stockReceipts, eq(stockReceipts.id, stockMovements.receiptId)).where(where),
    db.select({ id: stockMovements.id, itemId: stockMovements.itemId, itemName: inventoryItems.name, unit: inventoryItems.unit, quantity: sql<number>`abs(${stockMovements.delta})::float8`, balanceAfter: stockMovements.balanceAfter, amount: stockMovements.amount, note: stockMovements.note, createdAt: stockMovements.createdAt, receiptId: stockMovements.receiptId, documentId: stockReceipts.documentId, wasteReason: stockReceipts.wasteReason, warehouseName: warehouses.name })
      .from(stockMovements).innerJoin(inventoryItems, eq(inventoryItems.id, stockMovements.itemId)).leftJoin(stockReceipts, eq(stockReceipts.id, stockMovements.receiptId)).leftJoin(warehouses, eq(warehouses.id, inventoryItems.warehouseId)).where(where).orderBy(desc(stockMovements.createdAt), desc(stockMovements.id)).limit(limit).offset(offset),
    db.select({ itemId: inventoryItems.id, name: inventoryItems.name, unit: inventoryItems.unit, quantity: sql<number>`coalesce(sum(abs(${stockMovements.delta})), 0)::float8`, cost: sql<number>`coalesce(sum(${stockMovements.amount}), 0)::float8` })
      .from(stockMovements).innerJoin(inventoryItems, eq(inventoryItems.id, stockMovements.itemId)).leftJoin(stockReceipts, eq(stockReceipts.id, stockMovements.receiptId)).where(where).groupBy(inventoryItems.id, inventoryItems.name, inventoryItems.unit).orderBy(sql`sum(${stockMovements.amount}) desc`).limit(6),
    db.select({ reason: sql<string>`coalesce(nullif(${stockReceipts.wasteReason}, ''), 'other')`, quantity: sql<number>`coalesce(sum(abs(${stockMovements.delta})), 0)::float8`, cost: sql<number>`coalesce(sum(${stockMovements.amount}), 0)::float8` })
      .from(stockMovements).leftJoin(stockReceipts, eq(stockReceipts.id, stockMovements.receiptId)).where(where).groupBy(sql`coalesce(nullif(${stockReceipts.wasteReason}, ''), 'other')`).orderBy(sql`sum(${stockMovements.amount}) desc`),
    db.select({ day: sql<string>`to_char(${stockMovements.createdAt} at time zone 'Asia/Tehran', 'YYYY-MM-DD')`, quantity: sql<number>`coalesce(sum(abs(${stockMovements.delta})), 0)::float8`, cost: sql<number>`coalesce(sum(${stockMovements.amount}), 0)::float8` })
      .from(stockMovements).leftJoin(stockReceipts, eq(stockReceipts.id, stockMovements.receiptId)).where(where).groupBy(sql`to_char(${stockMovements.createdAt} at time zone 'Asia/Tehran', 'YYYY-MM-DD')`).orderBy(sql`to_char(${stockMovements.createdAt} at time zone 'Asia/Tehran', 'YYYY-MM-DD')`),
    db.select({ unit: inventoryItems.unit, quantity: sql<number>`coalesce(sum(abs(${stockMovements.delta})), 0)::float8` })
      .from(stockMovements).innerJoin(inventoryItems, eq(inventoryItems.id, stockMovements.itemId)).leftJoin(stockReceipts, eq(stockReceipts.id, stockMovements.receiptId)).where(where).groupBy(inventoryItems.unit).orderBy(inventoryItems.unit),
  ]);
  if (exporting) return csvResponse(rows);
  const [stats] = aggregate;
  const [previous] = previousAggregate;
  const [count] = countResult;
  const previousCost = Number(previous?.totalCost ?? 0);
  const currentCost = Number(stats?.totalCost ?? 0);
  const changePercent = previousCost ? Math.round((currentCost - previousCost) / previousCost * 1000) / 10 : null;
  return Response.json({
    range: { from, to },
    summary: { entryCount: Number(stats?.entryCount ?? 0), receiptCount: Number(stats?.receiptCount ?? 0), quantityByUnit, totalCost: currentCost, previousCost, changePercent },
    items: rows,
    topItems,
    reasons,
    daily,
    pagination: { page: rawPage, pageSize: rawPageSize, total: Number(count?.count ?? 0), pages: Math.ceil(Number(count?.count ?? 0) / rawPageSize) },
  }, { headers: { "Cache-Control": "no-store" } });
}, access);

export const POST = withAuth(async (req, auth) => {
  await enforceRateLimit(req, "inventory-waste-create", String(auth.business.id), 60, 60 * 60_000);
  const body = await readJson(req, 64 * 1024);
  if (!isWasteReason(body.wasteReason)) throw new HttpError(400, "دلیل ضایعات را انتخاب کنید");
  const result = await saveStockReceipt(auth.business, { ...body, type: "waste" }, auth.user.name);
  return Response.json({ ...result, item: result.items[0] }, { status: result.replay ? 200 : 201 });
}, access);
