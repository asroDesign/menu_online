import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiRateLimits } from "@/db/schema";
import { HttpError } from "@/lib/auth";

let calls = 0;

function clientAddress(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export async function enforceRateLimit(req: Request, scope: string, identity: string, limit: number, windowMs: number, includeAddress = true) {
  const address = includeAddress ? `:${clientAddress(req)}` : "";
  const key = createHash("sha256").update(`${scope}:${identity}${address}`).digest("hex");
  const now = new Date();
  const staleBefore = new Date(now.getTime() - windowMs);
  const [entry] = await db.insert(apiRateLimits).values({ key, windowStarted: now, count: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: apiRateLimits.key,
      set: {
        count: sql`CASE WHEN ${apiRateLimits.windowStarted} <= ${staleBefore} THEN 1 ELSE ${apiRateLimits.count} + 1 END`,
        windowStarted: sql`CASE WHEN ${apiRateLimits.windowStarted} <= ${staleBefore} THEN ${now} ELSE ${apiRateLimits.windowStarted} END`,
        updatedAt: now,
      },
    }).returning();
  if (entry.count > limit) throw new HttpError(429, "درخواست‌های زیادی ثبت شده؛ کمی بعد دوباره تلاش کنید.", { "Retry-After": String(Math.ceil(windowMs / 1000)) });
  calls++;
  if (calls % 100 === 0) {
    void db.delete(apiRateLimits).where(lt(apiRateLimits.updatedAt, new Date(now.getTime() - 24 * 60 * 60_000))).catch(() => {});
  }
}
