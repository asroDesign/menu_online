import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { businesses, categories, menuEvents, products } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

const allowed = new Set(["menu_view", "category_view", "product_view", "add_to_cart", "checkout_start"]);
let pruneCounter = 0;

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    await enforceRateLimit(req, "menu-funnel", slug, 60, 60_000);
    await enforceRateLimit(req, "menu-funnel-global", slug, 1200, 60_000, false);
    const body = await readJson(req, 12 * 1024);
    if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 20) throw new HttpError(400, "رویدادهای منو نامعتبر است");
    const events = body.events.map((value) => {
      if (!value || typeof value !== "object") throw new HttpError(400, "رویداد منو نامعتبر است");
      const event = value as Record<string, unknown>;
      const eventName = typeof event.name === "string" ? event.name : "";
      const eventId = typeof event.eventId === "string" ? event.eventId : "";
      const categoryId = event.categoryId === undefined ? null : Number(event.categoryId);
      const productId = event.productId === undefined ? null : Number(event.productId);
      if (!allowed.has(eventName) || !/^[0-9a-f-]{36}$/i.test(eventId) ||
        (categoryId !== null && (!Number.isInteger(categoryId) || categoryId < 1)) ||
        (productId !== null && (!Number.isInteger(productId) || productId < 1)))
        throw new HttpError(400, "رویداد منو نامعتبر است");
      if (eventName === "category_view" && categoryId === null) throw new HttpError(400, "دسته‌بندی رویداد مشخص نیست");
      if ((eventName === "product_view" || eventName === "add_to_cart") && productId === null) throw new HttpError(400, "محصول رویداد مشخص نیست");
      return { eventId, eventName, categoryId, productId };
    });

    const [business] = await db.select({ id: businesses.id, isSuspended: businesses.isSuspended }).from(businesses).where(eq(businesses.slug, slug));
    if (!business || business.isSuspended) throw new HttpError(404, "منو پیدا نشد");
    const categoryIds = [...new Set(events.flatMap((event) => event.categoryId === null ? [] : [event.categoryId]))];
    const productIds = [...new Set(events.flatMap((event) => event.productId === null ? [] : [event.productId]))];
    const [categoryRows, productRows] = await Promise.all([
      categoryIds.length ? db.select({ id: categories.id }).from(categories).where(and(eq(categories.businessId, business.id), inArray(categories.id, categoryIds))) : [],
      productIds.length ? db.select({ id: products.id }).from(products).where(and(eq(products.businessId, business.id), inArray(products.id, productIds))) : [],
    ]);
    if (categoryRows.length !== categoryIds.length || productRows.length !== productIds.length) throw new HttpError(400, "محصول یا دسته‌بندی رویداد متعلق به این منو نیست");

    const inserted = await db.insert(menuEvents).values(events.map((event) => ({ businessId: business.id, ...event })))
      .onConflictDoNothing().returning({ id: menuEvents.id });
    pruneCounter++;
    if (pruneCounter % 100 === 0) void db.delete(menuEvents).where(lt(menuEvents.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60_000))).catch(() => {});
    return Response.json({ accepted: inserted.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
