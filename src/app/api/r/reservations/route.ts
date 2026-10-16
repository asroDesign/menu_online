import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { diningTables, reservations } from "@/db/schema";
import { withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, auth) => {
  const rows = await db.select({ reservation: reservations, tableName: diningTables.name })
    .from(reservations)
    .leftJoin(diningTables, eq(diningTables.id, reservations.tableId))
    .where(and(eq(reservations.businessId, auth.business.id), gte(reservations.startsAt, new Date(Date.now() - 24 * 60 * 60_000))))
    .orderBy(asc(reservations.startsAt))
    .limit(500);
  return Response.json({ items: rows.map((row) => ({ ...row.reservation, tableName: row.tableName })) });
}, { manager: true, feature: "reservations" });
