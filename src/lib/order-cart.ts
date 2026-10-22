import { productUnitPrice, resolveProductOptionSelection, type ProductOptionSnapshot } from "@/lib/product-options";
import { calculateWeightedSale } from "@/lib/weighted-sales";

export type CartState = Record<string, { productId: number; optionIds: string[]; quantity: number; weightGrams?: number; tareGrams?: number }>;
export type CartProduct = { id: number; name: string; price: number; sellingMode?: string; yieldRatio?: number; modifierGroups?: Parameters<typeof resolveProductOptionSelection>[0] };
export type CartLine<T extends CartProduct> = { key: string; product: T; qty: number; optionIds: string[]; optionSnapshot: ProductOptionSnapshot[]; price: number; lineTotal: number; unitPrice: number; weightGrams: number | null; netWeightGrams: number | null; tareGrams: number };

export function cartLines<T extends CartProduct>(products: T[], cart: CartState): CartLine<T>[] {
  const result: CartLine<T>[] = [];
  for (const [key, entry] of Object.entries(cart)) {
    const product = products.find((item) => item.id === entry.productId);
    if (!product || entry.quantity < 1) continue;
    try {
      const selection = resolveProductOptionSelection(product.modifierGroups ?? [], entry.optionIds);
      if (product.sellingMode === "weight") {
        if (selection.snapshot.length || !entry.weightGrams) continue;
        const weighed = calculateWeightedSale({ sellingMode: "weight", pricePerUnit: product.price, grossGrams: entry.weightGrams, tareGrams: entry.tareGrams ?? 0, yieldRatio: product.yieldRatio ?? 1 });
        result.push({ key, product, qty: entry.quantity, optionIds: entry.optionIds, optionSnapshot: [], price: weighed.lineTotal, lineTotal: weighed.lineTotal * entry.quantity, unitPrice: product.price, weightGrams: weighed.grossGrams, netWeightGrams: weighed.netGrams, tareGrams: weighed.tareGrams });
        continue;
      }
      const price = productUnitPrice(product.price, selection.priceDelta);
      result.push({ key, product, qty: entry.quantity, optionIds: entry.optionIds, optionSnapshot: selection.snapshot, price, lineTotal: price * entry.quantity, unitPrice: price, weightGrams: null, netWeightGrams: null, tareGrams: 0 });
    } catch {
      // Stale menu data can remain in a tab after a manager changes its options. Do not submit it.
    }
  }
  return result;
}

export function changeCartVariant(cart: CartState, productId: number, optionIds: string[], delta: number, limit = 50, weightGrams?: number, tareGrams?: number): CartState {
  const sortedIds = [...optionIds].sort();
  const key = `${productId}:${sortedIds.join(",")}${weightGrams ? `:w${weightGrams}:t${tareGrams ?? 0}` : ""}`;
  const current = cart[key]?.quantity ?? 0;
  const next = Math.min(limit, current + delta);
  const updated = { ...cart };
  if (next <= 0) delete updated[key];
  else updated[key] = { productId, optionIds: sortedIds, quantity: next, ...(weightGrams ? { weightGrams, tareGrams: tareGrams ?? 0 } : {}) };
  return updated;
}

export function changeAnyCartVariant(cart: CartState, productId: number, delta: number, limit = 50): CartState {
  if (delta > 0) return changeCartVariant(cart, productId, [], delta, limit);
  const entry = Object.entries(cart).find(([, line]) => line.productId === productId);
  return entry ? changeCartVariant(cart, productId, entry[1].optionIds, delta, limit, entry[1].weightGrams, entry[1].tareGrams) : cart;
}

export function cartProductQuantity(cart: CartState, productId: number) {
  return Object.values(cart).reduce((sum, line) => line.productId === productId ? sum + line.quantity : sum, 0);
}

/** True only when this exact count/weight variant produces a positive-priced cart line. */
export function hasPositiveCartLinePrice<T extends CartProduct>(product: T, optionIds: string[] = [], weightGrams?: number, tareGrams = 0) {
  if (!Number.isSafeInteger(product.price) || product.price <= 0) return false;
  const draft = changeCartVariant({}, product.id, optionIds, 1, 1, weightGrams, tareGrams);
  const line = cartLines([product], draft)[0];
  return !!line && Number.isSafeInteger(line.price) && line.price > 0 && line.lineTotal > 0;
}
