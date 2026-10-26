import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { offlineSales, offlineTerminals } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { tokenHash } from "@/lib/offline-pos";
import { enforceRateLimit } from "@/lib/rate-limit";
const opts = { manager: true, feature: "cashier_pos" };
export const GET = withAuth(async (_req, auth) => Response.json({
  terminals: await db.select({ id: offlineTerminals.id, name: offlineTerminals.name, lastSeenAt: offlineTerminals.lastSeenAt, revokedAt: offlineTerminals.revokedAt }).from(offlineTerminals).where(eq(offlineTerminals.businessId, auth.business.id)),
  sales: await db.select({ id: offlineSales.id, orderId: offlineSales.orderId, createdAt: offlineSales.createdAt }).from(offlineSales).where(eq(offlineSales.businessId, auth.business.id)).orderBy(desc(offlineSales.createdAt)).limit(50),
}), opts);
export const POST = withAuth(async (req, auth) => {
  await enforceRateLimit(req, "offline-pair", String(auth.user.id), 10, 60_000, false);
  const raw = await readJson(req, 2000);
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
  if (!name) throw new HttpError(400, "نام صندوق لازم است");
  const token = randomBytes(32).toString("hex"), id = randomUUID();
  await db.insert(offlineTerminals).values({ id, businessId: auth.business.id, name, tokenHash: tokenHash(token), createdBy: auth.user.id });
  return Response.json({ version: 1, terminalId: id, businessId: auth.business.id, server: new URL(req.url).origin, token, name }, { headers: { "Cache-Control": "no-store" } });
}, opts);
export const DELETE = withAuth(async (req, auth) => {
  const raw = await readJson(req, 2000);
  if (typeof raw.id !== "string") throw new HttpError(400, "شناسه صندوق لازم است");
  await db.update(offlineTerminals).set({ revokedAt: new Date() }).where(and(eq(offlineTerminals.id, raw.id), eq(offlineTerminals.businessId, auth.business.id)));
  return Response.json({ ok: true });
}, opts);
