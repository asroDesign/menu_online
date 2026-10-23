import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, devices } from "@/db/schema";
import { withAuth } from "@/lib/auth";
import { POS_ONLINE_MS } from "@/lib/pos";

export const GET = withAuth(async (_req, auth) => {
  const [banks, devicesList] = await Promise.all([
    db.select({ id: bankAccounts.id, name: bankAccounts.name, bank: bankAccounts.bank })
      .from(bankAccounts).where(eq(bankAccounts.businessId, auth.business.id)).orderBy(bankAccounts.id),
    db.select({ id: devices.id, name: devices.name, terminalNumber: devices.terminalNumber, lastSeenAt: devices.lastSeenAt })
      .from(devices).where(and(eq(devices.businessId, auth.business.id), eq(devices.kind, "pos"))).orderBy(devices.id),
  ]);
  const onlineSince = new Date(Date.now() - POS_ONLINE_MS);
  return Response.json({
    banks,
    posDevices: devicesList.map((device) => ({ ...device, online: !!device.lastSeenAt && device.lastSeenAt > onlineSince })),
  });
}, { feature: "cashier_pos", manager: true, roles: ["cashier"] });
