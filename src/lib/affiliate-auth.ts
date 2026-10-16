import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { affiliates, affiliateSessions } from "@/db/schema";

const COOKIE = "affiliate_sid";
const DAYS = 30;
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

export type AffiliateContext = Omit<typeof affiliates.$inferSelect, "passwordHash">;

export async function getAffiliate(): Promise<AffiliateContext | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db.select({ affiliate: affiliates })
    .from(affiliateSessions)
    .innerJoin(affiliates, eq(affiliates.id, affiliateSessions.affiliateId))
    .where(and(eq(affiliateSessions.id, sha(token)), gt(affiliateSessions.expiresAt, new Date()), eq(affiliates.status, "active")))
    .limit(1);
  if (!row) return null;
  const { passwordHash: _passwordHash, ...safe } = row.affiliate;
  return safe;
}

export async function createAffiliateSession(affiliateId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + DAYS * 86400_000);
  await db.insert(affiliateSessions).values({ id: sha(token), affiliateId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyAffiliateSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(affiliateSessions).where(eq(affiliateSessions.id, sha(token)));
  jar.delete(COOKIE);
}
