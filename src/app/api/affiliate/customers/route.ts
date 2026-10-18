import { and, desc, eq, gte, ilike, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, users } from "@/db/schema";
import { getAffiliate } from "@/lib/affiliate-auth";
import { errorResponse, HttpError } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const affiliate = await getAffiliate();
    if (!affiliate) throw new HttpError(401, "برای ادامه وارد پنل همکاری شوید");
    const params = new URL(req.url).searchParams;
    const query = (params.get("q") ?? "").trim().slice(0, 100);
    const status = params.get("status") ?? "all";
    const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
    const pageSize = 25;
    const now = new Date();
    const conditions = [eq(businesses.affiliateId, affiliate.id)];
    if (query) {
      const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(or(ilike(businesses.name, pattern), ilike(users.name, pattern), ilike(users.phone, pattern), ilike(users.email, pattern), ilike(businesses.phone, pattern))!);
    }
    if (status === "pending") conditions.push(eq(businesses.plan, "pending"));
    else if (status === "active") conditions.push(and(ne(businesses.plan, "pending"), or(isNull(businesses.subscriptionEndsAt), gte(businesses.subscriptionEndsAt, now)))!);
    else if (status === "expiring") conditions.push(and(ne(businesses.plan, "pending"), isNotNull(businesses.subscriptionEndsAt), gte(businesses.subscriptionEndsAt, now), lte(businesses.subscriptionEndsAt, new Date(now.getTime() + 30 * 86400_000)))!);
    else if (status === "expired") conditions.push(and(ne(businesses.plan, "pending"), isNotNull(businesses.subscriptionEndsAt), lt(businesses.subscriptionEndsAt, now))!);
    else if (status === "suspended") conditions.push(eq(businesses.isSuspended, true));
    else if (status !== "all") throw new HttpError(400, "فیلتر مشتری معتبر نیست");

    const where = and(...conditions);
    const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(businesses).innerJoin(users, eq(users.id, businesses.userId)).where(where);
    const rows = await db.select({
      id: businesses.id,
      name: businesses.name,
      plan: businesses.plan,
      subscriptionEndsAt: businesses.subscriptionEndsAt,
      upgradeRequest: businesses.upgradeRequest,
      isSuspended: businesses.isSuspended,
      createdAt: businesses.createdAt,
      ownerName: users.name,
      phone: sql<string>`coalesce(nullif(${businesses.phone}, ''), ${users.phone}, '')`,
    }).from(businesses).innerJoin(users, eq(users.id, businesses.userId)).where(where).orderBy(desc(businesses.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    const total = Number(countRow?.count ?? 0);
    const items = rows.map(row => {
      const end = row.subscriptionEndsAt?.getTime() ?? null;
      const subscriptionState = row.isSuspended ? "suspended" : row.plan === "pending" ? "pending" : end !== null && end < now.getTime() ? "expired" : end !== null && end <= now.getTime() + 30 * 86400_000 ? "expiring" : "active";
      return { ...row, subscriptionState };
    });
    return Response.json({ items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (error) { return errorResponse(error); }
}
