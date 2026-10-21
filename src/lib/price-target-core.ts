export type PriceTargetType = "food_cost" | "gross_margin";
export type RecipeCostBasis = "last_purchase" | "stock_average";

export function currentRecipeMaterialCost(lastPurchaseCost: number | null | undefined, stockAverageCost: number) {
  if (Number.isSafeInteger(lastPurchaseCost) && (lastPurchaseCost ?? 0) > 0)
    return { costPerUnit: lastPurchaseCost as number, costBasis: "last_purchase" as const };
  return { costPerUnit: stockAverageCost, costBasis: "stock_average" as const };
}

export type RecipeCostInput = { quantity: number; costPerUnit: number; wastePercent?: number };

/** Cost a recipe batch in the same unit used by the inventory item. */
export function calculateRecipeCost(lines: RecipeCostInput[], outputUnits = 1, yieldRatio = 1) {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 100) throw new RangeError("برای محاسبه دست‌کم یک ماده لازم است");
  if (!Number.isSafeInteger(outputUnits) || outputUnits <= 0 || outputUnits > 100_000) throw new RangeError("تعداد واحد خروجی معتبر نیست");
  if (!Number.isFinite(yieldRatio) || yieldRatio <= 0 || yieldRatio > 1) throw new RangeError("بازده محصول معتبر نیست");
  let batchCostRaw = 0;
  const normalized = lines.map((line) => {
    const wastePercent = line.wastePercent ?? 0;
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(line.costPerUnit) || line.costPerUnit < 0 || !Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent > 99.9)
      throw new RangeError("مقدار، بهای واحد یا ضایعات یکی از مواد معتبر نیست");
    const batchQuantity = line.quantity;
    const lossAdjustedQuantity = batchQuantity * (1 + wastePercent / 100);
    const extendedBatchCost = lossAdjustedQuantity * line.costPerUnit;
    batchCostRaw += extendedBatchCost;
    return { ...line, wastePercent, lossAdjustedQuantity, extendedBatchCost };
  });
  const yieldFactor = 1 / yieldRatio;
  const batchCost = Math.round(batchCostRaw);
  const unitCost = Math.round(batchCostRaw / outputUnits * yieldFactor);
  let cumulativeUnitCost = 0;
  let allocatedUnitCost = 0;
  const unitLines = normalized.map((line) => {
    cumulativeUnitCost += line.extendedBatchCost / outputUnits * yieldFactor;
    const roundedCumulativeCost = Math.round(cumulativeUnitCost);
    const extendedCost = roundedCumulativeCost - allocatedUnitCost;
    allocatedUnitCost = roundedCumulativeCost;
    return { ...line, quantityPerUnit: line.quantity / outputUnits, extendedCost };
  });
  if (!Number.isSafeInteger(batchCost) || batchCost > 2_147_483_647 || !Number.isSafeInteger(unitCost) || unitCost > 2_147_483_647)
    throw new RangeError("هزینه مواد از سقف مجاز بیشتر است");
  return { batchCost, unitCost, yieldFactor, lines: unitLines };
}

export function calculateTargetPrice(unitCost: number, targetPercent: number, targetType: PriceTargetType) {
  if (!Number.isSafeInteger(unitCost) || unitCost <= 0) throw new RangeError("بهای تمام‌شده باید بیشتر از صفر باشد");
  if (!Number.isInteger(targetPercent) || targetPercent < 1 || targetPercent > 99) throw new RangeError("درصد هدف باید بین ۱ تا ۹۹ باشد");
  if (targetType !== "food_cost" && targetType !== "gross_margin") throw new RangeError("نوع هدف قیمت معتبر نیست");
  const denominator = targetType === "food_cost" ? targetPercent / 100 : 1 - targetPercent / 100;
  const raw = unitCost / denominator;
  if (!Number.isFinite(raw) || raw > 2_147_483_647) throw new RangeError("قیمت پیشنهادی از سقف مجاز بیشتر است");
  return Math.round(raw);
}
