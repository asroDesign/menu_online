import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { businesses, diningTables, waiterServiceRequests } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { featuresOf } from "@/lib/entitlements";
import { hasAny } from "@/lib/plans";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logInfo } from "@/lib/logger";
import { sendWaiterCallPush } from "@/lib/web-push";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const [business] = await db.select().from(businesses).where(eq(businesses.slug, slug));
    if (!business || business.isSuspended) throw new HttpError(404, "رستوران پیدا نشد");
    const features = await featuresOf(business);
    if (!hasAny(features, "waiter_call")) throw new HttpError(403, "درخواست گارسون از منوی این رستوران فعال نیست");

    await enforceRateLimit(req, "public-waiter-request", slug, 5, 60_000);
    await enforceRateLimit(req, "public-waiter-request-global", slug, 300, 60 * 60_000, false);

    const body = await readJson(req, 4096);
    const tableId = Number(body.tableId);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!Number.isSafeInteger(tableId) || tableId < 1) throw new HttpError(400, "میز را انتخاب کنید");
    if (message.length > 300) throw new HttpError(400, "پیام حداکثر ۳۰۰ نویسه باشد");
    const kind = message ? "message" : "call";

    const [table] = await db.select({ id: diningTables.id, name: diningTables.name })
      .from(diningTables)
      .where(and(eq(diningTables.id, tableId), eq(diningTables.businessId, business.id), inArray(diningTables.operationalStatus, ["available", "occupied", "reserved"])));
    if (!table) throw new HttpError(400, "میز انتخاب‌شده برای درخواست گارسون در دسترس نیست؛ میز دیگری انتخاب کنید");

    const [item] = await db.insert(waiterServiceRequests).values({ businessId: business.id, tableId, kind, message }).returning({ id: waiterServiceRequests.id, createdAt: waiterServiceRequests.createdAt });
    logInfo("waiter_service_request.created", { businessId: business.id, requestId: item.id, tableId, kind });
    await sendWaiterCallPush({ businessId: business.id, requestId: item.id, tableName: table.name, kind }).catch(() => {
      logInfo("waiter_service_request.push_unavailable", { businessId: business.id, requestId: item.id });
    });
    return Response.json({ item: { ...item, tableId, tableName: table.name, kind, message, status: "open" } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
