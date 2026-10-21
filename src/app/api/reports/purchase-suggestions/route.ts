import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, stockMovements, warehouses } from "@/db/schema";
import { HttpError, withAuth } from "@/lib/auth";

export const GET = withAuth(async (req, auth) => {
  const url = new URL(req.url);
  const lookbackDays = [7, 14, 30, 60].includes(Number(url.searchParams.get("lookbackDays"))) ? Number(url.searchParams.get("lookbackDays")) : 30;
  const leadTimeDays = Number(url.searchParams.get("leadTimeDays") ?? 3);
  const safetyDays = Number(url.searchParams.get("safetyDays") ?? 2);
  if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 90 || !Number.isInteger(safetyDays) || safetyDays < 0 || safetyDays > 60)
    throw new HttpError(400, "بازه تأمین یا ذخیره اطمینان معتبر نیست.");
  const since = new Date(Date.now() - lookbackDays * 86_400_000);
  const [items, movements, wh] = await Promise.all([
    db.select().from(inventoryItems).where(and(eq(inventoryItems.businessId, auth.business.id), eq(inventoryItems.trackStock, true), eq(inventoryItems.isActive, true))).orderBy(inventoryItems.id),
    db.select().from(stockMovements).where(and(eq(stockMovements.businessId, auth.business.id), eq(stockMovements.type, "sale"), gte(stockMovements.createdAt, since))),
    db.select().from(warehouses).where(eq(warehouses.businessId, auth.business.id)),
  ]);
  const demand = new Map<number, { consumed: number; events: number; last: Date | null }>();
  for (const movement of movements) {
    const row = demand.get(movement.itemId) ?? { consumed: 0, events: 0, last: null };
    row.consumed += Math.max(0, -movement.delta);
    row.events++;
    if (!row.last || movement.createdAt > row.last) row.last = movement.createdAt;
    demand.set(movement.itemId, row);
  }
  const result = items.map((item) => {
    const row = demand.get(item.id) ?? { consumed: 0, events: 0, last: null };
    const avgDailyConsumption = row.consumed / lookbackDays;
    const insufficientData = row.events < 3 || row.consumed <= 0;
    const incomingConfirmed = 0; // Purchase orders are not modeled yet; do not infer receipts as incoming.
    const reorderTarget = item.reorderPoint > 0 ? item.reorderPoint : item.minStock * 2;
    const suggestedQty = insufficientData
      ? Math.max(0, reorderTarget - item.stock)
      : Math.max(0, avgDailyConsumption * (leadTimeDays + safetyDays) - item.stock - incomingConfirmed);
    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      warehouse: wh.find((warehouse) => warehouse.id === item.warehouseId)?.name ?? "بدون انبار",
      stock: item.stock,
      minStock: item.minStock,
      reorderPoint: item.reorderPoint,
      costPerUnit: item.costPerUnit,
      consumed: row.consumed,
      movementCount: row.events,
      lastConsumedAt: row.last?.toISOString() ?? null,
      avgDailyConsumption,
      usableDays: avgDailyConsumption > 0 ? item.stock / avgDailyConsumption : null,
      incomingConfirmed,
      suggestedQty,
      estimatedCost: Math.round(suggestedQty * item.costPerUnit),
      insufficientData,
      fallback: insufficientData ? "حداقل موجودی؛ داده فروش کافی نیست" : null,
    };
  }).filter((item) => item.suggestedQty > 0).sort((a, b) => b.estimatedCost - a.estimatedCost);
  return Response.json({ items: result, settings: { lookbackDays, leadTimeDays, safetyDays }, generatedAt: new Date().toISOString(), incomingPurchaseOrdersSupported: false }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "purchase_suggestions", manager: true, roles: ["warehouse"] });
