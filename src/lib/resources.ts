import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, diningTables, orders, products } from "@/db/schema";
import { can, HttpError } from "@/lib/auth";
import { makeCrud } from "@/lib/crud";

export const categoriesCrud = makeCrud({
  table: categories,
  order: [asc(categories.sortOrder), asc(categories.id)],
  spec: {
    name: { type: "string", required: true, max: 60 },
    emoji: { type: "string", max: 8 },
    sortOrder: { type: "int", min: 0, max: 10000 },
    isActive: { type: "bool" },
  },
});

export const productsCrud = makeCrud({
  table: products,
  order: [desc(products.createdAt), desc(products.id)],
  spec: {
    name: { type: "string", required: true, max: 100 },
    description: { type: "string", max: 400 },
    price: { type: "int", required: true, min: 0, max: 100_000_000 },
    oldPrice: { type: "nullableInt", min: 0 },
    categoryId: { type: "nullableInt", min: 1 },
    emoji: { type: "string", max: 8 },
    imageUrl: { type: "string", max: 500 },
    prepMinutes: { type: "int", min: 0, max: 300 },
    isAvailable: { type: "bool" },
    isFeatured: { type: "bool" },
    arModelUrl: { type: "string", max: 500 },
  },
  validate: async (biz, data, auth) => {
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
          inArray(orders.status, ["pending", "preparing", "ready", "served"]),
        ),
      )
      .orderBy(desc(orders.createdAt));
    return rows.map((r) => ({
      ...r,
      openOrder: open.find((o) => o.tableId === r.id) ?? null,
    }));
  },
});

