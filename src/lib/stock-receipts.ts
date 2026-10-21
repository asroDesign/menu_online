import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accAccounts, inventoryCategories, inventoryItems, stockMovements, stockReceipts, suppliers, warehouses } from "@/db/schema";
import { HttpError, type Business } from "@/lib/auth";
import { C, ensureAccounting, postDocumentInTransaction, type LineIn } from "@/lib/accounting";

import { stockReceiptTotal, allocateStockValue } from "@/lib/stock-receipt-totals";
import { isWasteReason, type WasteReason } from "@/lib/stock-waste";

const text = (v: unknown, max = 200) => typeof v === "string" ? v.trim().slice(0, max) : "";
const numeric = (v: unknown, label: string, max = 1_000_000_000_000) => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") throw new HttpError(400, `${label} را وارد کنید`);
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, `${label} نامعتبر است`);
  return n;
};
const money = (v: unknown, label: string) => {
  const n = numeric(v, label);
  if (!Number.isSafeInteger(n)) throw new HttpError(400, `${label} باید به تومان و عدد صحیح باشد`);
  return n;
};

export async function saveStockReceipt(biz: Business, body: Record<string, unknown>, by = "") {
  await ensureAccounting(biz);
  return db.transaction((tx) => applyStockReceipt(tx as unknown as typeof db, biz, body, by));
}

export async function applyStockReceipt(tx: typeof db, biz: Business, body: Record<string, unknown>, by = "") {
  const type = String(body.type ?? "in");
  if (!["in", "out", "waste", "adjust"].includes(type)) throw new HttpError(400, "نوع گردش نامعتبر است");
  const rawLines = Array.isArray(body.lines) ? body.lines : [body];
  if (!rawLines.length || rawLines.length > 100) throw new HttpError(400, "فاکتور باید بین ۱ تا ۱۰۰ قلم داشته باشد");
  const date = body.date ? new Date(String(body.date)) : new Date();
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 86400_000) throw new HttpError(400, "تاریخ ثبت نامعتبر است");
  const payFrom = String(body.payFrom ?? "cash");
  if (!["cash", "bank", "payable"].includes(payFrom)) throw new HttpError(400, "روش پرداخت نامعتبر است");
  const requestKey = text(body.requestKey, 100) || randomUUID();
  const invoiceNo = text(body.invoiceNo, 40);
  const note = text(body.note);
  const wasteReason: WasteReason | "" = type === "waste"
    ? (isWasteReason(body.wasteReason) ? body.wasteReason : "other")
    : "";
  await tx.execute(sql`select pg_advisory_xact_lock(${biz.id})`);
  const [existing] = await tx.select().from(stockReceipts).where(and(eq(stockReceipts.businessId, biz.id), eq(stockReceipts.requestKey, requestKey)));
  if (existing) return { receipt: existing, items: await tx.select().from(stockMovements).where(eq(stockMovements.receiptId, existing.id)), replay: true };

  let supplier: typeof suppliers.$inferSelect | undefined;
  if (body.supplierId) {
    [supplier] = await tx.select().from(suppliers).where(and(eq(suppliers.id, Number(body.supplierId)), eq(suppliers.businessId, biz.id), eq(suppliers.isActive, true)));
    if (!supplier) throw new HttpError(400, "تأمین‌کننده معتبر و فعال انتخاب کنید");
  }
  if (type === "in" && supplier && invoiceNo) {
    const [duplicate] = await tx.select({ id: stockReceipts.id }).from(stockReceipts).where(and(eq(stockReceipts.businessId, biz.id), eq(stockReceipts.supplierId, supplier.id), eq(stockReceipts.invoiceNo, invoiceNo), eq(stockReceipts.type, "in")));
    if (duplicate) throw new HttpError(409, "این شماره فاکتور برای فروشنده قبلاً ثبت شده است");
  }
  const seen = new Set<number>();
  const prepared: { item: typeof inventoryItems.$inferSelect; quantity: number; delta: number; unitCost: number; gross: number; amount: number }[] = [];
  // Lock existing goods in a consistent order, including across multi-line invoices.
  const lines = [...rawLines].sort((a, b) => Number(a?.itemId ?? 0) - Number(b?.itemId ?? 0));
  for (const raw of lines) {
    if (!raw || typeof raw !== "object") throw new HttpError(400, "ردیف فاکتور نامعتبر است");
    const line = raw as Record<string, unknown>;
    let item: typeof inventoryItems.$inferSelect | undefined;
    if (line.newItem && typeof line.newItem === "object") {
      if (type !== "in" || line.itemId) throw new HttpError(400, "کالای جدید را فقط در ورود انبار تعریف کنید");
      const n = line.newItem as Record<string, unknown>;
      const name = text(n.name, 80), unit = text(n.unit, 20);
      if (!name || !unit) throw new HttpError(400, "نام و واحد کالای جدید الزامی است");
      if (n.trackStock !== undefined && typeof n.trackStock !== "boolean") throw new HttpError(400, "وضعیت ردیابی موجودی نامعتبر است");
      const warehouseId = n.warehouseId ? Number(n.warehouseId) : null;
      if (warehouseId) {
        const [wh] = await tx.select().from(warehouses).where(and(eq(warehouses.id, warehouseId), eq(warehouses.businessId, biz.id)));
        if (!wh) throw new HttpError(400, "انبار نامعتبر است");
      }
      const categoryId = n.categoryId ? Number(n.categoryId) : null;
      if (categoryId) {
        const [category] = await tx.select().from(inventoryCategories).where(and(eq(inventoryCategories.id, categoryId), eq(inventoryCategories.businessId, biz.id)));
        if (!category) throw new HttpError(400, "دسته‌بندی انبار نامعتبر است");
      }
      const [dup] = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.businessId, biz.id), eq(inventoryItems.name, name), warehouseId ? eq(inventoryItems.warehouseId, warehouseId) : sql`${inventoryItems.warehouseId} is null`));
      if (dup) throw new HttpError(409, `«${name}» در این انبار تعریف شده؛ آن را از فهرست کالاها انتخاب کنید`);
      [item] = await tx.insert(inventoryItems).values({ businessId: biz.id, name, unit, recipeUnit: unit, recipeToStockFactor: 1, warehouseId, categoryId, trackStock: n.trackStock !== false, minStock: numeric(n.minStock ?? 0, "حداقل موجودی", 1e9), stock: 0, costPerUnit: 0, lastPurchaseCost: 0, reorderPoint: 0, isActive: true }).returning();
    } else {
      const id = numeric(line.itemId, "کالا", 2147483647);
      [item] = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.id, id), eq(inventoryItems.businessId, biz.id))).for("update");
    }
    if (!item) throw new HttpError(404, "کالا پیدا نشد");
    if (seen.has(item.id)) throw new HttpError(400, "هر کالا را فقط در یک ردیف وارد کنید");
    seen.add(item.id);
    const quantity = numeric(line.quantity, "مقدار", 1e9);
    if (!quantity && type !== "adjust") throw new HttpError(400, "مقدار هر قلم باید بیشتر از صفر باشد");
    const delta = type === "in" ? quantity : type === "adjust" ? quantity - item.stock : -quantity;
    if (!delta) throw new HttpError(400, `موجودی «${item.name}» تغییری نکرده است`);
    if (item.stock + delta < 0) throw new HttpError(400, `موجودی «${item.name}» برای این خروج کافی نیست`);
    const unitCost = type === "in" ? money(line.unitCost === "" || line.unitCost === undefined ? item.costPerUnit : line.unitCost, "قیمت واحد") : item.costPerUnit;
    if (unitCost > 1_000_000_000) throw new HttpError(400, "قیمت واحد بیش از حد مجاز است");
    const gross = Math.round(Math.abs(delta) * unitCost);
    if (type === "in" && gross <= 0) throw new HttpError(400, "قیمت خرید هر قلم باید بیشتر از صفر باشد");
    prepared.push({ item, quantity, delta, unitCost, gross, amount: gross });
  }
  const subtotal = prepared.reduce((s, l) => s + l.gross, 0);
  const discount = type === "in" ? money(body.discount ?? 0, "تخفیف") : 0;
  const extraCost = type === "in" ? money(body.extraCost ?? 0, "هزینه جانبی") : 0;
  if (discount > subtotal) throw new HttpError(400, "تخفیف نمی‌تواند از جمع کالاها بیشتر باشد");
  const shippingCost = type === "in" ? money(body.shippingCost ?? 0, "هزینه ارسال") : 0;
  const taxAmount = type === "in" ? money(body.taxAmount ?? 0, "مالیات فاکتور") : 0;
  let total: number;
  try { total = stockReceiptTotal(subtotal, discount, extraCost, shippingCost, taxAmount); }
  catch (error) { throw new HttpError(400, (error as Error).message); }
  if (type === "in" && total <= 0) throw new HttpError(400, "جمع فاکتور باید بیشتر از صفر باشد");
  if (type === "in" && body.total !== undefined && money(body.total, "جمع درج‌شده در فاکتور") !== total) throw new HttpError(400, "جمع واردشده با جمع اقلام پس از تخفیف، ارسال، مالیات و هزینه جانبی برابر نیست");
  const paidAmount = type === "in" ? money(body.paidAmount ?? (payFrom === "payable" ? 0 : total), "مبلغ پرداختی") : 0;
  if (paidAmount > total || (payFrom === "payable" && paidAmount !== 0)) throw new HttpError(400, "مبلغ پرداختی نامعتبر است");
  const remaining = type === "in" ? total - paidAmount : 0;
  if (remaining > 0 && !supplier?.accountId) throw new HttpError(400, "برای بخش نسیه فاکتور، فروشنده دارای حساب را انتخاب کنید");
  if (remaining > 0) {
    const [account] = await tx.select().from(accAccounts).where(and(eq(accAccounts.id, supplier!.accountId!), eq(accAccounts.businessId, biz.id), eq(accAccounts.isActive, true)));
    if (!account) throw new HttpError(400, "حساب فروشنده معتبر نیست");
  }
  // Allocate discount/freight to stock value; cumulative rounding preserves the exact invoice total.
  if (type === "in") {
    const amounts = allocateStockValue(prepared.map((line) => line.gross), total);
    prepared.forEach((line, index) => { line.amount = amounts[index]; });
  }
  const [receipt] = await tx.insert(stockReceipts).values({ businessId: biz.id, requestKey, type, date, invoiceNo, supplierId: supplier?.id, subtotal, discount, extraCost, shippingCost, taxAmount, total, paidAmount, payFrom, wasteReason, note, createdBy: by }).returning();
  const accounting: LineIn[] = [];
  const movements: (typeof stockMovements.$inferSelect)[] = [];
  for (const line of prepared) {
    const { item, quantity, delta, amount } = line;
    const base = Math.max(0, item.stock);
    const costPerUnit = type === "in" ? Math.round((base * item.costPerUnit + amount) / (base + quantity)) : item.costPerUnit;
    if (costPerUnit > 2147483647) throw new HttpError(400, "بهای واحد پس از هزینه‌های جانبی بیش از حد مجاز است");
    const [updated] = await tx.update(inventoryItems).set({ stock: sql`${inventoryItems.stock} + ${delta}`, costPerUnit, ...(type === "in" ? { lastPurchaseCost: line.unitCost } : {}) }).where(and(eq(inventoryItems.id, item.id), eq(inventoryItems.businessId, biz.id))).returning();
    const [movement] = await tx.insert(stockMovements).values({ businessId: biz.id, receiptId: receipt.id, itemId: item.id, type, delta, balanceAfter: updated.stock, unitCost: line.unitCost, amount, note, invoiceNo, supplierId: supplier?.id, createdAt: date }).returning();
    movements.push(movement);
    if (!amount) continue;
    if (type === "in" || delta > 0) accounting.push({ code: C.INV, debit: amount, description: item.name });
    else accounting.push({ code: C.INV, credit: amount, description: item.name });
    if (type !== "in") accounting.push(delta > 0 ? { code: C.STOCK_GAIN, credit: amount, description: item.name } : { code: type === "out" ? C.COGS : C.WASTE, debit: amount, description: item.name });
  }
  if (type === "in") {
    if (paidAmount) accounting.push({ code: payFrom === "bank" ? C.BANK : C.CASH, credit: paidAmount });
    if (remaining) accounting.push({ accountId: supplier!.accountId!, credit: remaining });
  }
  let documentId: number | null = null;
  if (accounting.length) {
    const doc = await postDocumentInTransaction(tx, biz, { date, source: "inventory", sourceRef: `receipt:${receipt.id}`, createdBy: by, description: `${type === "in" ? "خرید" : "گردش"} انبار #${receipt.id}${invoiceNo ? ` — فاکتور ${invoiceNo}` : ""}${supplier ? ` — ${supplier.name}` : ""}${note ? ` — ${note}` : ""}`.slice(0, 200), lines: accounting });
    documentId = doc.id;
    await tx.update(stockReceipts).set({ documentId }).where(eq(stockReceipts.id, receipt.id));
  }
  return { receipt: { ...receipt, documentId }, items: movements, replay: false };
}
