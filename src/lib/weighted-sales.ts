export type WeightedSaleInput = {
  sellingMode: "count" | "weight";
  pricePerUnit: number;
  grossGrams?: number | null;
  tareGrams?: number | null;
  yieldRatio?: number;
};

export function calculateWeightedSale(input: WeightedSaleInput) {
  if (input.sellingMode !== "weight") throw new Error("این محصول بر اساس وزن فروخته نمی‌شود");
  if (!Number.isSafeInteger(input.pricePerUnit) || input.pricePerUnit < 0) throw new Error("قیمت هر کیلو معتبر نیست");
  const grossGrams = input.grossGrams ?? 0;
  const tareGrams = input.tareGrams ?? 0;
  const yieldRatio = input.yieldRatio ?? 1;
  if (!Number.isSafeInteger(grossGrams) || grossGrams < 1 || grossGrams > 100_000) throw new Error("وزن ناخالص باید بین ۱ تا ۱۰۰٬۰۰۰ گرم باشد");
  if (!Number.isSafeInteger(tareGrams) || tareGrams < 0 || tareGrams >= grossGrams) throw new Error("وزن ظرف باید نامنفی و از وزن ناخالص کمتر باشد");
  if (!Number.isFinite(yieldRatio) || yieldRatio <= 0 || yieldRatio > 1) throw new Error("بازده خام به پخته باید بیشتر از صفر و حداکثر یک باشد");
  const netGrams = grossGrams - tareGrams;
  const lineTotal = Math.round(netGrams * input.pricePerUnit / 1000);
  if (!Number.isSafeInteger(lineTotal) || lineTotal > 2_147_483_647) throw new Error("مبلغ محصول وزنی از سقف مجاز بیشتر است");
  return { grossGrams, tareGrams, netGrams, lineTotal, rawIngredientKg: netGrams / 1000 / yieldRatio, yieldRatio };
}

export function orderLineTotal(item: { lineTotal?: number | null; price: number; quantity: number }) {
  return Number.isSafeInteger(item.lineTotal) && Number(item.lineTotal) >= 0 ? Number(item.lineTotal) : item.price * item.quantity;
}
