export type InventoryAlertKind = "stock_out" | "stock_low" | "expired" | "expiring";

export type InventoryAlertSource = {
  id: number;
  name: string;
  stock: number;
  minStock: number;
  unit: string;
  trackStock: boolean;
  expiryDate: string | null;
};

export type InventoryAlert = {
  key: string;
  kind: InventoryAlertKind;
  itemId: number;
  name: string;
  stock: number;
  minStock: number;
  unit: string;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
};

export function tehranDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function inventoryExpiryCutoff(date = new Date(), days = 7): string {
  const value = new Date(`${tehranDateKey(date)}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + Math.max(0, Math.floor(days)));
  return value.toISOString().slice(0, 10);
}

export function buildInventoryAlerts(items: InventoryAlertSource[], date = new Date()): InventoryAlert[] {
  const today = tehranDateKey(date);
  const alerts: InventoryAlert[] = [];

  for (const item of items) {
    if (item.trackStock && item.stock <= item.minStock) {
      const kind = item.stock <= 0 ? "stock_out" : "stock_low";
      alerts.push({
        key: `${kind}:${item.id}:${item.stock}:${item.minStock}`,
        kind,
        itemId: item.id,
        name: item.name,
        stock: item.stock,
        minStock: item.minStock,
        unit: item.unit,
        expiryDate: item.expiryDate,
        daysUntilExpiry: null,
      });
    }

    // An expiry warning only applies while there is stock left to use or discard.
    if (item.expiryDate && item.stock > 0 && item.expiryDate <= inventoryExpiryCutoff(date)) {
      const daysUntilExpiry = Math.round((Date.parse(`${item.expiryDate}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000);
      const kind = daysUntilExpiry < 0 ? "expired" : "expiring";
      alerts.push({
        key: `${kind}:${item.id}:${item.expiryDate}`,
        kind,
        itemId: item.id,
        name: item.name,
        stock: item.stock,
        minStock: item.minStock,
        unit: item.unit,
        expiryDate: item.expiryDate,
        daysUntilExpiry,
      });
    }
  }

  const priority: Record<InventoryAlertKind, number> = { expired: 0, stock_out: 1, stock_low: 2, expiring: 3 };
  return alerts.sort((a, b) => priority[a.kind] - priority[b.kind] || (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0) || a.name.localeCompare(b.name, "fa"));
}
