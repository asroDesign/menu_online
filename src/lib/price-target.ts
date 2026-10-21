import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { businesses, inventoryItems, productPriceAudits, products, recipes } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { calculateRecipeCost, calculateTargetPrice, currentRecipeMaterialCost, type PriceTargetType, type RecipeCostBasis } from "@/lib/price-target-core";

type Biz = typeof businesses.$inferSelect;
type Q = typeof db;
type SnapshotLine = { itemId: number; name: string; quantity: number; unit: string; stockUnit: string; recipeToStockFactor: number; costPerUnit: number; stockAverageCost: number; lastPurchaseCost: number; costBasis: RecipeCostBasis; wastePercent: number; extendedCost: number };

async function loadSnapshot(executor: Q, businessId: number, productId: number, lock = false) {
  let productQuery = executor.select().from(products).where(and(eq(products.id, productId), eq(products.businessId, businessId))).limit(1);
  if (lock) productQuery = productQuery.for("update") as typeof productQuery;
  const [product] = await productQuery;
  if (!product) throw new HttpError(404, "محصول در این کسب‌وکار پیدا نشد");
  const recipesQuery = executor.select().from(recipes)
    .where(and(eq(recipes.businessId, businessId), eq(recipes.productId, productId))).orderBy(asc(recipes.itemId));
  const recipeRows = lock ? await recipesQuery.for("update") : await recipesQuery;
  if (!recipeRows.length) throw new HttpError(400, "برای این محصول فرمول ساخت کامل تعریف نشده است");
  if (!Number.isFinite(product.yieldRatio) || product.yieldRatio <= 0 || product.yieldRatio > 1) throw new HttpError(409, "بازده یا ضایعات محصول معتبر نیست");
  if (recipeRows.some((row) => !Number.isFinite(row.quantity) || row.quantity <= 0)) throw new HttpError(409, "مقدار یکی از مواد فرمول معتبر نیست");
  const ids = recipeRows.map((row) => row.itemId);
  const materialsQuery = executor.select().from(inventoryItems).where(and(eq(inventoryItems.businessId, businessId), inArray(inventoryItems.id, ids)));
  const materials = lock ? await materialsQuery.for("update") : await materialsQuery;
  const byId = new Map(materials.map((item) => [item.id, item]));
  if (byId.size !== ids.length) throw new HttpError(409, "یکی از مواد اولیهٔ فرمول حذف شده یا به این کسب‌وکار تعلق ندارد");
  if (materials.some((item) => !Number.isSafeInteger(item.costPerUnit) || item.costPerUnit < 0 || !Number.isSafeInteger(item.lastPurchaseCost) || item.lastPurchaseCost < 0)) throw new HttpError(409, "بهای یکی از مواد اولیه معتبر نیست");
  if (materials.some((item) => currentRecipeMaterialCost(item.lastPurchaseCost, item.costPerUnit).costPerUnit <= 0)) throw new HttpError(409, "برای یکی از مواد اولیه بهای خرید ثبت نشده است؛ ابتدا بهای انبار یا خرید را تکمیل کنید");
  const lines: SnapshotLine[] = recipeRows.map((recipe) => {
    const item = byId.get(recipe.itemId)!;
    const materialCost = currentRecipeMaterialCost(item.lastPurchaseCost, item.costPerUnit);
    return { itemId: item.id, name: item.name, quantity: recipe.quantity, unit: item.recipeUnit, stockUnit: item.unit, recipeToStockFactor: item.recipeToStockFactor, costPerUnit: materialCost.costPerUnit, stockAverageCost: item.costPerUnit, lastPurchaseCost: item.lastPurchaseCost, costBasis: materialCost.costBasis, wastePercent: recipe.wastePercent ?? 0, extendedCost: 0 };
  });
  const recipeCost = calculateRecipeCost(lines.map((line) => ({ quantity: line.quantity * line.recipeToStockFactor, costPerUnit: line.costPerUnit, wastePercent: line.wastePercent })), 1, product.sellingMode === "weight" ? product.yieldRatio : 1);
  const costLines = lines.map((line, index) => ({ ...line, extendedCost: recipeCost.lines[index].extendedCost }));
  const unitCost = recipeCost.unitCost;
  if (!Number.isSafeInteger(unitCost) || unitCost <= 0) throw new HttpError(400, "بهای تمام‌شدهٔ مواد باید بیشتر از صفر باشد");
  const hashSource = JSON.stringify({ productId, currentPrice: product.price, sellingMode: product.sellingMode, yieldRatio: product.yieldRatio, lines: lines.map(({ itemId, quantity, unit, stockUnit, recipeToStockFactor, costPerUnit, stockAverageCost, lastPurchaseCost, costBasis, wastePercent }) => ({ itemId, quantity, unit, stockUnit, recipeToStockFactor, costPerUnit, stockAverageCost, lastPurchaseCost, costBasis, wastePercent })) });
  const snapshotHash = createHash("sha256").update(hashSource).digest("hex");
  return { product, lines: costLines, unitCost, snapshotHash };
}

export async function getPriceTargetSnapshot(businessId: number, productId: number) {
  const snapshot = await loadSnapshot(db, businessId, productId);
  return {
    product: { id: snapshot.product.id, name: snapshot.product.name, price: snapshot.product.price, sellingMode: snapshot.product.sellingMode, yieldRatio: snapshot.product.yieldRatio },
    unitCost: snapshot.unitCost, lines: snapshot.lines, snapshotHash: snapshot.snapshotHash,
  };
}

export async function applyPriceTarget(biz: Biz, actorId: number, input: { productId: number; targetType: string; targetPercent: number; snapshotHash: string }) {
  if (!Number.isSafeInteger(input.productId) || input.productId < 1) throw new HttpError(400, "شناسه محصول معتبر نیست");
  if (input.targetType !== "food_cost" && input.targetType !== "gross_margin") throw new HttpError(400, "نوع هدف قیمت معتبر نیست");
  if (!Number.isSafeInteger(input.targetPercent) || input.targetPercent < 1 || input.targetPercent > 99) throw new HttpError(400, "درصد هدف باید بین ۱ تا ۹۹ باشد");
  if (!/^[a-f0-9]{64}$/.test(input.snapshotHash)) throw new HttpError(400, "نسخه بهای تمام‌شده معتبر نیست");
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Q;
    const snapshot = await loadSnapshot(tx, biz.id, input.productId, true);
    if (snapshot.snapshotHash !== input.snapshotHash) throw new HttpError(409, "قیمت یا بهای مواد تغییر کرده است؛ محاسبه را تازه کنید");
    let newPrice: number;
    try { newPrice = calculateTargetPrice(snapshot.unitCost, input.targetPercent, input.targetType as PriceTargetType); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "درصد هدف قیمت معتبر نیست"); }
    const previousPrice = snapshot.product.price;
    await tx.update(products).set({ price: newPrice }).where(and(eq(products.id, input.productId), eq(products.businessId, biz.id)));
    const [audit] = await tx.insert(productPriceAudits).values({
      businessId: biz.id, productId: input.productId, previousPrice, newPrice, unitCost: snapshot.unitCost,
      targetType: input.targetType, targetPercent: input.targetPercent, yieldRatio: snapshot.product.sellingMode === "weight" ? snapshot.product.yieldRatio : 1,
      sourceSnapshotHash: snapshot.snapshotHash, costSnapshot: snapshot.lines, actorId,
    }).returning();
    return { item: { productId: input.productId, name: snapshot.product.name, previousPrice, newPrice, unitCost: snapshot.unitCost }, auditId: audit.id };
  });
}
