import { and, asc, eq, gt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems } from "@/db/schema";
import { withAuth } from "@/lib/auth";
import { buildInventoryAlerts, inventoryExpiryCutoff } from "@/lib/inventory-alerts";

const MAX_ITEMS = 250;

export const GET = withAuth(async (_req, { business }) => {
  const rows = await db.select({
    id: inventoryItems.id,
    name: inventoryItems.name,
    stock: inventoryItems.stock,
    minStock: inventoryItems.minStock,
    unit: inventoryItems.unit,
    trackStock: inventoryItems.trackStock,
    expiryDate: inventoryItems.expiryDate,
  }).from(inventoryItems).where(and(
    eq(inventoryItems.businessId, business.id),
    eq(inventoryItems.isActive, true),
    or(
      and(eq(inventoryItems.trackStock, true), lte(inventoryItems.stock, inventoryItems.minStock)),
      and(gt(inventoryItems.stock, 0), lte(inventoryItems.expiryDate, inventoryExpiryCutoff())),
    ),
  )).orderBy(sql`case when ${inventoryItems.trackStock} = true and ${inventoryItems.stock} <= ${inventoryItems.minStock} then 0 else 1 end`, asc(inventoryItems.expiryDate), asc(inventoryItems.name)).limit(MAX_ITEMS + 1);

  const alerts = buildInventoryAlerts(rows.slice(0, MAX_ITEMS));
  return Response.json({ alerts, truncated: rows.length > MAX_ITEMS, checkedAt: new Date().toISOString() }, {
    headers: { "Cache-Control": "no-store" },
  });
}, { feature: "inventory" });
