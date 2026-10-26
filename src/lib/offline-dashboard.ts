import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accAccounts, accDocuments, accFiscalYears, accLines, businesses, cashShifts, categories, customerRewardCampaigns, customerRewardClaims, customers, diningTables, inventoryItems, offlineStaffAttendanceRequests, offlineTerminals, offlineWorkspaceCommands, offlineWorkspaceSnapshots, orderItems, orders, products, receivableAccounts, receivablePaymentReversals, receivablePayments, receivables, reservations, staff, staffAttendanceRecords, staffLeaveRequests, staffSchedules, staffShiftSwapRequests, stockMovements, suppliers, users, warehouses } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { hasAny } from "@/lib/plans";
import { offlineAuth } from "@/lib/offline-pos";
import * as Accounting from "@/lib/accounting";
import { syncOfflineAccountingCommand } from "@/lib/offline-accounting";
import { outstandingAmount, receivableState } from "@/lib/receivables-core";
import { cashShiftTotalsByShift } from "@/lib/cash-shifts";
import { startOfDayTehran } from "@/lib/jalali";

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
  suppliers: { id: number; name: string; isActive: boolean; hasPayableAccount: boolean }[];
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
type ReservationsPayload = {
  reservations: {
    id: number; tableId: number | null; tableName: string | null; customerName: string; customerPhone: string;
    guestCount: number; reservationType: string; startsAt: string; durationMinutes: number; status: string;
    depositAmount: number; depositStatus: string; depositMethod: string; note: string; createdAt: string; updatedAt: string;
  }[];
  totalReservations: number;
};
type ShiftsPayload = {
  range: { from: string; to: string };
  staff: { id: number; name: string; role: string }[];
  schedules: {
    id: number; staffId: number; staffName: string; startsAt: string; endsAt: string; location: string;
    status: string; absenceNote: string; version: number; updatedAt: string;
    attendance: { checkInAt: string | null; checkOutAt: string | null } | null;
  }[];
  leaveRequests: {
    id: number; staffId: number; staffName: string; startsAt: string; endsAt: string; kind: string;
    reason: string; status: string; decisionNote: string; createdAt: string;
  }[];
  shiftSwapRequests: {
    id: number; scheduleId: number; fromStaffId: number; toStaffId: number; fromStaffName: string; toStaffName: string;
    status: string; reason: string; decisionNote: string; startsAt: string; endsAt: string; createdAt: string;
  }[];
  offlineAttendanceRequests: { id: string; scheduleId: number; action: string; occurredAt: string; status: string; reviewNote: string }[];
  totalSchedules: number;
  totalLeaveRequests: number;
};
type AccountingPayload = {
  accounts: { id: number; code: string; name: string; level: string; parentId: number | null; type: string; nature: string; isSystem: boolean; isActive: boolean }[];
  years: { id: number; title: string; startDate: string; endDate: string; isClosed: boolean }[];
  documents: { id: number; number: number; date: string; kind: string; source: string; description: string; status: string; reversed: boolean; reversedOf: number | null; totalAmount: number; lines: { accountId: number; accountCode: string; accountName: string; debit: number; credit: number; description: string }[] }[];
  totalDocuments: number;
};
type ReceivablesPayload = {
  receivables: { id: number; accountId: number; accountName: string; accountType: string; phone: string; orderId: number | null; orderNumber: number | null; source: string; amount: number; received: number; balance: number; status: string; dueAt: string | null; description: string; accountingDocumentId: number | null; createdAt: string }[];
  payments: { id: number; receivableId: number; amount: number; method: string; note: string; createdAt: string }[];
  reversals: { id: number; paymentId: number; amount: number; reason: string; createdAt: string }[];
  totalReceivables: number;
  totalBalance: number;
};
type CashShiftRow = {
  id: number; openedAt: string; openingCash: number; openedByName: string;
  closedAt: string | null; closingCash: number | null; expectedCash: number; cashDifference: number | null;
  closedByName: string; note: string; cashSales: number; nonCashSales: number; byMethod: { method: string; amount: number }[];
};
type CashShiftsPayload = { active: CashShiftRow | null; history: CashShiftRow[]; historyHasMore: boolean };
type SalesReportsPayload = {
  from: string; to: string;
  totals: { revenue: number; orders: number; average: number; discounts: number; tax: number; cogs: number; grossProfit: number; soldItems: number };
  series: { date: string; revenue: number; orders: number }[];
  byProduct: { name: string; quantity: number; revenue: number }[];
  statuses: { status: string; paymentStatus: string; orders: number; amount: number }[];
};

type OrderHistoryCursor = { createdAt: string; id: number };
const ORDER_HISTORY_PAGE_SIZE = 50;
const ORDER_HISTORY_CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function encodeOrderHistoryCursor(cursor: OrderHistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function parseOrderHistoryCursor(value: string | null): OrderHistoryCursor | null {
  if (value === null) return null;
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new HttpError(400, "نشانگر صفحهٔ تاریخچهٔ سفارش معتبر نیست");
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (Object.keys(decoded).length !== 2 || typeof decoded.createdAt !== "string" || !ORDER_HISTORY_CURSOR_TIME.test(decoded.createdAt) || !Number.isSafeInteger(decoded.id) || Number(decoded.id) < 1 || !Number.isFinite(Date.parse(decoded.createdAt))) {
      throw new Error("invalid cursor");
    }
    return { createdAt: decoded.createdAt, id: Number(decoded.id) };
  } catch {
    throw new HttpError(400, "نشانگر صفحهٔ تاریخچهٔ سفارش معتبر نیست");
  }
}

export async function offlineOrderHistoryPage(req: Request) {
  const cursor = parseOrderHistoryCursor(new URL(req.url).searchParams.get("cursor"));
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos")) throw new HttpError(403, "دریافت تاریخچهٔ سفارش به مجوز صندوق آفلاین نیاز دارد");
  return db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");
    const cursorTimestamp = cursor ? sql`${cursor.createdAt}::timestamptz` : undefined;
    const cursorPredicate = cursor && cursorTimestamp ? or(
      lt(orders.createdAt, cursorTimestamp),
      and(eq(orders.createdAt, cursorTimestamp), lt(orders.id, cursor.id)),
    ) : undefined;
    const orderRows = await tx.select({
      id: orders.id, number: orders.number, tableId: orders.tableId, tableName: diningTables.name,
      customerName: orders.customerName, customerPhone: orders.customerPhone, type: orders.type, source: orders.source,
      status: orders.status, note: orders.note, address: orders.address, deliveryFee: orders.deliveryFee,
      discountCode: orders.discountCode, discountAmount: orders.discountAmount, membershipDiscount: orders.membershipDiscount,
      cashbackUsed: orders.cashbackUsed, scheduledFor: orders.scheduledFor, deliveryStatus: orders.deliveryStatus,
      subtotal: orders.subtotal, tax: orders.tax, service: orders.service, total: orders.total,
      paymentMethod: orders.paymentMethod, paymentStatus: orders.paymentStatus, paymentBreakdown: orders.paymentBreakdown,
      createdAt: orders.createdAt,
      createdAtCursor: sql<string>`to_char(${orders.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    }).from(orders).leftJoin(diningTables, and(eq(diningTables.id, orders.tableId), eq(diningTables.businessId, business.id)))
      .where(and(eq(orders.businessId, business.id), isNull(orders.deletedAt), cursorPredicate))
      .orderBy(desc(orders.createdAt), desc(orders.id)).limit(ORDER_HISTORY_PAGE_SIZE + 1);
    const hasMore = orderRows.length > ORDER_HISTORY_PAGE_SIZE;
    const pageRows = hasMore ? orderRows.slice(0, ORDER_HISTORY_PAGE_SIZE) : orderRows;
    const itemRows = pageRows.length ? await tx.select({
      id: orderItems.id, orderId: orderItems.orderId, productId: orderItems.productId, name: orderItems.name,
      price: orderItems.price, quantity: orderItems.quantity, weightGrams: orderItems.weightGrams,
      tareGrams: orderItems.tareGrams, lineTotal: orderItems.lineTotal, note: orderItems.note,
      optionSnapshot: orderItems.optionSnapshot,
    }).from(orderItems).where(inArray(orderItems.orderId, pageRows.map((row) => row.id))).orderBy(asc(orderItems.id)) : [];
    const itemsByOrder = new Map<number, typeof itemRows>();
    for (const item of itemRows) itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);
    const ordersPage = pageRows.map((row) => {
      const { createdAtCursor: _createdAtCursor, ...order } = row;
      return {
      ...order,
      createdAt: order.createdAt.toISOString(),
      scheduledFor: order.scheduledFor?.toISOString() ?? null,
      paymentBreakdown: order.paymentBreakdown ? (() => {
        const payment = order.paymentBreakdown as Record<string, unknown>;
        return {
          cashAmount: payment.cashAmount, bankAmount: payment.bankAmount, bankAccountName: payment.bankAccountName,
          posAmount: payment.posAmount, posDeviceName: payment.posDeviceName, posBankAccountName: payment.posBankAccountName,
          posTerminalNumber: payment.posTerminalNumber, posRefNo: payment.posRefNo, creditAmount: payment.creditAmount,
          settledAt: payment.settledAt,
        };
      })() : null,
      items: itemsByOrder.get(order.id) ?? [],
    }; });
    if (Buffer.byteLength(JSON.stringify(ordersPage), "utf8") > MAX_SNAPSHOT_BYTES) throw new HttpError(413, "صفحهٔ سفارش‌ها از سقف دریافت آفلاین بیشتر است");
    const last = pageRows.at(-1);
    const issuedAt = new Date().toISOString();
    return {
      schemaVersion: 1,
      dataset: "orders-history",
      businessId: business.id,
      requestCursor: new URL(req.url).searchParams.get("cursor"),
      nextCursor: hasMore && last ? encodeOrderHistoryCursor({ createdAt: last.createdAtCursor, id: last.id }) : null,
      hasMore,
      issuedAt,
      orders: ordersPage,
    };
  }, { isolationLevel: "repeatable read" });
}

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
  if (dataset !== "menu" && dataset !== "customers" && dataset !== "inventory" && dataset !== "orders" && dataset !== "reservations" && dataset !== "shifts" && dataset !== "accounting" && dataset !== "receivables" && dataset !== "cash_shifts" && dataset !== "reports") throw new HttpError(404, "این مجموعهٔ داده برای دریافت آفلاین تعریف نشده است");
  const { terminal, business, features } = await offlineAuth(req);
  if (dataset === "menu" && !hasAny(features, "cashier_pos")) throw new HttpError(403, "دریافت دادهٔ محلی در اشتراک فعلی فعال نیست");
  if (dataset === "customers" && (!hasAny(features, "cashier_pos") || !hasAny(features, "loyalty"))) throw new HttpError(403, "صندوق آفلاین و باشگاه مشتریان باید در اشتراک فعال باشند");
  if (dataset === "inventory" && (!hasAny(features, "cashier_pos") || !hasAny(features, "inventory"))) throw new HttpError(403, "صندوق آفلاین و انبار باید در اشتراک فعال باشند");
  if (dataset === "orders" && !hasAny(features, "cashier_pos")) throw new HttpError(403, "دریافت تاریخچهٔ سفارش به مجوز صندوق آفلاین نیاز دارد");
  if (dataset === "reservations" && (!hasAny(features, "cashier_pos") || !hasAny(features, "reservations"))) throw new HttpError(403, "دریافت تاریخچهٔ رزرو به مجوز صندوق آفلاین و رزرو میز نیاز دارد");
  if (dataset === "shifts" && (!hasAny(features, "cashier_pos") || !hasAny(features, "staff_scheduling"))) throw new HttpError(403, "دریافت برنامهٔ شیفت به مجوز صندوق آفلاین و برنامه‌ریزی کارکنان نیاز دارد");
  if (dataset === "accounting" && (!hasAny(features, "cashier_pos") || !hasAny(features, "accounting"))) throw new HttpError(403, "دریافت حسابداری آفلاین به مجوز صندوق و حسابداری نیاز دارد");
  if (dataset === "receivables" && (!hasAny(features, "cashier_pos") || !hasAny(features, "accounting"))) throw new HttpError(403, "مطالبات آفلاین به مجوز صندوق و حسابداری نیاز دارد");
  if (dataset === "cash_shifts" && !hasAny(features, "cashier_pos")) throw new HttpError(403, "دریافت شیفت‌های صندوق به مجوز صندوق نیاز دارد");
  if (dataset === "reports" && (!hasAny(features, "cashier_pos") || !hasAny(features, "sales_reports"))) throw new HttpError(403, "گزارش آفلاین به مجوز صندوق و گزارش فروش نیاز دارد");
  if (dataset === "accounting") await Accounting.ensureAccounting(business);

  return db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) {
      throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    }
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    let payload: MenuPayload | CustomerPayload | InventoryPayload | OrdersPayload | ReservationsPayload | ShiftsPayload | AccountingPayload | ReceivablesPayload | CashShiftsPayload | SalesReportsPayload;
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
      const supplierRows = await tx.select({ id: suppliers.id, name: suppliers.name, isActive: suppliers.isActive, hasPayableAccount: sql<boolean>`${suppliers.accountId} is not null` })
        .from(suppliers).where(eq(suppliers.businessId, business.id)).orderBy(asc(suppliers.name), asc(suppliers.id)).limit(1001);
      if (supplierRows.length > 1000) throw new HttpError(413, "فهرست فروشندگان برای snapshot انبار بیش از سقف ۱٬۰۰۰ نفر است");
      const movementRows = await tx.select({
        id: stockMovements.id, itemId: stockMovements.itemId, type: stockMovements.type, delta: stockMovements.delta,
        balanceAfter: stockMovements.balanceAfter, unitCost: stockMovements.unitCost, invoiceNo: stockMovements.invoiceNo,
        amount: stockMovements.amount, createdAt: stockMovements.createdAt,
      }).from(stockMovements).where(eq(stockMovements.businessId, business.id))
        .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id)).limit(300);
      payload = {
        items: itemRows,
        warehouses: warehouseRows,
        suppliers: supplierRows,
        movements: movementRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        totalItems: itemRows.length,
      };
    } else if (dataset === "reservations") {
      const reservationRows = await tx.select({
        id: reservations.id, tableId: reservations.tableId, tableName: diningTables.name,
        customerName: reservations.customerName, customerPhone: reservations.customerPhone,
        guestCount: reservations.guestCount, reservationType: reservations.reservationType,
        startsAt: reservations.startsAt, durationMinutes: reservations.durationMinutes, status: reservations.status,
        depositAmount: reservations.depositAmount, depositStatus: reservations.depositStatus,
        depositMethod: reservations.depositMethod, note: reservations.note,
        createdAt: reservations.createdAt, updatedAt: reservations.updatedAt,
      }).from(reservations).leftJoin(diningTables, and(eq(diningTables.id, reservations.tableId), eq(diningTables.businessId, business.id)))
        .where(eq(reservations.businessId, business.id)).orderBy(desc(reservations.updatedAt), desc(reservations.id)).limit(100);
      payload = {
        reservations: reservationRows.map((row) => ({
          ...row, startsAt: row.startsAt.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
        })),
        totalReservations: reservationRows.length,
      };
    } else if (dataset === "shifts") {
      const now = new Date();
      const from = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const to = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const [staffRows, scheduleRows, leaveRows, shiftSwapRows] = await Promise.all([
        tx.select({ id: staff.id, name: staff.name, role: staff.role }).from(staff)
          .where(and(eq(staff.businessId, business.id), eq(staff.isActive, true))).orderBy(asc(staff.name), asc(staff.id)).limit(301),
        tx.select({ id: staffSchedules.id, staffId: staffSchedules.staffId, staffName: staff.name, startsAt: staffSchedules.startsAt, endsAt: staffSchedules.endsAt, location: staffSchedules.location, status: staffSchedules.status, absenceNote: staffSchedules.absenceNote, version: staffSchedules.version, updatedAt: staffSchedules.updatedAt })
          .from(staffSchedules).innerJoin(staff, and(eq(staff.id, staffSchedules.staffId), eq(staff.businessId, business.id)))
          .where(and(eq(staffSchedules.businessId, business.id), lt(staffSchedules.startsAt, to), gt(staffSchedules.endsAt, from)))
          .orderBy(asc(staffSchedules.startsAt), asc(staffSchedules.id)).limit(501),
        tx.select({ id: staffLeaveRequests.id, staffId: staffLeaveRequests.staffId, staffName: staff.name, startsAt: staffLeaveRequests.startsAt, endsAt: staffLeaveRequests.endsAt, kind: staffLeaveRequests.kind, reason: staffLeaveRequests.reason, status: staffLeaveRequests.status, decisionNote: staffLeaveRequests.decisionNote, createdAt: staffLeaveRequests.createdAt })
          .from(staffLeaveRequests).innerJoin(staff, and(eq(staff.id, staffLeaveRequests.staffId), eq(staff.businessId, business.id)))
          .where(and(eq(staffLeaveRequests.businessId, business.id), lt(staffLeaveRequests.startsAt, to), gt(staffLeaveRequests.endsAt, from)))
          .orderBy(asc(staffLeaveRequests.startsAt), asc(staffLeaveRequests.id)).limit(501),
        tx.select({ id: staffShiftSwapRequests.id, scheduleId: staffShiftSwapRequests.scheduleId, fromStaffId: staffShiftSwapRequests.fromStaffId, toStaffId: staffShiftSwapRequests.toStaffId, status: staffShiftSwapRequests.status, reason: staffShiftSwapRequests.reason, decisionNote: staffShiftSwapRequests.decisionNote, startsAt: staffSchedules.startsAt, endsAt: staffSchedules.endsAt, createdAt: staffShiftSwapRequests.createdAt })
          .from(staffShiftSwapRequests).innerJoin(staffSchedules, and(eq(staffSchedules.id, staffShiftSwapRequests.scheduleId), eq(staffSchedules.businessId, business.id)))
          .where(and(eq(staffShiftSwapRequests.businessId, business.id), lt(staffSchedules.startsAt, to), gt(staffSchedules.endsAt, from)))
          .orderBy(desc(staffShiftSwapRequests.createdAt), desc(staffShiftSwapRequests.id)).limit(501),
      ]);
      if (staffRows.length > 300) throw new HttpError(413, "فهرست کارکنان از سقف دریافت یک‌جای آفلاین بیشتر است");
      if (scheduleRows.length > 500 || leaveRows.length > 500 || shiftSwapRows.length > 500) throw new HttpError(413, "برنامه یا درخواست‌های شیفت از سقف ۵۰۰ ردیف بیشتر است؛ دریافت صفحه‌بندی‌شده لازم است");
      const scheduleIds = scheduleRows.map((row) => row.id);
      const attendanceRows = scheduleIds.length ? await tx.select({ scheduleId: staffAttendanceRecords.scheduleId, checkInAt: staffAttendanceRecords.checkInAt, checkOutAt: staffAttendanceRecords.checkOutAt })
        .from(staffAttendanceRecords).where(and(eq(staffAttendanceRecords.businessId, business.id), inArray(staffAttendanceRecords.scheduleId, scheduleIds))) : [];
      const attendanceBySchedule = new Map(attendanceRows.map((row) => [row.scheduleId, row]));
      const staffNameById = new Map(staffRows.map((row) => [row.id, row.name]));
      const offlineAttendanceRows = await tx.select({ id: offlineStaffAttendanceRequests.id, scheduleId: offlineStaffAttendanceRequests.scheduleId, action: offlineStaffAttendanceRequests.action, occurredAt: offlineStaffAttendanceRequests.occurredAt, status: offlineStaffAttendanceRequests.status, reviewNote: offlineStaffAttendanceRequests.reviewNote })
        .from(offlineStaffAttendanceRequests).where(and(eq(offlineStaffAttendanceRequests.businessId, business.id), eq(offlineStaffAttendanceRequests.terminalId, terminal.id)))
        .orderBy(desc(offlineStaffAttendanceRequests.createdAt), desc(offlineStaffAttendanceRequests.id)).limit(200);
      payload = {
        range: { from: from.toISOString(), to: to.toISOString() },
        staff: staffRows,
        schedules: scheduleRows.map((row) => {
          const attendance = attendanceBySchedule.get(row.id);
          return {
            ...row,
            startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
            attendance: attendance ? { checkInAt: attendance.checkInAt?.toISOString() ?? null, checkOutAt: attendance.checkOutAt?.toISOString() ?? null } : null,
          };
        }),
        leaveRequests: leaveRows.map((row) => ({ ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), createdAt: row.createdAt.toISOString() })),
        shiftSwapRequests: shiftSwapRows.map((row) => ({ ...row, fromStaffName: staffNameById.get(row.fromStaffId) ?? `کارمند ${row.fromStaffId}`, toStaffName: staffNameById.get(row.toStaffId) ?? `کارمند ${row.toStaffId}`, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), createdAt: row.createdAt.toISOString() })),
        offlineAttendanceRequests: offlineAttendanceRows.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() })),
        totalSchedules: scheduleRows.length,
        totalLeaveRequests: leaveRows.length,
      };
    } else if (dataset === "accounting") {
      const [accountRows, yearRows, documentRows] = await Promise.all([
        tx.select({ id: accAccounts.id, code: accAccounts.code, name: accAccounts.name, level: accAccounts.level, parentId: accAccounts.parentId, type: accAccounts.type, nature: accAccounts.nature, isSystem: accAccounts.isSystem, isActive: accAccounts.isActive })
          .from(accAccounts).where(eq(accAccounts.businessId, business.id)).orderBy(asc(accAccounts.code), asc(accAccounts.id)).limit(1001),
        tx.select({ id: accFiscalYears.id, title: accFiscalYears.title, startDate: accFiscalYears.startDate, endDate: accFiscalYears.endDate, isClosed: accFiscalYears.isClosed })
          .from(accFiscalYears).where(eq(accFiscalYears.businessId, business.id)).orderBy(desc(accFiscalYears.startDate)).limit(101),
        tx.select({ id: accDocuments.id, fiscalYearId: accDocuments.fiscalYearId, number: accDocuments.number, date: accDocuments.date, kind: accDocuments.kind, source: accDocuments.source, description: accDocuments.description, status: accDocuments.status, reversed: accDocuments.reversed, reversedOf: accDocuments.reversedOf, totalAmount: accDocuments.totalAmount })
          .from(accDocuments).where(eq(accDocuments.businessId, business.id)).orderBy(desc(accDocuments.date), desc(accDocuments.id)).limit(101),
      ]);
      if (accountRows.length > 1000 || yearRows.length > 100 || documentRows.length > 100) throw new HttpError(413, "دادهٔ حسابداری از سقف snapshot آفلاین بیشتر است؛ دریافت صفحه‌بندی‌شده لازم است");
      const documentIds = documentRows.map((row) => row.id);
      const lineRows = documentIds.length ? await tx.select({ documentId: accLines.documentId, accountId: accLines.accountId, debit: accLines.debit, credit: accLines.credit, description: accLines.description, accountCode: accAccounts.code, accountName: accAccounts.name })
        .from(accLines).innerJoin(accAccounts, and(eq(accAccounts.id, accLines.accountId), eq(accAccounts.businessId, business.id)))
        .where(and(eq(accLines.businessId, business.id), inArray(accLines.documentId, documentIds))).orderBy(asc(accLines.id)) : [];
      const linesByDocument = new Map<number, typeof lineRows>();
      for (const line of lineRows) linesByDocument.set(line.documentId, [...(linesByDocument.get(line.documentId) ?? []), line]);
      payload = {
        accounts: accountRows,
        years: yearRows.map((year) => ({ ...year, startDate: year.startDate.toISOString(), endDate: year.endDate.toISOString() })),
        documents: documentRows.map((doc) => ({ ...doc, date: doc.date.toISOString(), lines: linesByDocument.get(doc.id) ?? [] })),
        totalDocuments: documentRows.length,
      };
    } else if (dataset === "cash_shifts") {
      const [active] = await tx.select().from(cashShifts).where(and(eq(cashShifts.businessId, business.id), isNull(cashShifts.closedAt))).orderBy(desc(cashShifts.openedAt)).limit(1);
      const closedRows = await tx.select().from(cashShifts).where(and(eq(cashShifts.businessId, business.id), isNotNull(cashShifts.closedAt))).orderBy(desc(cashShifts.closedAt), desc(cashShifts.id)).limit(101);
      const historyRows = closedRows.slice(0, 100), rows = [...(active ? [active] : []), ...historyRows];
      const userIds = [...new Set(rows.flatMap((row) => [row.openedBy, row.closedBy].filter((id): id is number => id !== null)))];
      const userRows = userIds.length ? await tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [];
      const names = new Map(userRows.map((row) => [row.id, row.name]));
      const totals = await cashShiftTotalsByShift(tx as unknown as typeof db, business.id, rows.map((row) => row.id));
      const present = (row: typeof rows[number]): CashShiftRow => {
        const summary = totals.get(row.id) ?? { cashSales: 0, nonCashSales: 0, byMethod: [] };
        const expectedCash = row.openingCash + summary.cashSales;
        return {
          id: row.id, openedAt: row.openedAt.toISOString(), openingCash: row.openingCash,
          openedByName: names.get(row.openedBy) ?? "کاربر", closedAt: row.closedAt?.toISOString() ?? null,
          closingCash: row.closingCash, expectedCash, cashDifference: row.closedAt ? (row.closingCash ?? 0) - expectedCash : null,
          closedByName: row.closedBy ? names.get(row.closedBy) ?? "کاربر" : "—", note: row.note,
          cashSales: summary.cashSales, nonCashSales: summary.nonCashSales, byMethod: summary.byMethod,
        };
      };
      payload = { active: active ? present(active) : null, history: historyRows.map(present), historyHasMore: closedRows.length > 100 };
    } else if (dataset === "reports") {
      const now = new Date(), today = startOfDayTehran(now), from = new Date(today.getTime() - 89 * 86_400_000), to = new Date(today.getTime() + 86_400_000 - 1);
      const dateKey = sql<string>`to_char(${orders.createdAt} AT TIME ZONE 'Asia/Tehran', 'YYYY-MM-DD')`;
      const paidOrders = and(eq(orders.businessId, business.id), eq(orders.status, "paid"), eq(orders.paymentStatus, "paid"), gt(orders.createdAt, new Date(from.getTime() - 1)), lt(orders.createdAt, new Date(to.getTime() + 1)));
      const [totals] = await tx.select({
        revenue: sql<number>`coalesce(sum(${orders.total}), 0)::float8`,
        orders: sql<number>`count(*)::int`,
        discounts: sql<number>`coalesce(sum(${orders.discountAmount}), 0)::float8`,
        tax: sql<number>`coalesce(sum(${orders.tax}), 0)::float8`,
        cogs: sql<number>`coalesce(sum(${orders.cogs}), 0)::float8`,
      }).from(orders).where(paidOrders);
      const dailyRows = await tx.select({
        day: dateKey,
        revenue: sql<number>`coalesce(sum(${orders.total}), 0)::float8`,
        orders: sql<number>`count(*)::int`,
      }).from(orders).where(paidOrders).groupBy(dateKey).orderBy(dateKey);
      const dailyByKey = new Map(dailyRows.map((row) => [row.day, row]));
      const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" });
      const series = Array.from({ length: 90 }, (_, index) => {
        const day = new Date(from.getTime() + index * 86_400_000), key = dayFormatter.format(day), row = dailyByKey.get(key);
        return { date: day.toISOString(), revenue: Number(row?.revenue ?? 0), orders: Number(row?.orders ?? 0) };
      });
      const byProductRows = await tx.select({
        name: orderItems.name,
        quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::float8`,
        revenue: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)::float8`,
      }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(paidOrders)
        .groupBy(orderItems.name).orderBy(desc(sql`sum(${orderItems.lineTotal})`)).limit(50);
      const [sold] = await tx.select({ quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::float8` })
        .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(paidOrders);
      const statusRows = await tx.select({
        status: orders.status, paymentStatus: orders.paymentStatus,
        orders: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(${orders.total}), 0)::float8`,
      }).from(orders).where(and(eq(orders.businessId, business.id), gt(orders.createdAt, new Date(from.getTime() - 1)), lt(orders.createdAt, new Date(to.getTime() + 1))))
        .groupBy(orders.status, orders.paymentStatus);
      const revenue = Number(totals?.revenue ?? 0), orderCount = Number(totals?.orders ?? 0), cogs = Number(totals?.cogs ?? 0);
      payload = {
        from: from.toISOString(), to: to.toISOString(),
        totals: { revenue, orders: orderCount, average: orderCount ? Math.round(revenue / orderCount) : 0, discounts: Number(totals?.discounts ?? 0), tax: Number(totals?.tax ?? 0), cogs, grossProfit: revenue - cogs, soldItems: Number(sold?.quantity ?? 0) },
        series,
        byProduct: byProductRows.map((row) => ({ name: row.name, quantity: Number(row.quantity), revenue: Number(row.revenue) })),
        statuses: statusRows.map((row) => ({ status: row.status, paymentStatus: row.paymentStatus, orders: Number(row.orders), amount: Number(row.amount) })),
      };
    } else if (dataset === "receivables") {
      const rows = await tx.select({
        id: receivables.id, accountId: receivables.accountId, accountName: receivableAccounts.name,
        accountType: receivableAccounts.type, phone: receivableAccounts.phone, orderId: receivables.orderId,
        orderNumber: orders.number, source: receivables.source, amount: receivables.amount, dueAt: receivables.dueAt,
        description: receivables.description, accountingDocumentId: receivables.accountingDocumentId, createdAt: receivables.createdAt,
      }).from(receivables)
        .innerJoin(receivableAccounts, and(eq(receivableAccounts.id, receivables.accountId), eq(receivableAccounts.businessId, business.id)))
        .leftJoin(orders, and(eq(orders.id, receivables.orderId), eq(orders.businessId, business.id)))
        .where(eq(receivables.businessId, business.id)).orderBy(desc(receivables.createdAt), desc(receivables.id)).limit(501);
      if (rows.length > 500) throw new HttpError(413, "دفتر مطالبات بیش از ۵۰۰ ردیف است؛ برای دریافت آفلاین باید صفحه‌بندی شود");
      const ids = rows.map((row) => row.id);
      const paymentRows = ids.length ? await tx.select({ id: receivablePayments.id, receivableId: receivablePayments.receivableId, amount: receivablePayments.amount, method: receivablePayments.method, note: receivablePayments.note, createdAt: receivablePayments.createdAt })
        .from(receivablePayments).where(and(eq(receivablePayments.businessId, business.id), inArray(receivablePayments.receivableId, ids)))
        .orderBy(asc(receivablePayments.id)).limit(5001) : [];
      if (paymentRows.length > 5000) throw new HttpError(413, "گردش دریافت مطالبات برای snapshot آفلاین بیش از ۵٬۰۰۰ ردیف است؛ دریافت صفحه‌بندی‌شده لازم است");
      const paymentIds = paymentRows.map((row) => row.id);
      const reversalRows = paymentIds.length ? await tx.select({ id: receivablePaymentReversals.id, paymentId: receivablePaymentReversals.paymentId, amount: receivablePaymentReversals.amount, reason: receivablePaymentReversals.reason, createdAt: receivablePaymentReversals.createdAt })
        .from(receivablePaymentReversals).where(and(eq(receivablePaymentReversals.businessId, business.id), inArray(receivablePaymentReversals.paymentId, paymentIds)))
        .orderBy(asc(receivablePaymentReversals.id)).limit(5001) : [];
      if (reversalRows.length > 5000) throw new HttpError(413, "گردش برگشت مطالبات برای snapshot آفلاین بیش از ۵٬۰۰۰ ردیف است؛ دریافت صفحه‌بندی‌شده لازم است");
      const paidById = new Map<number, number>();
      for (const payment of paymentRows) paidById.set(payment.receivableId, (paidById.get(payment.receivableId) ?? 0) + Number(payment.amount));
      const reversedByPayment = new Map<number, number>();
      for (const reversal of reversalRows) reversedByPayment.set(reversal.paymentId, (reversedByPayment.get(reversal.paymentId) ?? 0) + Number(reversal.amount));
      const reversedByReceivable = new Map<number, number>();
      for (const payment of paymentRows) reversedByReceivable.set(payment.receivableId, (reversedByReceivable.get(payment.receivableId) ?? 0) + (reversedByPayment.get(payment.id) ?? 0));
      const now = new Date();
      const receivableRows = rows.map((row) => {
        const received = (paidById.get(row.id) ?? 0) - (reversedByReceivable.get(row.id) ?? 0);
        return {
          ...row, received, balance: outstandingAmount(Number(row.amount), received), status: receivableState(Number(row.amount), received, row.dueAt, now),
          dueAt: row.dueAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
        };
      });
      payload = {
        receivables: receivableRows,
        payments: paymentRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        reversals: reversalRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        totalReceivables: rows.length,
        totalBalance: receivableRows.reduce((sum, row) => sum + row.balance, 0),
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
      const message = dataset === "menu" ? "اطلاعات منو از سقف دریافت آفلاین بیشتر است؛ تصاویر باید از نشانی فایل بارگذاری‌شده باشند" : dataset === "customers" ? "فهرست مشتریان برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "orders" ? "تاریخچه سفارش‌ها برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "reservations" ? "تاریخچه رزروها برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "shifts" ? "برنامهٔ شیفت برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "accounting" ? "اطلاعات حسابداری برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "receivables" ? "اطلاعات مطالبات برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "cash_shifts" ? "اطلاعات شیفت صندوق برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "reports" ? "گزارش فروش برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : "اطلاعات انبار برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است";
      throw new HttpError(413, message);
    }
    const payloadHash = createHash("sha256").update(canonical(payload)).digest("hex");
    const [latest] = await tx.select().from(offlineWorkspaceSnapshots).where(and(eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.dataset, dataset))).orderBy(desc(offlineWorkspaceSnapshots.revision)).limit(1);
    const now = new Date();
    const validUntil = new Date(now.getTime() + SNAPSHOT_TTL_MS);

    if (latest?.payloadHash === payloadHash) {
      const [refreshed] = await tx.update(offlineWorkspaceSnapshots).set({ issuedAt: now, validUntil }).where(and(eq(offlineWorkspaceSnapshots.id, latest.id), eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.businessId, business.id))).returning();
      if (!refreshed) throw new HttpError(409, "تمدید نسخهٔ دادهٔ آفلاین انجام نشد");
      if (dataset === "reservations" || dataset === "shifts") await tx.delete(offlineWorkspaceSnapshots).where(and(eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.dataset, dataset), lt(offlineWorkspaceSnapshots.revision, refreshed.revision)));
      return responseShape(refreshed);
    }

    const [saved] = await tx.insert(offlineWorkspaceSnapshots).values({ id: randomUUID(), terminalId: terminal.id, businessId: business.id, dataset, revision: (latest?.revision ?? 0) + 1, schemaVersion: 1, payloadHash, payload, issuedAt: now, validUntil }).returning();
    if (!saved) throw new HttpError(500, "ذخیرهٔ نسخهٔ دادهٔ آفلاین انجام نشد");
    if (dataset === "reservations" || dataset === "shifts") await tx.delete(offlineWorkspaceSnapshots).where(and(eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.dataset, dataset), lt(offlineWorkspaceSnapshots.revision, saved.revision)));
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

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
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
  if (isRecord(raw) && raw.module === "staff") return syncOfflineStaffRequest(req, parseStaffCommand(raw));
  if (isRecord(raw) && raw.module === "accounting") return syncOfflineAccountingCommand(req, raw);
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

type StaffCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "staff";
  action: "create_shift" | "leave_request" | "shift_change";
  baseDataset: "shifts";
  baseSnapshotId: string;
  baseRevision: number;
  payload: Record<string, unknown>;
};

function parseStaffCommand(raw: unknown): StaffCommand {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.module !== "staff" || !["create_shift", "leave_request", "shift_change"].includes(String(raw.action))) throw new HttpError(400, "قالب درخواست آفلاین کارکنان معتبر نیست");
  const allowedCommandKeys = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(raw).some((key) => !allowedCommandKeys.includes(key))) throw new HttpError(400, "فرمان کارکنان فیلد ناشناخته دارد");
  if (typeof raw.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.id)) throw new HttpError(400, "شناسهٔ درخواست معتبر نیست");
  if (!Number.isSafeInteger(raw.businessId) || Number(raw.businessId) < 1 || raw.baseDataset !== "shifts" || typeof raw.baseSnapshotId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.baseSnapshotId) || !Number.isSafeInteger(raw.baseRevision) || Number(raw.baseRevision) < 1 || !isRecord(raw.payload)) throw new HttpError(400, "شناسه یا نسخهٔ مبنای درخواست کارکنان معتبر نیست");
  const payload = raw.payload;
  if (raw.action === "create_shift") {
    if (Object.keys(payload).some((key) => !["staffId", "startsAt", "endsAt", "location"].includes(key)) || !Number.isSafeInteger(payload.staffId) || Number(payload.staffId) < 1 || !isIsoTimestamp(payload.startsAt) || !isIsoTimestamp(payload.endsAt) || Date.parse(payload.endsAt) <= Date.parse(payload.startsAt) || Date.parse(payload.endsAt) - Date.parse(payload.startsAt) > 24 * 60 * 60_000 || typeof payload.location !== "string" || payload.location.length > 100) throw new HttpError(400, "اطلاعات شیفت جدید معتبر نیست");
  } else if (raw.action === "leave_request") {
    if (Object.keys(payload).some((key) => !["staffId", "startsAt", "endsAt", "kind", "reason"].includes(key)) || !Number.isSafeInteger(payload.staffId) || Number(payload.staffId) < 1 || !isIsoTimestamp(payload.startsAt) || !isIsoTimestamp(payload.endsAt) || Date.parse(payload.endsAt) <= Date.parse(payload.startsAt) || Date.parse(payload.endsAt) - Date.parse(payload.startsAt) > 31 * 86_400_000 || !["personal", "sick", "unpaid"].includes(String(payload.kind)) || typeof payload.reason !== "string" || payload.reason.length > 500) throw new HttpError(400, "اطلاعات درخواست مرخصی معتبر نیست");
  } else if (Object.keys(payload).some((key) => !["scheduleId", "targetStaffId", "reason"].includes(key)) || !Number.isSafeInteger(payload.scheduleId) || Number(payload.scheduleId) < 1 || !Number.isSafeInteger(payload.targetStaffId) || Number(payload.targetStaffId) < 1 || typeof payload.reason !== "string" || payload.reason.length > 300) {
    throw new HttpError(400, "اطلاعات درخواست تعویض شیفت معتبر نیست");
  }
  return raw as unknown as StaffCommand;
}

async function syncOfflineStaffRequest(req: Request, command: StaffCommand) {
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "staff_scheduling")) throw new HttpError(403, "صندوق آفلاین و برنامه‌ریزی کارکنان باید در اشتراک فعال باشند");
  if (command.businessId !== business.id) throw new HttpError(403, "درخواست متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");
  const outcome = await db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    const [currentBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!currentBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");
    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.payloadHash !== payloadHash) return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسهٔ درخواست قبلاً با محتوای دیگری ثبت شده است" } };
      return { httpStatus: previous.httpStatus, response: previous.result };
    }
    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId), eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.businessId, business.id), eq(offlineWorkspaceSnapshots.dataset, "shifts"), eq(offlineWorkspaceSnapshots.revision, command.baseRevision))).for("update");
    const record = async (state: "applied" | "conflict" | "rejected", httpStatus: 200 | 409 | 422, error = "", receipt = "", details: Record<string, unknown> = {}) => {
      const response = { commandId: command.id, state, receipt, ...details, ...(error ? { error } : {}) };
      const ledgerPayload = command.action === "create_shift" ? command : { ...command, payload: { ...command.payload, reason: "" } };
      await tx.insert(offlineWorkspaceCommands).values({ id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy, module: "staff", action: command.action, payloadHash, payload: ledgerPayload as unknown as Record<string, unknown>, state, httpStatus, error, receipt, result: response });
      return { httpStatus, response };
    };
    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "نسخهٔ برنامهٔ کارکنان پیدا نشد یا اعتبارش پایان یافته است؛ ابتدا نسخهٔ تازه را دریافت کنید");
    const snapshotStaff = (snapshot.payload.staff as Record<string, unknown>[] | undefined) ?? [];
    if (command.action === "create_shift") {
      const staffId = Number(command.payload.staffId);
      const startsAt = new Date(String(command.payload.startsAt)), endsAt = new Date(String(command.payload.endsAt));
      if (!snapshotStaff.some((row) => row.id === staffId)) return record("conflict", 409, "کارمند در نسخهٔ مبنای برنامه حضور ندارد");
      const range = snapshot.payload.range as Record<string, unknown> | undefined;
      const from = new Date(String(range?.from ?? "")), to = new Date(String(range?.to ?? ""));
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || startsAt < from || endsAt > to) return record("conflict", 409, "زمان شیفت بیرون از محدودهٔ نسخهٔ ذخیره‌شده است؛ برنامه را به‌روز کنید");
      const [member] = await tx.select({ id: staff.id, isActive: staff.isActive }).from(staff)
        .where(and(eq(staff.id, staffId), eq(staff.businessId, business.id))).for("update");
      if (!member?.isActive) return record("conflict", 409, "کارمند حذف یا غیرفعال شده است");
      const [overlap] = await tx.select({ id: staffSchedules.id }).from(staffSchedules).where(and(
        eq(staffSchedules.businessId, business.id), eq(staffSchedules.staffId, staffId), eq(staffSchedules.status, "scheduled"),
        lt(staffSchedules.startsAt, endsAt), gt(staffSchedules.endsAt, startsAt),
      )).limit(1);
      if (overlap) return record("conflict", 409, "کارمند در این بازه شیفت دیگری دارد");
      const [leave] = await tx.select({ id: staffLeaveRequests.id }).from(staffLeaveRequests).where(and(
        eq(staffLeaveRequests.businessId, business.id), eq(staffLeaveRequests.staffId, staffId), eq(staffLeaveRequests.status, "approved"),
        lt(staffLeaveRequests.startsAt, endsAt), gt(staffLeaveRequests.endsAt, startsAt),
      )).limit(1);
      if (leave) return record("conflict", 409, "برای این بازه مرخصی تأییدشده ثبت شده است");
      const [created] = await tx.insert(staffSchedules).values({
        businessId: business.id, staffId, startsAt, endsAt, location: String(command.payload.location).trim().slice(0, 100),
        createdBy: terminal.createdBy, updatedBy: terminal.createdBy,
      }).returning({ id: staffSchedules.id });
      return record("applied", 200, "", randomUUID(), { scheduleId: created.id });
    }
    if (command.action === "leave_request") {
      const staffId = Number(command.payload.staffId);
      if (!snapshotStaff.some((row) => row.id === staffId)) return record("conflict", 409, "کارمند در نسخهٔ مبنای این درخواست حضور ندارد");
      const [member] = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.id, staffId), eq(staff.businessId, business.id), eq(staff.isActive, true))).for("update");
      if (!member) return record("conflict", 409, "کارمند حذف یا غیرفعال شده است");
      const startsAt = new Date(String(command.payload.startsAt)), endsAt = new Date(String(command.payload.endsAt));
      const from = new Date(String((snapshot.payload.range as Record<string, unknown>).from)), to = new Date(String((snapshot.payload.range as Record<string, unknown>).to));
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || startsAt < from || endsAt > to) return record("conflict", 409, "بازهٔ مرخصی بیرون از محدودهٔ نسخهٔ ذخیره‌شده است؛ برنامه را به‌روز کنید");
      const [created] = await tx.insert(staffLeaveRequests).values({ businessId: business.id, staffId, startsAt, endsAt, kind: String(command.payload.kind), reason: String(command.payload.reason).trim() }).returning({ id: staffLeaveRequests.id });
      return record("applied", 200, "", randomUUID(), { requestId: created.id });
    }
    const scheduleId = Number(command.payload.scheduleId), targetStaffId = Number(command.payload.targetStaffId);
    const snapshotSchedules = (snapshot.payload.schedules as Record<string, unknown>[] | undefined) ?? [];
    const baseShift = snapshotSchedules.find((row) => row.id === scheduleId);
    if (!baseShift || baseShift.status !== "scheduled") return record("conflict", 409, "شیفت در نسخهٔ مبنا پیدا نشد یا برنامه‌ریزی‌شده نیست");
    const [shift] = await tx.select().from(staffSchedules).where(and(eq(staffSchedules.id, scheduleId), eq(staffSchedules.businessId, business.id))).for("update");
    if (!shift || shift.status !== "scheduled" || shift.version !== baseShift.version || shift.staffId !== baseShift.staffId || shift.startsAt.toISOString() !== baseShift.startsAt) return record("conflict", 409, "شیفت از زمان دریافت نسخه تغییر کرده است؛ برنامه را تازه کنید");
    if (shift.startsAt <= new Date()) return record("rejected", 422, "برای شیفت شروع‌شده یا گذشته درخواست تعویض ثبت نمی‌شود");
    if (shift.staffId === targetStaffId || !snapshotStaff.some((row) => row.id === targetStaffId)) return record("rejected", 422, "کارمند مقصد در نسخهٔ کارکنان پیدا نشد یا با صاحب فعلی شیفت یکسان است");
    const lockedStaff = await tx.select({ id: staff.id, isActive: staff.isActive }).from(staff).where(and(eq(staff.businessId, business.id), inArray(staff.id, [shift.staffId, targetStaffId]))).orderBy(asc(staff.id)).for("update");
    if (lockedStaff.length !== 2 || lockedStaff.some((row) => !row.isActive)) return record("conflict", 409, "یکی از کارکنان حذف یا غیرفعال شده است");
    const [pending] = await tx.select({ id: staffShiftSwapRequests.id }).from(staffShiftSwapRequests).where(and(eq(staffShiftSwapRequests.businessId, business.id), eq(staffShiftSwapRequests.scheduleId, scheduleId), inArray(staffShiftSwapRequests.status, ["pending_target", "pending_manager"]))).limit(1);
    if (pending) return record("conflict", 409, "برای این شیفت درخواست تعویض دیگری در حال بررسی است");
    const [created] = await tx.insert(staffShiftSwapRequests).values({ businessId: business.id, scheduleId, fromStaffId: shift.staffId, toStaffId: targetStaffId, requestedBy: terminal.createdBy, reason: String(command.payload.reason).trim() }).returning({ id: staffShiftSwapRequests.id });
    return record("applied", 200, "", randomUUID(), { requestId: created.id });
  }, { isolationLevel: "repeatable read" });
  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, typeof outcome.response.error === "string" ? outcome.response.error : "درخواست کارکنان اعمال نشد");
  return outcome.response;
}
