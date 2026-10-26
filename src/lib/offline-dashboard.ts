import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { businesses, categories, customerRewardCampaigns, customerRewardClaims, customers, diningTables, inventoryItems, offlineTerminals, offlineWorkspaceCommands, offlineWorkspaceSnapshots, orderItems, orders, products, stockMovements, warehouses } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { hasAny } from "@/lib/plans";
import { offlineAuth } from "@/lib/offline-pos";

const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SNAPSHOT_BYTES = 4_000_000;

type MenuPayload = {
  business: { id: number; name: string; slug: string; type: string; logoUrl: string; accentColor: string; taxPercent: number; servicePercent: number };
  categories: { id: number; parentCategoryId: number | null; name: string; description: string; emoji: string; imageUrl: string; sortOrder: number; isActive: boolean }[];
  products: { id: number; categoryId: number | null; name: string; description: string; videoUrl: string; price: number; sellingMode: string; yieldRatio: number; oldPrice: number | null; emoji: string; imageUrl: string; prepMinutes: number; isAvailable: boolean; isFeatured: boolean; modifierGroups: unknown; dietaryTags: string[]; allergenTags: string[] }[];
  tables: { id: number; name: string; zone: string; capacity: number; operationalStatus: string }[];
};
type CustomerPayload = {
  customers: { id: number; name: string; phone: string; points: number; walletBalance: number; lastOrderAt: string | null; totalSpent: number; ordersCount: number; createdAt: string }[];
  totalCustomers: number;
};
type InventoryPayload = {
  items: { id: number; warehouseId: number | null; categoryId: number | null; name: string; sku: string | null; unit: string; recipeUnit: string; recipeToStockFactor: number; stock: number; minStock: number; reorderPoint: number; trackStock: boolean; isActive: boolean; expiryDate: string | null; costPerUnit: number; lastPurchaseCost: number }[];
  warehouses: { id: number; name: string; location: string }[];
  movements: { id: number; itemId: number; type: string; delta: number; balanceAfter: number; unitCost: number; invoiceNo: string; amount: number; createdAt: string }[];
  totalItems: number;
};
type OrdersPayload = {
  orders: {
    id: number; number: number; tableId: number | null; tableName: string | null; customerName: string; customerPhone: string;
    type: string; source: string; status: string; note: string; address: string; deliveryFee: number; discountCode: string;
    discountAmount: number; membershipDiscount: number; cashbackUsed: number; scheduledFor: string | null; deliveryStatus: string;
    subtotal: number; tax: number; service: number; total: number;
    paymentMethod: string | null; paymentStatus: string; paymentBreakdown: unknown; createdAt: string;
    items: { id: number; productId: number | null; name: string; price: number; quantity: number; weightGrams: number | null; tareGrams: number; lineTotal: number; note: string; optionSnapshot: unknown }[];
  }[];
  totalOrders: number;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function responseShape(row: typeof offlineWorkspaceSnapshots.$inferSelect) {
  return {
    schemaVersion: row.schemaVersion,
    dataset: row.dataset,
    businessId: row.businessId,
    revision: row.revision,
    snapshotId: row.id,
    issuedAt: row.issuedAt.toISOString(),
    validUntil: row.validUntil.toISOString(),
    payload: row.payload,
  };
}

export async function offlineDashboardSnapshot(req: Request, dataset: string) {
  if (dataset !== "menu" && dataset !== "customers" && dataset !== "inventory" && dataset !== "orders") throw new HttpError(404, "این مجموعهٔ داده برای دریافت آفلاین تعریف نشده است");
  const { terminal, business, features } = await offlineAuth(req);
  if (dataset === "menu" && !hasAny(features, "cashier_pos")) throw new HttpError(403, "دریافت دادهٔ محلی در اشتراک فعلی فعال نیست");
  if (dataset === "customers" && (!hasAny(features, "cashier_pos") || !hasAny(features, "loyalty"))) throw new HttpError(403, "صندوق آفلاین و باشگاه مشتریان باید در اشتراک فعال باشند");
  if (dataset === "inventory" && (!hasAny(features, "cashier_pos") || !hasAny(features, "inventory"))) throw new HttpError(403, "صندوق آفلاین و انبار باید در اشتراک فعال باشند");
  if (dataset === "orders" && !hasAny(features, "cashier_pos")) throw new HttpError(403, "دریافت تاریخچهٔ سفارش به مجوز صندوق آفلاین نیاز دارد");

  return db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) {
      throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    }
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    let payload: MenuPayload | CustomerPayload | InventoryPayload | OrdersPayload;
    if (dataset === "menu") {
      const [currentBusiness] = await tx.select({ id: businesses.id, name: businesses.name, slug: businesses.slug, type: businesses.type, logoUrl: businesses.logoUrl, accentColor: businesses.accentColor, taxPercent: businesses.taxPercent, servicePercent: businesses.servicePercent }).from(businesses).where(eq(businesses.id, business.id));
      if (!currentBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");
      const categoryRows = await tx.select({ id: categories.id, parentCategoryId: categories.parentCategoryId, name: categories.name, description: categories.description, emoji: categories.emoji, imageUrl: categories.imageUrl, sortOrder: categories.sortOrder, isActive: categories.isActive }).from(categories).where(eq(categories.businessId, business.id)).orderBy(asc(categories.sortOrder), asc(categories.id));
      const productRows = await tx.select({ id: products.id, categoryId: products.categoryId, name: products.name, description: products.description, videoUrl: products.videoUrl, price: products.price, sellingMode: products.sellingMode, yieldRatio: products.yieldRatio, oldPrice: products.oldPrice, emoji: products.emoji, imageUrl: products.imageUrl, prepMinutes: products.prepMinutes, isAvailable: products.isAvailable, isFeatured: products.isFeatured, modifierGroups: products.modifierGroups, dietaryTags: products.dietaryTags, allergenTags: products.allergenTags }).from(products).where(eq(products.businessId, business.id)).orderBy(asc(products.id));
      const tableRows = await tx.select({ id: diningTables.id, name: diningTables.name, zone: diningTables.zone, capacity: diningTables.capacity, operationalStatus: diningTables.operationalStatus }).from(diningTables).where(eq(diningTables.businessId, business.id)).orderBy(asc(diningTables.id));
      payload = { business: currentBusiness, categories: categoryRows, products: productRows, tables: tableRows };
    } else if (dataset === "customers") {
      const customerRows = await tx.select({ id: customers.id, name: customers.name, phone: customers.phone, points: customers.points, walletBalance: customers.walletBalance, lastOrderAt: customers.lastOrderAt, totalSpent: customers.totalSpent, ordersCount: customers.ordersCount, createdAt: customers.createdAt })
        .from(customers).where(eq(customers.businessId, business.id)).orderBy(desc(customers.totalSpent), desc(customers.id)).limit(10_001);
      if (customerRows.length > 10_000) throw new HttpError(413, "فهرست مشتریان برای دریافت یک‌جای آفلاین بیش از سقف ۱۰٬۰۰۰ نفر است؛ همگام‌سازی صفحه‌بندی‌شده لازم است");
      payload = {
        customers: customerRows.map((row) => ({ ...row, lastOrderAt: row.lastOrderAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })),
        totalCustomers: customerRows.length,
      };
    } else if (dataset === "inventory") {
      const itemRows = await tx.select({
        id: inventoryItems.id, warehouseId: inventoryItems.warehouseId, categoryId: inventoryItems.categoryId,
        name: inventoryItems.name, sku: inventoryItems.sku, unit: inventoryItems.unit, recipeUnit: inventoryItems.recipeUnit,
        recipeToStockFactor: inventoryItems.recipeToStockFactor, stock: inventoryItems.stock, minStock: inventoryItems.minStock,
        reorderPoint: inventoryItems.reorderPoint, trackStock: inventoryItems.trackStock, isActive: inventoryItems.isActive,
        expiryDate: inventoryItems.expiryDate, costPerUnit: inventoryItems.costPerUnit, lastPurchaseCost: inventoryItems.lastPurchaseCost,
      }).from(inventoryItems).where(eq(inventoryItems.businessId, business.id)).orderBy(asc(inventoryItems.name), asc(inventoryItems.id)).limit(10_001);
      if (itemRows.length > 10_000) throw new HttpError(413, "فهرست کالاهای انبار برای دریافت یک‌جای آفلاین بیش از سقف ۱۰٬۰۰۰ قلم است؛ همگام‌سازی صفحه‌بندی‌شده لازم است");
      const warehouseRows = await tx.select({ id: warehouses.id, name: warehouses.name, location: warehouses.location })
        .from(warehouses).where(eq(warehouses.businessId, business.id)).orderBy(asc(warehouses.name), asc(warehouses.id));
      const movementRows = await tx.select({
        id: stockMovements.id, itemId: stockMovements.itemId, type: stockMovements.type, delta: stockMovements.delta,
        balanceAfter: stockMovements.balanceAfter, unitCost: stockMovements.unitCost, invoiceNo: stockMovements.invoiceNo,
        amount: stockMovements.amount, createdAt: stockMovements.createdAt,
      }).from(stockMovements).where(eq(stockMovements.businessId, business.id))
        .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id)).limit(300);
      payload = {
        items: itemRows,
        warehouses: warehouseRows,
        movements: movementRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        totalItems: itemRows.length,
      };
    } else {
      const orderRows = await tx.select({
        id: orders.id, number: orders.number, tableId: orders.tableId, tableName: diningTables.name,
        customerName: orders.customerName, customerPhone: orders.customerPhone, type: orders.type, source: orders.source,
        status: orders.status, note: orders.note, address: orders.address, deliveryFee: orders.deliveryFee,
        discountCode: orders.discountCode, discountAmount: orders.discountAmount, membershipDiscount: orders.membershipDiscount,
        cashbackUsed: orders.cashbackUsed, scheduledFor: orders.scheduledFor, deliveryStatus: orders.deliveryStatus,
        subtotal: orders.subtotal, tax: orders.tax, service: orders.service,
        total: orders.total, paymentMethod: orders.paymentMethod, paymentStatus: orders.paymentStatus,
        paymentBreakdown: orders.paymentBreakdown, createdAt: orders.createdAt,
      }).from(orders).leftJoin(diningTables, and(eq(diningTables.id, orders.tableId), eq(diningTables.businessId, business.id)))
        .where(and(eq(orders.businessId, business.id), isNull(orders.deletedAt)))
        .orderBy(desc(orders.createdAt), desc(orders.id)).limit(100);
      const itemRows = orderRows.length ? await tx.select({
        id: orderItems.id, orderId: orderItems.orderId, productId: orderItems.productId, name: orderItems.name,
        price: orderItems.price, quantity: orderItems.quantity, weightGrams: orderItems.weightGrams,
        tareGrams: orderItems.tareGrams, lineTotal: orderItems.lineTotal, note: orderItems.note,
        optionSnapshot: orderItems.optionSnapshot,
      }).from(orderItems).where(inArray(orderItems.orderId, orderRows.map((row) => row.id))).orderBy(asc(orderItems.id)) : [];
      const itemsByOrder = new Map<number, typeof itemRows>();
      for (const item of itemRows) itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);
      payload = {
        orders: orderRows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          scheduledFor: row.scheduledFor?.toISOString() ?? null,
          paymentBreakdown: row.paymentBreakdown ? (() => {
            const payment = row.paymentBreakdown as Record<string, unknown>;
            return {
              cashAmount: payment.cashAmount, bankAmount: payment.bankAmount, bankAccountName: payment.bankAccountName,
              posAmount: payment.posAmount, posDeviceName: payment.posDeviceName, posBankAccountName: payment.posBankAccountName,
              posTerminalNumber: payment.posTerminalNumber, posRefNo: payment.posRefNo, creditAmount: payment.creditAmount,
              settledAt: payment.settledAt,
            };
          })() : null,
          items: itemsByOrder.get(row.id) ?? [],
        })),
        totalOrders: orderRows.length,
      };
    }
    if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_SNAPSHOT_BYTES) {
      const message = dataset === "menu" ? "اطلاعات منو از سقف دریافت آفلاین بیشتر است؛ تصاویر باید از نشانی فایل بارگذاری‌شده باشند" : dataset === "customers" ? "فهرست مشتریان برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "orders" ? "تاریخچه سفارش‌ها برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : "اطلاعات انبار برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است";
      throw new HttpError(413, message);
    }
    const payloadHash = createHash("sha256").update(canonical(payload)).digest("hex");
    const [latest] = await tx.select().from(offlineWorkspaceSnapshots).where(and(eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.dataset, dataset))).orderBy(desc(offlineWorkspaceSnapshots.revision)).limit(1);
    const now = new Date();
    const validUntil = new Date(now.getTime() + SNAPSHOT_TTL_MS);

    if (latest?.payloadHash === payloadHash) {
      const [refreshed] = await tx.update(offlineWorkspaceSnapshots).set({ issuedAt: now, validUntil }).where(and(eq(offlineWorkspaceSnapshots.id, latest.id), eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.businessId, business.id))).returning();
      if (!refreshed) throw new HttpError(409, "تمدید نسخهٔ دادهٔ آفلاین انجام نشد");
      return responseShape(refreshed);
    }

    const [saved] = await tx.insert(offlineWorkspaceSnapshots).values({ id: randomUUID(), terminalId: terminal.id, businessId: business.id, dataset, revision: (latest?.revision ?? 0) + 1, schemaVersion: 1, payloadHash, payload, issuedAt: now, validUntil }).returning();
    if (!saved) throw new HttpError(500, "ذخیرهٔ نسخهٔ دادهٔ آفلاین انجام نشد");
    return responseShape(saved);
  }, { isolationLevel: "repeatable read" });
}

type MenuCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "menu";
  action: "update_product" | "update_category";
  baseDataset: "menu";
  baseSnapshotId: string;
  baseRevision: number;
  payload: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseMenuCommand(raw: unknown): MenuCommand {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.module !== "menu" || !["update_product", "update_category"].includes(String(raw.action))) {
    throw new HttpError(400, "قالب فرمان منوی آفلاین معتبر نیست");
  }
  const allowedCommandKeys = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(raw).some((key) => !allowedCommandKeys.includes(key))) throw new HttpError(400, "فرمان منو فیلد ناشناخته دارد");
  if (typeof raw.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.id)) throw new HttpError(400, "شناسه فرمان معتبر نیست");
  if (!Number.isSafeInteger(raw.businessId) || Number(raw.businessId) < 1) throw new HttpError(400, "کسب‌وکار فرمان معتبر نیست");
  if (raw.baseDataset !== "menu" || typeof raw.baseSnapshotId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.baseSnapshotId)) throw new HttpError(400, "snapshot پایهٔ فرمان معتبر نیست");
  if (!Number.isSafeInteger(raw.baseRevision) || Number(raw.baseRevision) < 1) throw new HttpError(400, "نسخه پایهٔ فرمان معتبر نیست");
  if (!isRecord(raw.payload)) throw new HttpError(400, "محتوای فرمان معتبر نیست");
  const action = raw.action as MenuCommand["action"];
  const payload = raw.payload;
  const patch = payload.patch;
  const expectedId = action === "update_product" ? payload.productId : payload.categoryId;
  const payloadKeys = action === "update_product" ? ["productId", "patch"] : ["categoryId", "patch"];
  if (Object.keys(payload).some((key) => !payloadKeys.includes(key))) throw new HttpError(400, "محتوای فرمان منو فیلد ناشناخته دارد");
  if (!Number.isSafeInteger(expectedId) || Number(expectedId) < 1 || !isRecord(patch)) throw new HttpError(400, "شناسه یا تغییرات منو معتبر نیست");
  const allowed = action === "update_product" ? ["name", "description", "price", "isAvailable"] : ["name", "description", "isActive", "sortOrder"];
  const keys = Object.keys(patch);
  if (!keys.length || keys.some((key) => !allowed.includes(key))) throw new HttpError(400, "فرمان فقط می‌تواند فیلدهای مجاز منو را تغییر دهد");
  if ("name" in patch && (typeof patch.name !== "string" || !patch.name.trim() || patch.name.trim().length > (action === "update_product" ? 100 : 60))) throw new HttpError(400, "نام منو معتبر نیست");
  if ("description" in patch && (typeof patch.description !== "string" || patch.description.length > (action === "update_product" ? 400 : 500))) throw new HttpError(400, "توضیح منو معتبر نیست");
  if ("price" in patch && (!Number.isSafeInteger(patch.price) || Number(patch.price) < 0 || Number(patch.price) > 100_000_000)) throw new HttpError(400, "قیمت محصول معتبر نیست");
  if ("isAvailable" in patch && typeof patch.isAvailable !== "boolean") throw new HttpError(400, "وضعیت موجودی محصول معتبر نیست");
  if ("isActive" in patch && typeof patch.isActive !== "boolean") throw new HttpError(400, "وضعیت دسته‌بندی معتبر نیست");
  if ("sortOrder" in patch && (!Number.isSafeInteger(patch.sortOrder) || Number(patch.sortOrder) < 0 || Number(patch.sortOrder) > 10_000)) throw new HttpError(400, "ترتیب دسته‌بندی معتبر نیست");
  return raw as unknown as MenuCommand;
}

export async function syncOfflineDashboardCommand(req: Request, raw: unknown) {
  const command = parseMenuCommand(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos")) throw new HttpError(403, "همگام‌سازی پنل آفلاین در اشتراک فعلی فعال نیست");
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");

  const outcome = await db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    const [currentBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!currentBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.payloadHash !== payloadHash) {
        return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسه فرمان قبلاً با محتوای دیگری ثبت شده است" } };
      }
      return { httpStatus: previous.httpStatus, response: previous.result };
    }

    const snapshot = await tx.select().from(offlineWorkspaceSnapshots).where(and(
      eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId),
      eq(offlineWorkspaceSnapshots.terminalId, terminal.id),
      eq(offlineWorkspaceSnapshots.businessId, business.id),
      eq(offlineWorkspaceSnapshots.dataset, "menu"),
      eq(offlineWorkspaceSnapshots.revision, command.baseRevision),
    )).for("update").then((rows) => rows[0]);

    const record = async (state: "applied" | "conflict" | "rejected", httpStatus: 200 | 409 | 422, error = "", receipt = "") => {
      const response = { commandId: command.id, state, receipt, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({
        id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy,
        module: command.module, action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>,
        state, httpStatus, error, receipt, result: response,
      });
      return { httpStatus, response };
    };

    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "snapshot منوی مبنا پیدا نشد یا اعتبارش پایان یافته است");
    const targetId = Number(command.action === "update_product" ? command.payload.productId : command.payload.categoryId);
    const patch = command.payload.patch as Record<string, unknown>;

    if (command.action === "update_product") {
      const [current] = await tx.select({ id: products.id, name: products.name, description: products.description, price: products.price, isAvailable: products.isAvailable })
        .from(products).where(and(eq(products.id, targetId), eq(products.businessId, business.id))).for("update");
      const baseRows = (snapshot.payload.products as Record<string, unknown>[] | undefined) ?? [];
      const base = baseRows.find((row) => row.id === targetId);
      if (!current || !base) return record("conflict", 409, "محصول در snapshot مبنا یا سرور پیدا نشد");
      if (Object.keys(patch).some((key) => canonical(current[key as keyof typeof current]) !== canonical(base[key]))) {
        return record("conflict", 409, "محصول از زمان دریافت snapshot تغییر کرده است؛ نسخهٔ تازه دریافت و تغییر را دوباره بررسی کنید");
      }
      const nextPrice = Number(patch.price ?? current.price);
      const nextAvailability = Boolean(patch.isAvailable ?? current.isAvailable);
      if (nextPrice <= 0 || !nextAvailability) {
        const [[campaign], [claim]] = await Promise.all([
          tx.select({ id: customerRewardCampaigns.id }).from(customerRewardCampaigns).where(and(eq(customerRewardCampaigns.businessId, business.id), eq(customerRewardCampaigns.productId, targetId), eq(customerRewardCampaigns.isActive, true))).limit(1),
          tx.select({ id: customerRewardClaims.id }).from(customerRewardClaims).where(and(eq(customerRewardClaims.businessId, business.id), eq(customerRewardClaims.productId, targetId), eq(customerRewardClaims.status, "active"))).limit(1),
        ]);
        if (campaign || claim) return record("rejected", 422, "این محصول جایزهٔ فعال دارد و نمی‌تواند ناموجود یا بدون قیمت شود");
      }
      await tx.update(products).set(patch as Partial<typeof products.$inferInsert>).where(and(eq(products.id, targetId), eq(products.businessId, business.id)));
    } else {
      const [current] = await tx.select({ id: categories.id, name: categories.name, description: categories.description, isActive: categories.isActive, sortOrder: categories.sortOrder })
        .from(categories).where(and(eq(categories.id, targetId), eq(categories.businessId, business.id))).for("update");
      const baseRows = (snapshot.payload.categories as Record<string, unknown>[] | undefined) ?? [];
      const base = baseRows.find((row) => row.id === targetId);
      if (!current || !base) return record("conflict", 409, "دسته‌بندی در snapshot مبنا یا سرور پیدا نشد");
      if (Object.keys(patch).some((key) => canonical(current[key as keyof typeof current]) !== canonical(base[key]))) {
        return record("conflict", 409, "دسته‌بندی از زمان دریافت snapshot تغییر کرده است؛ نسخهٔ تازه دریافت و تغییر را دوباره بررسی کنید");
      }
      await tx.update(categories).set(patch as Partial<typeof categories.$inferInsert>).where(and(eq(categories.id, targetId), eq(categories.businessId, business.id)));
    }

    return record("applied", 200, "", randomUUID());
  }, { isolationLevel: "repeatable read" });

  if (outcome.httpStatus !== 200) {
    const error = typeof outcome.response.error === "string" ? outcome.response.error : "فرمان پنل آفلاین اعمال نشد";
    throw new HttpError(outcome.httpStatus, error);
  }
  return outcome.response;
}
