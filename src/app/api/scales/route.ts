import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// This endpoint deliberately omits device bearer codes and only exposes fresh,
// tenant-owned scale readings for a cashier/waiter confirmation step.
export const GET = withAuth(async (_req, auth) => {
  const freshSince = new Date(Date.now() - 20_000);
  const rows = await db.select({
    id: devices.id,
    name: devices.name,
    lastValue: devices.lastValue,
    lastSeenAt: devices.lastSeenAt,
  }).from(devices).where(and(
    eq(devices.businessId, auth.business.id),
    eq(devices.kind, "scale"),
    gte(devices.lastSeenAt, freshSince),
  )).orderBy(desc(devices.lastSeenAt)).limit(20);

  return Response.json({ items: rows.filter((device) => Number.isFinite(device.lastValue) && device.lastValue > 0 && device.lastValue <= 100)
    .map((device) => ({ id: device.id, name: device.name, weightGrams: Math.round(device.lastValue * 1000), lastSeenAt: device.lastSeenAt })) }, {
    headers: { "Cache-Control": "no-store" },
  });
}, { feature: "scale" });
