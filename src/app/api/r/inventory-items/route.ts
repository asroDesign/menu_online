import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventoryCategories, inventoryItems, stockMovements, warehouses } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { C, ensureAccounting, postDocumentInTransaction } from "@/lib/accounting";
import { recipeToStockFactor, validInventoryUnit } from "@/lib/inventory-units";

const integerMoney = (value: unknown, label: string, max = 1_000_000_000) => {
  if (value === undefined || value === null || value === "") return 0;
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > max) throw new HttpError(400, `${label} باید تومان صحیح و نامنفی باشد`);
  return amount;
};
const quantity = (value: unknown, label: string, max = 1_000_000_000) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0 || amount > max) throw new HttpError(400, `${label} معتبر نیست`);
  return amount;
};
const validDate = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, "تاریخ انقضا معتبر نیست");
  const d = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new HttpError(400, "تاریخ انقضا معتبر نیست");
  return value;
};
const faToEn = (value: string) => value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 64 * 1024);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const unit = typeof body.unit === "string" ? body.unit : "";
  const recipeUnit = typeof body.recipeUnit === "string" ? body.recipeUnit : "";
  if (!name) throw new HttpError(400, "نام قلم را وارد کنید");
  if (!validInventoryUnit(unit) || !validInventoryUnit(recipeUnit)) throw new HttpError(400, "واحد انبار یا رسپی معتبر نیست");

  const warehouseId = body.warehouseId === "" || body.warehouseId === null || body.warehouseId === undefined ? null : Number(body.warehouseId);
  const categoryId = body.categoryId === "" || body.categoryId === null || body.categoryId === undefined ? null : Number(body.categoryId);
  if (warehouseId !== null && (!Number.isSafeInteger(warehouseId) || warehouseId < 1)) throw new HttpError(400, "انبار معتبر نیست");
  if (categoryId !== null && (!Number.isSafeInteger(categoryId) || categoryId < 1)) throw new HttpError(400, "دسته‌بندی معتبر نیست");
  const openingStock = quantity(body.openingStock, "موجودی اول دوره");
  const minStock = quantity(body.minStock, "کف موجودی");
  const reorderPoint = quantity(body.reorderPoint, "نقطه سفارش");
  const automaticFactor = recipeToStockFactor(unit, recipeUnit);
  if (automaticFactor === null && body.recipeToStockFactor === undefined) throw new HttpError(400, "برای این دو واحد باید ضریب تبدیل را وارد کنید");
  const conversionFactor = automaticFactor ?? Number(body.recipeToStockFactor);
  if (!Number.isFinite(conversionFactor) || conversionFactor <= 0 || conversionFactor > 1_000_000_000) throw new HttpError(400, "ضریب تبدیل واحد رسپی معتبر نیست");
  const openingUnitCost = integerMoney(body.openingUnitCost, "بهای واحد اول دوره");
  const lastPurchaseCost = integerMoney(body.lastPurchaseCost, "آخرین بهای خرید");
  const openingAmount = Math.round(openingStock * openingUnitCost);
  if (!Number.isSafeInteger(openingAmount) || openingAmount > 1_000_000_000_000) throw new HttpError(400, "ارزش موجودی اول دوره بیش از حد مجاز است");
  const expiryDate = validDate(body.expiryDate);
  const trackStock = body.trackStock !== false;
  const isActive = body.isActive !== false;
  if (typeof body.trackStock !== "undefined" && typeof body.trackStock !== "boolean") throw new HttpError(400, "وضعیت ردیابی موجودی معتبر نیست");
  if (typeof body.isActive !== "undefined" && typeof body.isActive !== "boolean") throw new HttpError(400, "وضعیت فعال بودن قلم معتبر نیست");
  const note = typeof body.openingNote === "string" ? body.openingNote.trim().slice(0, 300) : "";
  let sku = typeof body.sku === "string" ? faToEn(body.sku.trim()).toUpperCase().slice(0, 64) : "";
  const skuPattern = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;
  if (sku && !skuPattern.test(sku)) throw new HttpError(400, "کد کالا فقط می‌تواند شامل حروف لاتین، عدد و . _ / - باشد");

  await ensureAccounting(auth.business);
  const result = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    await tx.execute(sql`select pg_advisory_xact_lock(${auth.business.id})`);
    if (warehouseId !== null) {
      const [warehouse] = await tx.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.id, warehouseId), eq(warehouses.businessId, auth.business.id)));
      if (!warehouse) throw new HttpError(400, "انبار انتخاب‌شده به این کسب‌وکار تعلق ندارد");
    }
    if (categoryId !== null) {
      const [category] = await tx.select({ id: inventoryCategories.id }).from(inventoryCategories).where(and(eq(inventoryCategories.id, categoryId), eq(inventoryCategories.businessId, auth.business.id)));
      if (!category) throw new HttpError(400, "دسته‌بندی انتخاب‌شده به این کسب‌وکار تعلق ندارد");
    }
    const [duplicateName] = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(and(
      eq(inventoryItems.businessId, auth.business.id),
      sql`lower(${inventoryItems.name}) = ${name.toLocaleLowerCase("fa-IR")}`,
      warehouseId === null ? sql`${inventoryItems.warehouseId} IS NULL` : eq(inventoryItems.warehouseId, warehouseId),
    )).limit(1);
    if (duplicateName) throw new HttpError(409, "این قلم در انبار انتخاب‌شده از قبل ثبت شده است");

    if (!sku) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = `INV-${auth.business.id}-${randomBytes(4).toString("hex").toUpperCase()}`;
        const [duplicate] = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.businessId, auth.business.id), sql`lower(${inventoryItems.sku}) = ${candidate.toLowerCase()}`)).limit(1);
        if (!duplicate) { sku = candidate; break; }
      }
      if (!sku) throw new HttpError(503, "ساخت کد کالا انجام نشد؛ دوباره تلاش کنید");
    } else {
      const [duplicateSku] = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.businessId, auth.business.id), sql`lower(${inventoryItems.sku}) = ${sku.toLowerCase()}`)).limit(1);
      if (duplicateSku) throw new HttpError(409, "این کد کالا قبلاً ثبت شده است");
    }

    const [item] = await tx.insert(inventoryItems).values({
      businessId: auth.business.id, warehouseId, categoryId, name, sku, unit, recipeUnit, recipeToStockFactor: conversionFactor,
      stock: openingStock, minStock, reorderPoint, trackStock, isActive, expiryDate,
      costPerUnit: openingStock > 0 ? openingUnitCost : lastPurchaseCost,
      lastPurchaseCost: lastPurchaseCost || openingUnitCost,
    }).returning();

    let movementId: number | null = null;
    let documentId: number | null = null;
    if (openingStock > 0) {
      const [movement] = await tx.insert(stockMovements).values({
        businessId: auth.business.id, itemId: item.id, type: "adjust", delta: openingStock, balanceAfter: openingStock,
        unitCost: openingUnitCost, amount: openingAmount, note: note || "ثبت موجودی اول دوره", createdAt: new Date(),
      }).returning({ id: stockMovements.id });
      movementId = movement.id;
      if (openingAmount > 0) {
        const document = await postDocumentInTransaction(tx, auth.business, {
          date: new Date(), source: "inventory", sourceRef: `opening-item:${item.id}`, createdBy: String(auth.user.id),
          description: `موجودی اول دوره — ${item.name}${sku ? ` (${sku})` : ""}`,
          lines: [{ code: C.INV, debit: openingAmount, description: item.name }, { code: C.CAPITAL, credit: openingAmount, description: "موجودی افتتاحیه" }],
        });
        documentId = document.id;
      }
    }
    return { item, movementId, documentId };
  });
  return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
}, { feature: "inventory", manager: true, roles: ["warehouse"] });
