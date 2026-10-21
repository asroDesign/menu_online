import { and, inArray, eq } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { calculateRecipeCost, calculateTargetPrice, currentRecipeMaterialCost, type PriceTargetType } from "@/lib/price-target-core";

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 32 * 1024);
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 100) throw new HttpError(400, "برای محاسبه دست‌کم یک ماده اولیه لازم است");
  const lines = body.lines.map((raw) => {
    if (!raw || typeof raw !== "object") throw new HttpError(400, "ردیف ماده اولیه معتبر نیست");
    const line = raw as Record<string, unknown>;
    const itemId = Number(line.itemId), quantity = Number(line.quantity), wastePercent = Number(line.wastePercent ?? 0);
    if (!Number.isSafeInteger(itemId) || itemId < 1 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000 || !Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent > 99.9)
      throw new HttpError(400, "مقدار یا ضایعات یکی از مواد اولیه معتبر نیست");
    return { itemId, quantity, wastePercent };
  });
  if (new Set(lines.map((line) => line.itemId)).size !== lines.length) throw new HttpError(400, "هر ماده اولیه را فقط یک بار به دستور تهیه اضافه کنید");
  const outputUnits = Number(body.outputUnits);
  const sellingMode = body.sellingMode === "weight" ? "weight" : body.sellingMode === "count" ? "count" : null;
  const yieldRatio = Number(body.yieldRatio ?? 1);
  const targetType = body.targetType;
  const targetPercent = Number(body.targetPercent);
  if (!sellingMode || !Number.isSafeInteger(outputUnits) || outputUnits < 1 || outputUnits > 100_000)
    throw new HttpError(400, "تعداد خروجی یا نوع فروش معتبر نیست");
  if (!Number.isInteger(targetPercent) || targetPercent < 1 || targetPercent > 99 || (targetType !== "food_cost" && targetType !== "gross_margin"))
    throw new HttpError(400, "مبنای قیمت یا درصد هدف معتبر نیست");
  if (!Number.isFinite(yieldRatio) || yieldRatio <= 0 || yieldRatio > 1) throw new HttpError(400, "بازده خام به پخته معتبر نیست");

  const ids = lines.map((line) => line.itemId);
  const materials = await db.select({ id: inventoryItems.id, name: inventoryItems.name, unit: inventoryItems.unit, recipeUnit: inventoryItems.recipeUnit, recipeToStockFactor: inventoryItems.recipeToStockFactor, costPerUnit: inventoryItems.costPerUnit, lastPurchaseCost: inventoryItems.lastPurchaseCost })
    .from(inventoryItems).where(and(eq(inventoryItems.businessId, auth.business.id), inArray(inventoryItems.id, ids)));
  if (materials.length !== ids.length) throw new HttpError(400, "یکی از مواد اولیه به این کسب‌وکار تعلق ندارد یا حذف شده است");
  if (materials.some((item) => currentRecipeMaterialCost(item.lastPurchaseCost, item.costPerUnit).costPerUnit <= 0)) throw new HttpError(400, "برای یکی از مواد اولیه بهای خرید ثبت نشده است؛ ابتدا بهای انبار یا خرید را تکمیل کنید");
  const byId = new Map(materials.map((item) => [item.id, item]));
  let recipeCost: ReturnType<typeof calculateRecipeCost>;
  try {
    recipeCost = calculateRecipeCost(lines.map((line) => ({ ...line, quantity: line.quantity * byId.get(line.itemId)!.recipeToStockFactor, costPerUnit: currentRecipeMaterialCost(byId.get(line.itemId)!.lastPurchaseCost, byId.get(line.itemId)!.costPerUnit).costPerUnit })), outputUnits, sellingMode === "weight" ? yieldRatio : 1);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "هزینه مواد اولیه معتبر نیست");
  }
  if (recipeCost.unitCost <= 0) throw new HttpError(400, "بهای مواد اولیه باید بیشتر از صفر باشد");
  let suggestedPrice: number;
  try { suggestedPrice = calculateTargetPrice(recipeCost.unitCost, targetPercent, targetType as PriceTargetType); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "قیمت پیشنهادی معتبر نیست"); }
  const resultLines = lines.map((line, index) => {
    const material = byId.get(line.itemId)!;
    const computed = recipeCost.lines[index];
    const materialCost = currentRecipeMaterialCost(material.lastPurchaseCost, material.costPerUnit);
    return { itemId: material.id, name: material.name, unit: material.recipeUnit, stockUnit: material.unit, recipeToStockFactor: material.recipeToStockFactor, batchQuantity: line.quantity, quantityPerUnit: line.quantity / outputUnits, costPerUnit: materialCost.costPerUnit, costBasis: materialCost.costBasis, wastePercent: line.wastePercent, extendedCost: computed.extendedCost };
  });
  return Response.json({ item: {
    batchCost: recipeCost.batchCost,
    unitCost: recipeCost.unitCost,
    profitPerUnit: suggestedPrice - recipeCost.unitCost,
    suggestedPrice,
    priceFactor: recipeCost.unitCost ? Number((suggestedPrice / recipeCost.unitCost).toFixed(2)) : 0,
    materialSharePercent: Number((recipeCost.unitCost / suggestedPrice * 100).toFixed(1)),
    outputUnits,
    yieldRatio: sellingMode === "weight" ? yieldRatio : 1,
    lines: resultLines,
  } }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "costing", manager: true, roles: ["accountant"] });
