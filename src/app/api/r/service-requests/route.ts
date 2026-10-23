import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { diningTables, waiterServiceRequests } from "@/db/schema";
import { withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, { business }) => {
  const items = await db.select({
    id: waiterServiceRequests.id,
    tableId: waiterServiceRequests.tableId,
    tableName: diningTables.name,
    kind: waiterServiceRequests.kind,
    message: waiterServiceRequests.message,
    status: waiterServiceRequests.status,
    createdAt: waiterServiceRequests.createdAt,
  }).from(waiterServiceRequests)
    .innerJoin(diningTables, and(eq(diningTables.id, waiterServiceRequests.tableId), eq(diningTables.businessId, business.id)))
    .where(and(eq(waiterServiceRequests.businessId, business.id), eq(waiterServiceRequests.status, "open")))
    .orderBy(desc(waiterServiceRequests.createdAt))
    .limit(50);
  return Response.json({ items });
}, { feature: "waiter_call", manager: true, roles: ["waiter", "cashier"] });
