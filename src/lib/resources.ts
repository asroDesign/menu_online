import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, diningTables, orders, products, reservations, uploads } from "@/db/schema";
import { effectiveTableState } from "@/lib/table-lifecycle-core";
import { can, HttpError } from "@/lib/auth";
import { makeCrud } from "@/lib/crud";
import { ALLERGEN_TAGS, DIETARY_TAGS, normalizeProductOptionGroups, normalizeTags } from "@/lib/product-options";
import { categoryParentError } from "@/lib/category-tree";

export const categoriesCrud = makeCrud({
  table: categories,
  order: [asc(categories.sortOrder), asc(categories.id)],
  spec: {
    name: { type: "string", required: true, max: 60 },
    parentCategoryId: { type: "nullableInt", min: 1 },
    description: { type: "string", max: 500 },
    emoji: { type: "string", max: 8 },
    imageUrl: { type: "string", max: 500 },
    sortOrder: { type: "int", min: 0, max: 10000 },
    isActive: { type: "bool" },
  },
  validate: async (biz, data, _auth, _creating, id) => {
    if (!("parentCategoryId" in data)) return;
    const rows = await db.select({ id: categories.id, parentCategoryId: categories.parentCategoryId })
      .from(categories).where(eq(categories.businessId, biz.id));
    const message = categoryParentError(id, data.parentCategoryId as number | null, rows);
    if (message) throw new HttpError(400, message);
  },
});

export const productsCrud = makeCrud({
  table: products,
  order: [desc(products.createdAt), desc(products.id)],
  spec: {
    name: { type: "string", required: true, max: 100 },
    description: { type: "string", max: 400 },
    price: { type: "int", required: true, min: 0, max: 100_000_000 },
    sellingMode: { type: "enum", values: ["count", "weight"] },
    yieldRatio: { type: "float", min: 0.000001, max: 1 },
    oldPrice: { type: "nullableInt", min: 0 },
    categoryId: { type: "nullableInt", min: 1 },
    emoji: { type: "string", max: 8 },
    imageUrl: { type: "string", max: 500 },
    videoUrl: { type: "string", max: 500 },
    prepMinutes: { type: "int", min: 0, max: 300 },
    isAvailable: { type: "bool" },
    isFeatured: { type: "bool" },
    arModelUrl: { type: "string", max: 500 },
    externalId: { type: "string", max: 80 },
    modifierGroups: { type: "json" },
    dietaryTags: { type: "json" },
    allergenTags: { type: "json" },
  },
  validate: async (biz, data, auth, creating, id) => {
    if (typeof data.videoUrl === "string" && data.videoUrl) {
      const match = /^\/api\/files\/([a-f0-9]{24})$/.exec(data.videoUrl);
      if (!match) throw new HttpError(400, "ویدیوی محصول باید از بخش بارگذاری همین سامانه انتخاب شود");
      const [file] = await db.select({ id: uploads.id }).from(uploads).where(and(eq(uploads.id, match[1]), eq(uploads.businessId, biz.id), sql`${uploads.mime} IN ('video/mp4', 'video/webm')`)).limit(1);
      if (!file) throw new HttpError(400, "ویدیو پیدا نشد یا متعلق به این کسب‌وکار نیست");
    }
    try {
      if ("modifierGroups" in data) data.modifierGroups = normalizeProductOptionGroups(data.modifierGroups);
      if ("dietaryTags" in data) data.dietaryTags = normalizeTags(data.dietaryTags, DIETARY_TAGS, 8, "برچسب تغذیه‌ای");
      if ("allergenTags" in data) data.allergenTags = normalizeTags(data.allergenTags, ALLERGEN_TAGS, 9, "برچسب آلرژن");
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "اطلاعات گزینه‌های محصول نامعتبر است");
    }
    const [existing] = !creating && id
      ? await db.select({ sellingMode: products.sellingMode, yieldRatio: products.yieldRatio, modifierGroups: products.modifierGroups })
        .from(products).where(and(eq(products.id, id), eq(products.businessId, biz.id))).limit(1)
      : [];
    const mode = String(data.sellingMode ?? existing?.sellingMode ?? "count");
    const yieldRatio = Number(data.yieldRatio ?? existing?.yieldRatio ?? 1);
    if (!(["count", "weight"].includes(mode)) || !Number.isFinite(yieldRatio) || yieldRatio <= 0 || yieldRatio > 1)
      throw new HttpError(400, "نوع فروش یا بازده خام به پخته معتبر نیست");
    const effectiveModifierGroups = data.modifierGroups ?? existing?.modifierGroups;
    if (mode === "weight" && Array.isArray(effectiveModifierGroups) && effectiveModifierGroups.some((group) => (group as { active?: boolean }).active !== false))
      throw new HttpError(400, "برای محصول وزنی فعلاً گزینه‌های متغیر فعال نشود؛ نرخ ترازو باید مبنای محاسبه باشد");
    if (data.arModelUrl && !can(auth, "ar")) throw new HttpError(403, "واقعیت افزوده در پلن شما فعال نیست");
    if (data.categoryId) {
      const [c] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, data.categoryId as number), eq(categories.businessId, biz.id)));
      if (!c) throw new HttpError(400, "دسته‌بندی نامعتبر است");
    }
  },
});

export const tablesCrud = makeCrud({
  table: diningTables,
  feature: ["self_order", "cashier_pos"],
  writers: ["cashier"],
  validate: async (biz, data, _auth, creating, id) => {
    if (typeof data.name === "string") {
      const same = await db.select({ id: diningTables.id }).from(diningTables).where(and(eq(diningTables.businessId, biz.id), sql`lower(${diningTables.name}) = lower(${data.name})`));
      if (same.some((r) => r.id !== id)) throw new HttpError(409, `میزی با نام «${data.name}» از قبل وجود دارد`);
    } else if (creating) throw new HttpError(400, "نام میز را وارد کنید");
  },
  beforeDelete: async (biz, id) => {
    const [open] = await db.select({ number: orders.number }).from(orders).where(and(eq(orders.businessId, biz.id), eq(orders.tableId, id), inArray(orders.status, ["awaiting_payment", "pending", "preparing", "ready", "served"]), sql`${orders.paymentStatus} <> 'paid'`)).limit(1);
    if (open) throw new HttpError(400, `این میز سفارش باز (#${open.number.toLocaleString("fa-IR")}) دارد؛ ابتدا سفارش را ببندید یا لغو کنید`);
    const [reserved] = await db.select({ id: reservations.id }).from(reservations).where(and(
      eq(reservations.businessId, biz.id), eq(reservations.tableId, id), inArray(reservations.status, ["requested", "confirmed"]),
      sql`${reservations.startsAt} + (${reservations.durationMinutes} * interval '1 minute') > now()`,
    )).limit(1);
    if (reserved) throw new HttpError(400, "این میز رزرو فعال یا آینده دارد؛ ابتدا رزرو را تعیین‌تکلیف کنید");
  },
  order: [asc(diningTables.id)],
  spec: {
    name: { type: "string", required: true, max: 40 },
    zone: { type: "string", max: 40 },
    capacity: { type: "int", min: 1, max: 100 },
  },
  decorate: async (rows, biz) => {
    if (rows.length === 0) return rows;
    const open = await db
      .select({
        id: orders.id,
        number: orders.number,
        tableId: orders.tableId,
        status: orders.status,
        total: orders.total,
      })
      .from(orders)
      .where(
        and(
          eq(orders.businessId, biz.id),
          inArray(orders.status, ["awaiting_payment", "pending", "preparing", "ready", "served"]),
          sql`${orders.paymentStatus} <> 'paid'`,
          sql`${orders.deletedAt} IS NULL`,
        ),
      )
      .orderBy(desc(orders.createdAt));
    const now = new Date();
    const activeReservations = await db.select({ tableId: reservations.tableId }).from(reservations).where(and(
      eq(reservations.businessId, biz.id), inArray(reservations.tableId, rows.map((r) => r.id)),
      inArray(reservations.status, ["requested", "confirmed"]),
      sql`${reservations.startsAt} <= ${now}`,
      sql`${reservations.startsAt} + (${reservations.durationMinutes} * interval '1 minute') > ${now}`,
    ));
    const reservedIds = new Set(activeReservations.map((r) => r.tableId));
    return rows.map((r) => ({
      ...r,
      openOrder: open.find((o) => o.tableId === r.id) ?? null,
      hasActiveReservation: reservedIds.has(r.id),
      status: effectiveTableState(r.operationalStatus as "available" | "cleaning" | "out_of_service", open.some((o) => o.tableId === r.id), reservedIds.has(r.id)),
    }));
  },
});

