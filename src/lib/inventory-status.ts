export type InventoryStatus = "out" | "low" | "available";

/** Empty stock is distinct from positive stock at or below its reorder threshold. */
export function inventoryStatus(stock: number, minStock: number): InventoryStatus {
  if (stock <= 0) return "out";
  if (stock <= minStock) return "low";
  return "available";
}
