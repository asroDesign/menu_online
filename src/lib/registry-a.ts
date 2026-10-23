/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assets, bankAccounts, categories, couriers, customers, deliveryZones, devices, discountCodes, inventoryCategories, inventoryItems, orders, pagers,
  printJobs, products, recipes, stockMovements, surveyResponses, surveys, transactions, warehouses, calls, crossSellRules,
} from "@/db/schema";
import { getAuth, HttpError, withAuth } from "@/lib/auth";
import { ensureAccounting, loadAccounts, postManualTx, unpostManualTx } from "@/lib/accounting";
import { makeCrud } from "@/lib/crud";
import { normPhone, receiptText } from "@/lib/orders";
import { mergeSeg, segmentOf } from "@/lib/segments";
import type { Settings } from "@/lib/plans";
import { recipeToStockFactor, validInventoryUnit } from "@/lib/inventory-units";

const str = (max = 200, required = false) => ({ type: "string", required, max }) as const;
const int = (max = 2_000_000_000, min = 0) => ({ type: "int", min, max }) as const;

async function owns(table: any, id: unknown, businessId: number, msg: string) {
  const [r] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, Number(id)), eq(table.businessId, businessId)));
  if (!r) throw new HttpError(400, msg);
}

const devCrud = (feature: string, kinds: string[]) =>
  makeCrud({
    table: devices,
    feature,
    order: [asc(devices.id)],
    scope: inArray(devices.kind, kinds),
    defaults: () => ({ kind: kinds[0], code: randomBytes(4).toString("hex") }),
    spec: {
      name: str(60, true),
      kind: { type: "enum", values: kinds },
      lastValue: { type: "float", min: 0, max: 100000 },
      ...(kinds.includes("printer") ? { printerCategoryIds: { type: "json" as const } } : {}),
    },
    validate: async (biz, data) => {
      if (!("printerCategoryIds" in data)) return;
      if (!kinds.includes("printer")) throw new HttpError(400, "تنظیم دسته‌بندی فقط برای پرینتر مجاز است");
      if (!Array.isArray(data.printerCategoryIds) || data.printerCategoryIds.length > 100) throw new HttpError(400, "دسته‌بندی‌های چاپ نامعتبر است");
      const ids = [...new Set(data.printerCategoryIds.map(Number))];
      if (ids.some((id) => !Number.isInteger(id) || id < 0)) throw new HttpError(400, "شناسه‌ی دسته‌بندی نامعتبر است");
      const categoryIds = ids.filter((id) => id > 0);
      const rows = categoryIds.length ? await db.select({ id: categories.id }).from(categories).where(and(eq(categories.businessId, biz.id), inArray(categories.id, categoryIds))) : [];
      if (rows.length !== categoryIds.length) throw new HttpError(400, "یکی از دسته‌بندی‌ها متعلق به این رستوران نیست");
      data.printerCategoryIds = ids;
    },
  });

const printjobsBase = makeCrud({
  table: printJobs,
  feature: "cloud_printer",
  order: [desc(printJobs.id)],
  spec: { status: { type: "enum", values: ["pending", "printed", "failed"] } },
  decorate: async (rows, biz) => {
    const d = await db.select({ id: devices.id, name: devices.name }).from(devices).where(eq(devices.businessId, biz.id));
    return rows.map((r) => ({ ...r, deviceName: d.find((x) => x.id === r.deviceId)?.name ?? "—" }));
  },
});

function withPosting(base: any) {
  const post = async (item: any) => {
    if (!item || item.source === "sale") return;
    const auth = await getAuth();
    if (auth) await postManualTx(auth.business, { ...item, date: new Date(item.date) });
  };
  return {
    ...base,
    create: async (req: Request, ctx: any) => {
      const res: Response = await base.create(req, ctx);
      if (res.status === 201) { try { await post((await res.clone().json()).item); } catch (e) { console.error("posting failed", e); } }
      return res;
    },
    update: async (req: Request, ctx: any) => {
      const res: Response = await base.update(req, ctx);
      if (res.ok) {
        try {
          const item = (await res.clone().json()).item;
          const auth = await getAuth();
          if (auth && item && item.source !== "sale") { await unpostManualTx(auth.business, item.id); await post(item); }
        } catch (e) { console.error("posting failed", e); }
      }
      return res;
    },
    remove: async (req: Request, ctx: any) => {
      const { id } = await ctx.params;
      const res: Response = await base.remove(req, ctx);
      if (res.ok) { try { const auth = await getAuth(); if (auth) await unpostManualTx(auth.business, Number(id)); } catch (e) { console.error(e); } }
      return res;
    },
  };
}

export const registryA: Record<string, any> = {
  discounts: makeCrud({
    table: discountCodes,
    feature: "discount",
    order: [desc(discountCodes.id)],
    spec: {
      code: str(30, true),
      type: { type: "enum", values: ["percent", "fixed"] },
      value: int(100_000_000, 1),
      minOrder: int(),
      maxUses: int(1_000_000),
      expiresAt: { type: "date" },
      isActive: { type: "bool" },
    },
    validate: async (_b, data) => {
      if (typeof data.code === "string") data.code = data.code.toUpperCase().replace(/\s+/g, "");
      if (data.type === "percent" && Number(data.value) > 100) throw new HttpError(400, "درصد تخفیف حداکثر ۱۰۰ است");
    },
  }),

  customers: makeCrud({
    table: customers,
    feature: "loyalty",
    writers: ["cashier", "waiter"],
    order: [desc(customers.totalSpent), desc(customers.id)],
    decorate: async (rows, biz) => {
      const cfg = mergeSeg((biz.settings as Settings | null)?.segments);
      const now = Date.now();
      const ids = rows.map((row) => row.id);
      const counts = ids.length ? await db.select({ referrerId: customers.referredByCustomerId, count: sql<number>`count(*)::int` })
        .from(customers).where(eq(customers.businessId, biz.id)).groupBy(customers.referredByCustomerId) : [];
      return rows.map(({ referralCode: _referralCode, ...r }) => ({
        ...r,
        segment: segmentOf(r, cfg, now),
        isReferred: r.referredByCustomerId !== null,
        referralsCount: counts.find((entry) => entry.referrerId === r.id)?.count ?? 0,
      }));
    },
    spec: { name: str(80, true), phone: str(20, true), note: str(300), points: int(10_000_000), birthMonth: { type: "nullableInt", min: 1 }, birthDay: { type: "nullableInt", min: 1 }, smsOptIn: { type: "bool" } },
    validate: async (_b, data) => {
      if (typeof data.phone === "string") {
        data.phone = normPhone(data.phone);
        if (String(data.phone).length < 10) throw new HttpError(400, "شماره موبایل معتبر نیست");
      }
    },
  }),

  surveys: {
    ...makeCrud({
      table: surveys,
      feature: "surveys",
      order: [desc(surveys.id)],
      spec: { title: str(120, true), description: str(400), questions: { type: "json" }, isActive: { type: "bool" } },
      decorate: async (rows, biz) => {
        const c = await db
          .select({ id: surveyResponses.surveyId, n: sql<number>`count(*)::int` })
          .from(surveyResponses)
          .where(eq(surveyResponses.businessId, biz.id))
          .groupBy(surveyResponses.surveyId);
        return rows.map((r) => ({ ...r, responseCount: c.find((x) => x.id === r.id)?.n ?? 0 }));
      },
    }),
    get: withAuth<{ id: string }>(
      async (_req, { business }, { id }) => {
        const [survey] = await db.select().from(surveys).where(and(eq(surveys.id, Number(id)), eq(surveys.businessId, business.id)));
        if (!survey) throw new HttpError(404, "نظرسنجی پیدا نشد");
        const responses = await db.select().from(surveyResponses).where(eq(surveyResponses.surveyId, survey.id)).orderBy(desc(surveyResponses.id)).limit(500);
        return Response.json({ survey, responses });
      },
      { feature: "surveys" },
    ),
  },

  warehouses: makeCrud({
    table: warehouses,
    writers: ["warehouse"],
    feature: "inventory",
    readFeature: ["inventory", "stock_control", "stock_movements"],
    order: [asc(warehouses.id)],
    spec: { name: str(60, true), location: str(120) },
  }),

  "inventory-categories": makeCrud({
    table: inventoryCategories,
    writers: ["warehouse"],
    feature: "inventory",
    readFeature: ["inventory", "stock_control", "stock_movements", "recipes", "costing"],
    order: [asc(inventoryCategories.name)],
    spec: { name: str(60, true) },
    validate: async (business, data, _auth, _creating, id) => {
      if (!data.name) return;
      data.name = String(data.name).trim();
      if (!data.name) throw new HttpError(400, "نام دسته‌بندی را وارد کنید");
      const [duplicate] = await db.select({ id: inventoryCategories.id }).from(inventoryCategories).where(and(
        eq(inventoryCategories.businessId, business.id),
        sql`lower(${inventoryCategories.name}) = ${String(data.name).toLocaleLowerCase()}`,
        ...(id ? [sql`${inventoryCategories.id} <> ${id}`] : []),
      ));
      if (duplicate) throw new HttpError(400, "این دسته‌بندی قبلاً ثبت شده است");
    },
  }),

  items: makeCrud({
    table: inventoryItems,
    writers: ["warehouse"],
    feature: "inventory",
    readFeature: ["inventory", "stock_control", "stock_movements", "recipes", "costing"],
    order: [asc(inventoryItems.name)],
    spec: {
      name: str(80, true),
      sku: str(64),
      unit: str(20),
      recipeUnit: str(20),
      recipeToStockFactor: { type: "float", min: 0.000001, max: 1e9 },
      warehouseId: { type: "nullableInt", min: 1 },
      categoryId: { type: "nullableInt", min: 1 },
      minStock: { type: "float", min: 0, max: 1e9 },
      reorderPoint: { type: "float", min: 0, max: 1e9 },
      trackStock: { type: "bool" },
      isActive: { type: "bool" },
      costPerUnit: int(1_000_000_000),
      lastPurchaseCost: int(1_000_000_000),
    },
    validate: async (b, data, _auth, creating, id) => {
      if (data.warehouseId) await owns(warehouses, data.warehouseId, b.id, "انبار نامعتبر است");
      if (data.categoryId) await owns(inventoryCategories, data.categoryId, b.id, "دسته‌بندی انبار نامعتبر است");
      if (data.sku !== undefined) {
        const sku = String(data.sku).trim().toUpperCase();
        if (sku && !/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(sku)) throw new HttpError(400, "کد کالا فقط می‌تواند شامل حروف لاتین، عدد و . _ / - باشد");
        data.sku = sku || null;
        if (sku) {
          const [duplicate] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(and(
            eq(inventoryItems.businessId, b.id),
            sql`lower(${inventoryItems.sku}) = ${sku.toLowerCase()}`,
            ...(id ? [sql`${inventoryItems.id} <> ${id}`] : []),
          )).limit(1);
          if (duplicate) throw new HttpError(409, "این کد کالا قبلاً ثبت شده است");
        }
      }
      if (data.unit !== undefined && !validInventoryUnit(data.unit)) throw new HttpError(400, "واحد انبار معتبر نیست");
      if (data.recipeUnit !== undefined && !validInventoryUnit(data.recipeUnit)) throw new HttpError(400, "واحد مصرف در دستور تهیه معتبر نیست");
      if (!creating && (data.unit !== undefined || data.recipeUnit !== undefined || data.recipeToStockFactor !== undefined)) {
        const [existing] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, id!), eq(inventoryItems.businessId, b.id)));
        if (!existing) throw new HttpError(404, "کالا پیدا نشد");
        const nextStockUnit = String(data.unit ?? existing.unit);
        const nextRecipeUnit = String(data.recipeUnit ?? existing.recipeUnit);
        const converted = recipeToStockFactor(nextStockUnit, nextRecipeUnit);
        if (converted !== null) data.recipeToStockFactor = converted;
        else if (data.recipeToStockFactor === undefined && (data.unit !== undefined || data.recipeUnit !== undefined)) throw new HttpError(400, "برای واحدهای نامتجانس، ضریب تبدیل را نیز وارد کنید");
      }
      if (!creating && (data.costPerUnit !== undefined || data.unit !== undefined || data.warehouseId !== undefined)) {
        const [item] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, id!), eq(inventoryItems.businessId, b.id)));
        if (item && item.stock !== 0 && ((data.costPerUnit !== undefined && data.costPerUnit !== item.costPerUnit) || (data.unit !== undefined && data.unit !== item.unit) || (data.warehouseId !== undefined && data.warehouseId !== item.warehouseId))) throw new HttpError(400, "واحد، انبار و بهای کالای دارای موجودی قابل تغییر مستقیم نیست؛ ابتدا گردش آن را ثبت کنید");
      }
    },
    beforeDelete: async (b, id) => {
      const [movement] = await db.select({ id: stockMovements.id }).from(stockMovements).where(and(eq(stockMovements.itemId, id), eq(stockMovements.businessId, b.id))).limit(1);
      const [item] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, id), eq(inventoryItems.businessId, b.id)));
      if (movement || (item && item.stock !== 0)) throw new HttpError(400, "کالای دارای موجودی یا سابقه گردش قابل حذف نیست؛ سوابق انبار باید حفظ شوند");
    },
  }),

  recipes: makeCrud({
    table: recipes,
    writers: ["warehouse"],
    feature: "recipes",
    readFeature: ["recipes", "costing"],
    order: [asc(recipes.productId), asc(recipes.id)],
    spec: { productId: { type: "int", required: true, min: 1 }, itemId: { type: "int", required: true, min: 1 }, quantity: { type: "float", required: true, min: 0.0001, max: 100000 }, wastePercent: { type: "float", min: 0, max: 99.9 } },
    validate: async (b, data, _auth, creating, id) => {
      if (data.productId) await owns(products, data.productId, b.id, "محصول نامعتبر است");
      if (data.itemId) {
        const [item] = await db.select({ id: inventoryItems.id, isActive: inventoryItems.isActive }).from(inventoryItems).where(and(eq(inventoryItems.id, Number(data.itemId)), eq(inventoryItems.businessId, b.id)));
        if (!item) throw new HttpError(400, "ماده اولیه نامعتبر است");
        if (!item.isActive && (creating || id)) {
          const [existing] = id ? await db.select({ itemId: recipes.itemId }).from(recipes).where(and(eq(recipes.id, id), eq(recipes.businessId, b.id))) : [];
          if (!existing || existing.itemId !== item.id) throw new HttpError(400, "ماده غیرفعال را نمی‌توان به دستور تهیه جدید افزود");
        }
      }
    },
  }),

  bank: makeCrud({
    table: bankAccounts,
    writers: ["accountant"],
    feature: "bank_report",
    readFeature: ["bank_report", "accounting", "income_expense"],
    order: [asc(bankAccounts.id)],
    spec: { name: str(80, true), bank: str(60), accountNumber: str(40), openingBalance: { type: "int", min: -2_000_000_000 } },
  }),

  ledger: withPosting(makeCrud({
    table: transactions,
    writers: ["accountant"],
    feature: "accounting",
    order: [desc(transactions.date), desc(transactions.id)],
    defaults: { source: "manual" },
    spec: {
      kind: { type: "enum", values: ["income", "expense"], required: true },
      category: str(60),
      amount: { type: "int", required: true, min: 1, max: 100_000_000_000 },
      bankAccountId: { type: "nullableInt", min: 1 },
      description: str(300),
      date: { type: "date" },
    },
    validate: async (b, data) => {
      if (data.bankAccountId) await owns(bankAccounts, data.bankAccountId, b.id, "حساب بانکی نامعتبر است");
    },
    decorate: async (rows, biz) => {
      const acc = await db.select({ id: bankAccounts.id, name: bankAccounts.name }).from(bankAccounts).where(eq(bankAccounts.businessId, biz.id));
      return rows.slice(0, 500).map((r) => ({ ...r, accountName: acc.find((a) => a.id === r.bankAccountId)?.name ?? "صندوق (نقدی)" }));
    },
  })),

  incomeexpense: withPosting(makeCrud({
    table: transactions,
    writers: ["accountant"],
    feature: "income_expense",
    order: [desc(transactions.date), desc(transactions.id)],
    scope: sql`${transactions.source} <> 'sale'`,
    defaults: { source: "manual" },
    spec: {
      kind: { type: "enum", values: ["income", "expense"], required: true },
      category: str(60),
      amount: { type: "int", required: true, min: 1, max: 100_000_000_000 },
      bankAccountId: { type: "nullableInt", min: 1 },
      accountMoeinId: { type: "nullableInt", min: 1, required: true },
      accountTafsiliId: { type: "nullableInt", min: 1 },
      description: str(300),
      date: { type: "date" },
    },
    validate: async (b, data, _auth, creating, id) => {
      if (data.bankAccountId) await owns(bankAccounts, data.bankAccountId, b.id, "حساب بانکی نامعتبر است");
      let values = data;
      if (!creating && id) {
        const [current] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.businessId, b.id)));
        values = { ...current, ...data };
      }
      const moeinId = Number(values.accountMoeinId) || 0;
      const tafsiliId = Number(values.accountTafsiliId) || 0;
      if (!moeinId) {
        if (creating || "accountMoeinId" in data || "kind" in data) throw new HttpError(400, "حساب معین را انتخاب کنید");
        return;
      }
      await ensureAccounting(b);
      const accounts = await loadAccounts(b.id);
      const moein = accounts.find((a) => a.id === moeinId);
      const kind = values.kind === "income" ? "income" : "expense";
      const accountType = kind === "income" ? "revenue" : "expense";
      const nature = kind === "income" ? "credit" : "debit";
      const matches = (a: typeof accounts[number]) => a.type === accountType && a.nature === nature && a.isActive;
      if (!moein || moein.level !== "moein" || !matches(moein)) throw new HttpError(400, "حساب معین با ماهیت این درآمد یا هزینه سازگار نیست");
      if (tafsiliId) {
        const tafsili = accounts.find((a) => a.id === tafsiliId);
        if (!tafsili || tafsili.level !== "tafsili" || tafsili.parentId !== moein.id || !matches(tafsili)) throw new HttpError(400, "حساب تفصیلی باید زیرمجموعه همین معین و دارای ماهیت سازگار باشد");
      } else if (accounts.some((a) => a.parentId === moein.id && a.level === "tafsili" && a.type === accountType && a.nature === nature && a.isActive)) {
        throw new HttpError(400, "برای این حساب معین، انتخاب یک حساب تفصیلی الزامی است");
      }
    },
    decorate: async (rows, biz) => {
      const acc = await db.select({ id: bankAccounts.id, name: bankAccounts.name }).from(bankAccounts).where(eq(bankAccounts.businessId, biz.id));
      const accounts = await loadAccounts(biz.id);
      return rows.map((r) => ({
        ...r,
        accountName: acc.find((a) => a.id === r.bankAccountId)?.name ?? "صندوق (نقدی)",
        accountMoeinName: accounts.find((a) => a.id === r.accountMoeinId)?.name ?? "",
        accountTafsiliName: accounts.find((a) => a.id === r.accountTafsiliId)?.name ?? "",
      }));
    },
  })),

  assets: makeCrud({
    table: assets,
    writers: ["accountant"],
    feature: "assets",
    order: [desc(assets.purchaseDate)],
    spec: {
      name: str(100, true),
      category: str(60),
      purchaseDate: { type: "date", required: true },
      cost: { type: "int", required: true, min: 0, max: 100_000_000_000 },
      salvage: int(100_000_000_000),
      lifeMonths: int(1200, 1),
      note: str(300),
    },
  }),

  couriers: makeCrud({
    table: couriers,
    writers: ["cashier"],
    feature: "courier",
    order: [asc(couriers.id)],
    spec: { name: str(80, true), phone: str(20), vehicle: str(30), status: { type: "enum", values: ["available", "busy", "off"] } },
    decorate: async (rows, biz) => {
      const active = await db
        .select({ id: orders.courierId, n: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(eq(orders.businessId, biz.id), notInArray(orders.status, ["paid", "canceled", "served"])))
        .groupBy(orders.courierId);
      return rows.map((r) => ({ ...r, activeCount: active.find((a) => a.id === r.id)?.n ?? 0 }));
    },
  }),

  zones: makeCrud({
    table: deliveryZones,
    feature: "zones",
    order: [asc(deliveryZones.id)],
    spec: { name: str(80, true), fee: int(100_000_000), minOrder: int(), etaMinutes: int(600), radiusKm: int(500), areas: str(400), isActive: { type: "bool" } },
  }),

  dev_tablet: devCrud("tablet_pos", ["tablet", "pos"]),
  dev_printer: devCrud("cloud_printer", ["printer"]),
  dev_scale: devCrud("scale", ["scale"]),
  dev_pager: devCrud("foodcourt_pager", ["pager"]),
  dev_caller: devCrud("caller_id", ["caller_id"]),

  pagers: makeCrud({
    table: pagers,
    writers: ["cashier", "waiter", "chef"],
    feature: "foodcourt_pager",
    order: [asc(pagers.number)],
    spec: { number: { type: "int", required: true, min: 1, max: 9999 }, status: { type: "enum", values: ["free", "busy", "ringing"] }, orderId: { type: "nullableInt", min: 1 } },
    decorate: async (rows, biz) => {
      const ids = rows.map((r) => r.orderId).filter(Boolean);
      const os = ids.length ? await db.select({ id: orders.id, number: orders.number, total: orders.total }).from(orders).where(and(eq(orders.businessId, biz.id), inArray(orders.id, ids))) : [];
      return rows.map((r) => ({ ...r, orderNumber: os.find((o) => o.id === r.orderId)?.number ?? null }));
    },
  }),

  calls: makeCrud({
    table: calls,
    writers: ["cashier", "waiter"],
    feature: "caller_id",
    order: [desc(calls.id)],
    spec: { phone: str(20, true), handled: { type: "bool" } },
    validate: async (_b, data) => {
      if (typeof data.phone === "string") data.phone = normPhone(data.phone);
    },
    decorate: async (rows, biz) => {
      const phones = [...new Set(rows.map((r) => r.phone))];
      const cs = phones.length ? await db.select().from(customers).where(and(eq(customers.businessId, biz.id), inArray(customers.phone, phones))) : [];
      return rows.slice(0, 100).map((r) => {
        const c = cs.find((x) => x.phone === r.phone);
        return { ...r, customer: c ? { id: c.id, name: c.name, points: c.points, ordersCount: c.ordersCount, totalSpent: c.totalSpent } : null };
      });
    },
  }),

  crosssell: makeCrud({
    table: crossSellRules,
    feature: "cross_sell",
    order: [asc(crossSellRules.productId), asc(crossSellRules.id)],
    spec: { productId: { type: "int", required: true, min: 1 }, suggestedId: { type: "int", required: true, min: 1 } },
    validate: async (b, data) => {
      if (data.productId && data.productId === data.suggestedId) throw new HttpError(400, "محصول نمی‌تواند به خودش پیشنهاد شود");
      if (data.productId) await owns(products, data.productId, b.id, "محصول نامعتبر است");
      if (data.suggestedId) await owns(products, data.suggestedId, b.id, "محصول پیشنهادی نامعتبر است");
    },
  }),

  printjobs: {
    ...printjobsBase,
    create: withAuth(
      async (_req, { business }) => {
        const ps = await db.select().from(devices).where(and(eq(devices.businessId, business.id), eq(devices.kind, "printer")));
        if (!ps.length) throw new HttpError(400, "ابتدا یک پرینتر ابری اضافه کنید");
        const content = receiptText(business, { number: 0, type: "dine_in", tableName: "تست", customerName: "", note: "چاپ آزمایشی", total: 0, items: [{ name: "آیتم آزمایشی", quantity: 1, price: 0 }] });
        const rows = await db.insert(printJobs).values(ps.map((p) => ({ businessId: business.id, deviceId: p.id, content }))).returning();
        return Response.json({ item: rows[0] }, { status: 201 });
      },
      { feature: "cloud_printer" },
    ),
  },
};
