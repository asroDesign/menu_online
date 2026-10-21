const units: Record<string, { dimension: string; scale: number }> = {
  گرم: { dimension: "weight", scale: 1 },
  کیلوگرم: { dimension: "weight", scale: 1000 },
  میلی‌لیتر: { dimension: "volume", scale: 1 },
  لیتر: { dimension: "volume", scale: 1000 },
  عدد: { dimension: "piece", scale: 1 },
  // Package sizes vary by supplier, so these must use an explicit conversion factor.
  بسته: { dimension: "pack", scale: 1 },
  کارتن: { dimension: "carton", scale: 1 },
  متر: { dimension: "length", scale: 1 },
};

/** Number of stock units consumed by one recipe unit; incompatible dimensions need a custom factor. */
export function recipeToStockFactor(stockUnit: string, recipeUnit: string): number | null {
  if (stockUnit === recipeUnit) return 1;
  const stock = units[stockUnit], recipe = units[recipeUnit];
  if (!stock || !recipe || stock.dimension !== recipe.dimension) return null;
  return recipe.scale / stock.scale;
}

export function validInventoryUnit(value: unknown): value is string {
  return typeof value === "string" && Object.hasOwn(units, value);
}
