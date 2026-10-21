/** Invoice amounts are integer toman; tax is a supplied amount, never an assumed rate. */
export function stockReceiptTotal(subtotal: number, discount = 0, extraCost = 0, shippingCost = 0, taxAmount = 0) {
  for (const value of [subtotal, discount, extraCost, shippingCost, taxAmount]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000_000) throw new Error("مبلغ فاکتور نامعتبر است");
  }
  if (discount > subtotal) throw new Error("تخفیف نمی‌تواند از جمع کالاها بیشتر باشد");
  const total = subtotal - discount + extraCost + shippingCost + taxAmount;
  if (!Number.isSafeInteger(total) || total > 1_000_000_000_000) throw new Error("جمع فاکتور بیش از حد مجاز است");
  return total;
}

/** Cumulative allocation conserves every toman, including rounding residues. */
export function allocateStockValue(gross: number[], total: number): number[] {
  const subtotal = gross.reduce((sum, value) => sum + value, 0);
  if (!gross.length || gross.some((value) => !Number.isSafeInteger(value) || value <= 0) || !Number.isSafeInteger(subtotal) || !Number.isSafeInteger(total) || total < 0) throw new Error("مبلغ اقلام نامعتبر است");
  let cumulative = 0, allocated = 0;
  return gross.map((value) => {
    cumulative += value;
    const next = Math.round(total * (cumulative / subtotal));
    const amount = next - allocated;
    allocated = next;
    return amount;
  });
}
