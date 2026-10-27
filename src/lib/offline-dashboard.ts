import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accAccounts, accDocuments, accFiscalYears, accLines, bankAccounts, businesses, cashShifts, categories, chequeBeneficiaries, chequeEvents, cheques, customerRewardCampaigns, customerRewardClaims, customers, devices, diningTables, inventoryCategories, inventoryItems, offlineStaffAttendanceRequests, offlineTerminals, offlineWorkspaceCommands, offlineWorkspaceSnapshots, orderItems, orderStatusEvents, orders, pagers, payrollItems, payrollRuns, payrollSettlements, products, recipes, receivableAccounts, receivablePaymentReversals, receivablePayments, receivables, reservations, staff, staffAttendanceRecords, staffLeaveRequests, staffSchedules, staffShiftSwapRequests, stockMovements, stockTransferLines, stockTransfers, suppliers, transactions, users, warehouses } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { hasAny } from "@/lib/plans";
import { offlineAuth } from "@/lib/offline-pos";
import * as Accounting from "@/lib/accounting";
import { syncOfflineAccountingCommand } from "@/lib/offline-accounting";
import { syncOfflineChequeCommand } from "@/lib/offline-cheques";
import { syncOfflineTableStatusCommand } from "@/lib/offline-tables";
import { outstandingAmount, receivableState } from "@/lib/receivables-core";
import { cashShiftTotals, cashShiftTotalsByShift } from "@/lib/cash-shifts";
import { startOfDayTehran } from "@/lib/jalali";
import { CHEQUE_PURPOSES, IRANIAN_BANKS } from "@/lib/cheque-metadata";
import { normalizeProductOptionGroups } from "@/lib/product-options";
import { parseOfflineCustomerCommand, type OfflineCustomerCommand } from "@/lib/offline-customer-core";
import { projectOfflinePayslipLines, projectOfflinePayslipStaff } from "@/lib/offline-payroll-core";
import { nextOfflineOrderStatus, parseOfflineOrderStatusCommand, type OfflineOrderCommand } from "@/lib/offline-order-status-core";
import { queuePrintJobs, recordOrderEvents, settingsOf } from "@/lib/orders";

const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SNAPSHOT_BYTES = 4_000_000;

type MenuPayload = {
  business: { id: number; name: string; slug: string; type: string; logoUrl: string; accentColor: string; taxPercent: number; servicePercent: number };
  categories: { id: number; parentCategoryId: number | null; name: string; description: string; emoji: string; imageUrl: string; sortOrder: number; isActive: boolean }[];
  products: { id: number; categoryId: number | null; name: string; description: string; videoUrl: string; price: number; sellingMode: string; yieldRatio: number; oldPrice: number | null; emoji: string; imageUrl: string; prepMinutes: number; isAvailable: boolean; isFeatured: boolean; modifierGroups: unknown; dietaryTags: string[]; allergenTags: string[]; recipes: { itemId: number; quantity: number; wastePercent: number }[] }[];
  recipeItems?: { id: number; name: string; unit: string; recipeUnit: string; recipeToStockFactor: number; isActive: boolean; trackStock: boolean }[];
  tables: { id: number; name: string; zone: string; capacity: number; operationalStatus: string }[];
};
type CustomerPayload = {
  customers: { id: number; name: string; phone: string; points: number; walletBalance: number; lastOrderAt: string | null; totalSpent: number; ordersCount: number; createdAt: string }[];
  totalCustomers: number;
};
type InventoryPayload = {
  items: { id: number; warehouseId: number | null; categoryId: number | null; name: string; sku: string | null; unit: string; recipeUnit: string; recipeToStockFactor: number; stock: number; minStock: number; reorderPoint: number; trackStock: boolean; isActive: boolean; expiryDate: string | null; costPerUnit: number; lastPurchaseCost: number }[];
  warehouses: { id: number; name: string; location: string }[];
  categories: { id: number; name: string }[];
  suppliers: {
    id: number; name: string; contactPerson: string; phone: string; address: string;
    taxId: string; bankInfo: string; note: string; isActive: boolean; hasPayableAccount: boolean;
  }[];
  movements: { id: number; itemId: number; type: string; delta: number; balanceAfter: number; unitCost: number; invoiceNo: string; amount: number; createdAt: string }[];
  transfers: { id: number; status: string; note: string; createdAt: string; decidedAt: string | null; lines: { id: number; transferId: number; sourceItemId: number; destinationItemId: number; quantity: number; unitCost: number; source: { id: number; name: string; unit: string; warehouseId: number | null } | null; destination: { id: number; name: string; unit: string; warehouseId: number | null } | null }[] }[];
  totalItems: number;
};
type OrdersPayload = {
  workflowPreset: 1 | 2 | 3 | 4;
  orders: {
    id: number; number: number; tableId: number | null; tableName: string | null; customerName: string; customerPhone: string;
    type: string; source: string; status: string; note: string; address: string; deliveryFee: number; discountCode: string;
    discountAmount: number; membershipDiscount: number; cashbackUsed: number; scheduledFor: string | null; deliveryStatus: string;
    subtotal: number; tax: number; service: number; total: number;
    paymentMethod: string | null; paymentStatus: string; paymentBreakdown: unknown; createdAt: string; updatedAt: string; cashierConfirmedAt: string | null;
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
type BankPayload = {
  days: 30; total: number;
  accounts: { id: number | null; name: string; bank: string; accountNumber: string; opening: number; income: number; expense: number; balance: number }[];
  recent: { id: number; kind: string; category: string; amount: number; description: string; date: string; accountId: number | null; accountName: string }[];
};
type OfflineProfitLossPayload = {
  revenue: number; discounts: number; tax: number; cogs: number; grossProfit: number; expenses: number;
  otherIncome: number; net: number; cogsCoverage: number;
  expenseBreakdown: { name: string; amount: number }[];
  series: { date: string; revenue: number; cogs: number; expenses: number }[];
  basis: "recorded_order_cogs";
};
type SalesReportsPayload = {
  salesAvailable: boolean;
  from: string; to: string;
  totals: { revenue: number; orders: number; average: number; discounts: number; tax: number; cogs: number; grossProfit: number; soldItems: number };
  series: { date: string; revenue: number; orders: number }[];
  byProduct: { name: string; quantity: number; revenue: number }[];
  statuses: { status: string; paymentStatus: string; orders: number; amount: number }[];
  profitLoss: OfflineProfitLossPayload | null;
};
type ChequesPayload = {
  cheques: {
    id: number; beneficiaryId: number | null; direction: string; status: string; partnerName: string; amount: number;
    issueDate: string; dueDate: string; chequeNumber: string; serialNumber: string; bank: string; branch: string;
    expensePurpose: string; sayadIdentifier: string; note: string; accountingAccountId: number | null;
    accountingDocumentId: number | null; createdAt: string; updatedAt: string;
  }[];
  beneficiaries: { id: number; fullName: string; nationalId: string; phone: string }[];
  events: { id: number; chequeId: number; requestKey: string; fromStatus: string | null; toStatus: string; note: string; accountingAccountId: number | null; reversalDocumentId: number | null; accountingDocumentId: number | null; createdAt: string }[];
  accounts: { id: number; code: string; name: string; level: string; isActive: boolean }[];
  banks: string[];
  purposes: string[];
  totalCheques: number;
};
type PayrollPayload = {
  businessName: string;
  runs: {
    id: number; jalaliYear: number; jalaliMonth: number; status: string; salaryDocumentId: number | null;
    createdAt: string; approvedAt: string | null;
    totals: { gross: number; employeeInsurance: number; employerInsurance: number; tax: number; penalty: number; net: number };
    items: {
      id: number; staffId: number; staffSnapshot: Record<string, unknown>; workMinutes: number; overtimeMinutes: number;
      fridayMinutes: number; holidayMinutes: number; nightMinutes: number; leaveMinutes: number; unpaidLeaveMinutes: number;
      shortMinutes: number; earnings: { key: string; label: string; amountToman: number; taxable: boolean; insurable: boolean }[];
      deductions: { key: string; label: string; amountToman: number; accounting: boolean }[]; grossToman: number;
      employeeInsuranceToman: number; employerInsuranceToman: number; incomeTaxToman: number; penaltyToman: number; netToman: number;
    }[];
    settlements: { kind: string; amountToman: number; paidAt: string }[];
  }[];
  totalRuns: number;
  totalItems: number;
};

type OrderHistoryCursor = { createdAt: string; id: number };
type OrderHistoryChangeCursor = { updatedAt: string; id: number };
const ORDER_HISTORY_PAGE_SIZE = 50;
const ORDER_HISTORY_CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function encodeOrderHistoryCursor(cursor: OrderHistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function parseOrderHistoryChangeCursor(value: string | null): OrderHistoryChangeCursor | null {
  if (value === null) return null;
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new HttpError(400, "نشانگر تغییرات سفارش معتبر نیست");
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (Object.keys(decoded).length !== 2 || typeof decoded.updatedAt !== "string" || !ORDER_HISTORY_CURSOR_TIME.test(decoded.updatedAt) || !Number.isSafeInteger(decoded.id) || Number(decoded.id) < 1 || !Number.isFinite(Date.parse(decoded.updatedAt))) throw new Error("invalid cursor");
    return { updatedAt: decoded.updatedAt, id: Number(decoded.id) };
  } catch {
    throw new HttpError(400, "نشانگر تغییرات سفارش معتبر نیست");
  }
}

function encodeOrderHistoryChangeCursor(cursor: OrderHistoryChangeCursor): string {
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
      updatedAt: sql<string>`to_char(${orders.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      createdAtCursor: sql<string>`to_char(${orders.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    }).from(orders).leftJoin(diningTables, and(eq(diningTables.id, orders.tableId), eq(diningTables.businessId, business.id)))
      .where(and(eq(orders.businessId, business.id), isNull(orders.deletedAt), cursorPredicate))
      .orderBy(desc(orders.createdAt), desc(orders.id)).limit(ORDER_HISTORY_PAGE_SIZE + 1);
    const hasMore = orderRows.length > ORDER_HISTORY_PAGE_SIZE;
    const pageRows = hasMore ? orderRows.slice(0, ORDER_HISTORY_PAGE_SIZE) : orderRows;
    const cashierConfirmations = pageRows.length ? await tx.select({ orderId: orderStatusEvents.orderId, createdAt: orderStatusEvents.createdAt })
      .from(orderStatusEvents).where(and(eq(orderStatusEvents.businessId, business.id), eq(orderStatusEvents.kind, "cashier_confirmation"), inArray(orderStatusEvents.orderId, pageRows.map((row) => row.id)))) : [];
    const cashierConfirmationByOrder = new Map(cashierConfirmations.map((row) => [row.orderId, row.createdAt.toISOString()]));
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
      cashierConfirmedAt: cashierConfirmationByOrder.get(order.id) ?? null,
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

export async function offlineOrderHistoryChangesPage(req: Request) {
  const url = new URL(req.url);
  const sinceValue = url.searchParams.get("since");
  const cursorValue = url.searchParams.get("cursor");
  const cursor = parseOrderHistoryChangeCursor(cursorValue);
  if (!sinceValue || !ORDER_HISTORY_CURSOR_TIME.test(sinceValue) || !Number.isFinite(Date.parse(sinceValue))) throw new HttpError(400, "زمان شروع دریافت تغییرات سفارش معتبر نیست");
  if (cursor && cursor.updatedAt < sinceValue) throw new HttpError(400, "نشانگر تغییرات سفارش پیش از نقطهٔ شروع صفحه قرار دارد");
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos")) throw new HttpError(403, "دریافت تغییرات تاریخچهٔ سفارش به مجوز صندوق آفلاین نیاز دارد");
  return db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");
    const sinceTimestamp = sql`${sinceValue}::timestamptz`;
    const cursorTimestamp = cursor ? sql`${cursor.updatedAt}::timestamptz` : undefined;
    const cursorPredicate = cursor && cursorTimestamp ? or(
      gt(orders.updatedAt, cursorTimestamp),
      and(eq(orders.updatedAt, cursorTimestamp), gt(orders.id, cursor.id)),
    ) : undefined;
    const pageRows = await tx.select({
      id: orders.id, number: orders.number, tableId: orders.tableId, tableName: diningTables.name,
      customerName: orders.customerName, customerPhone: orders.customerPhone, type: orders.type, source: orders.source,
      status: orders.status, note: orders.note, address: orders.address, deliveryFee: orders.deliveryFee,
      discountCode: orders.discountCode, discountAmount: orders.discountAmount, membershipDiscount: orders.membershipDiscount,
      cashbackUsed: orders.cashbackUsed, scheduledFor: orders.scheduledFor, deliveryStatus: orders.deliveryStatus,
      subtotal: orders.subtotal, tax: orders.tax, service: orders.service, total: orders.total,
      paymentMethod: orders.paymentMethod, paymentStatus: orders.paymentStatus, paymentBreakdown: orders.paymentBreakdown,
      createdAt: orders.createdAt,
      deletedAt: orders.deletedAt,
      updatedAt: sql<string>`to_char(${orders.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      updatedAtCursor: sql<string>`to_char(${orders.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    }).from(orders).leftJoin(diningTables, and(eq(diningTables.id, orders.tableId), eq(diningTables.businessId, business.id)))
      .where(and(eq(orders.businessId, business.id), gte(orders.updatedAt, sinceTimestamp), cursorPredicate))
      .orderBy(asc(orders.updatedAt), asc(orders.id)).limit(ORDER_HISTORY_PAGE_SIZE + 1);
    const hasMore = pageRows.length > ORDER_HISTORY_PAGE_SIZE;
    const rows = hasMore ? pageRows.slice(0, ORDER_HISTORY_PAGE_SIZE) : pageRows;
    const activeRows = rows.filter((row) => row.deletedAt === null);
    const cashierConfirmations = activeRows.length ? await tx.select({ orderId: orderStatusEvents.orderId, createdAt: orderStatusEvents.createdAt })
      .from(orderStatusEvents).where(and(eq(orderStatusEvents.businessId, business.id), eq(orderStatusEvents.kind, "cashier_confirmation"), inArray(orderStatusEvents.orderId, activeRows.map((row) => row.id)))) : [];
    const cashierConfirmationByOrder = new Map(cashierConfirmations.map((row) => [row.orderId, row.createdAt.toISOString()]));
    const itemRows = activeRows.length ? await tx.select({
      id: orderItems.id, orderId: orderItems.orderId, productId: orderItems.productId, name: orderItems.name,
      price: orderItems.price, quantity: orderItems.quantity, weightGrams: orderItems.weightGrams,
      tareGrams: orderItems.tareGrams, lineTotal: orderItems.lineTotal, note: orderItems.note,
      optionSnapshot: orderItems.optionSnapshot,
    }).from(orderItems).where(inArray(orderItems.orderId, activeRows.map((row) => row.id))).orderBy(asc(orderItems.id)) : [];
    const itemsByOrder = new Map<number, typeof itemRows>();
    for (const item of itemRows) itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);
    const ordersPage = rows.map((row) => {
      if (row.deletedAt) return { id: row.id, number: row.number, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt, deleted: true, updatedAtCursor: row.updatedAtCursor };
      const { updatedAtCursor: _updatedAtCursor, ...order } = row;
      return {
        ...order,
        deleted: false,
        deletedAt: undefined,
        createdAt: order.createdAt.toISOString(),
        scheduledFor: order.scheduledFor?.toISOString() ?? null,
        cashierConfirmedAt: cashierConfirmationByOrder.get(order.id) ?? null,
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
      };
    });
    if (Buffer.byteLength(JSON.stringify(ordersPage), "utf8") > MAX_SNAPSHOT_BYTES) throw new HttpError(413, "صفحهٔ تغییرات سفارش از سقف دریافت آفلاین بیشتر است");
    const last = rows.at(-1);
    return {
      schemaVersion: 1,
      dataset: "orders-history-changes",
      businessId: business.id,
      requestSince: sinceValue,
      requestCursor: cursorValue,
      nextCursor: hasMore && last ? encodeOrderHistoryChangeCursor({ updatedAt: last.updatedAtCursor, id: last.id }) : null,
      hasMore,
      issuedAt: new Date().toISOString(),
      orders: ordersPage,
    };
  }, { isolationLevel: "repeatable read" });
}

type ReservationHistoryCursor = { createdAt: string; id: number };
const RESERVATION_HISTORY_PAGE_SIZE = 50;

function parseReservationHistoryCursor(value: string | null): ReservationHistoryCursor | null {
  if (value === null) return null;
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new HttpError(400, "نشانگر صفحهٔ تاریخچهٔ رزرو معتبر نیست");
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (Object.keys(decoded).length !== 2 || typeof decoded.createdAt !== "string" || !ORDER_HISTORY_CURSOR_TIME.test(decoded.createdAt) || !Number.isSafeInteger(decoded.id) || Number(decoded.id) < 1 || !Number.isFinite(Date.parse(decoded.createdAt))) throw new Error("invalid cursor");
    return { createdAt: decoded.createdAt, id: Number(decoded.id) };
  } catch {
    throw new HttpError(400, "نشانگر صفحهٔ تاریخچهٔ رزرو معتبر نیست");
  }
}

function encodeReservationHistoryCursor(cursor: ReservationHistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export async function offlineReservationHistoryPage(req: Request) {
  const url = new URL(req.url);
  const cursorValue = url.searchParams.get("cursor");
  const cursor = parseReservationHistoryCursor(cursorValue);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "reservations")) throw new HttpError(403, "دریافت تاریخچهٔ رزرو به مجوز صندوق آفلاین و رزرو میز نیاز دارد");
  return db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");
    const cursorTimestamp = cursor ? sql`${cursor.createdAt}::timestamptz` : undefined;
    const cursorPredicate = cursor && cursorTimestamp ? or(
      lt(reservations.createdAt, cursorTimestamp),
      and(eq(reservations.createdAt, cursorTimestamp), lt(reservations.id, cursor.id)),
    ) : undefined;
    const rows = await tx.select({
      id: reservations.id, tableId: reservations.tableId, tableName: diningTables.name,
      customerName: reservations.customerName, customerPhone: reservations.customerPhone,
      guestCount: reservations.guestCount, reservationType: reservations.reservationType,
      startsAt: reservations.startsAt, durationMinutes: reservations.durationMinutes, status: reservations.status,
      depositAmount: reservations.depositAmount, depositStatus: reservations.depositStatus,
      depositMethod: reservations.depositMethod, note: reservations.note,
      createdAt: reservations.createdAt,
      createdAtCursor: sql<string>`to_char(${reservations.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      updatedAt: reservations.updatedAt,
    }).from(reservations).leftJoin(diningTables, and(eq(diningTables.id, reservations.tableId), eq(diningTables.businessId, business.id)))
      .where(and(eq(reservations.businessId, business.id), cursorPredicate))
      .orderBy(desc(reservations.createdAt), desc(reservations.id)).limit(RESERVATION_HISTORY_PAGE_SIZE + 1);
    const hasMore = rows.length > RESERVATION_HISTORY_PAGE_SIZE;
    const pageRows = hasMore ? rows.slice(0, RESERVATION_HISTORY_PAGE_SIZE) : rows;
    const page = pageRows.map(({ createdAtCursor, ...row }) => ({
      ...row,
      startsAt: row.startsAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      cursorCreatedAt: createdAtCursor,
    }));
    if (Buffer.byteLength(JSON.stringify(page), "utf8") > MAX_SNAPSHOT_BYTES) throw new HttpError(413, "صفحهٔ رزروها از سقف دریافت آفلاین بیشتر است");
    const last = pageRows.at(-1);
    return {
      schemaVersion: 1,
      dataset: "reservations-history",
      businessId: business.id,
      requestCursor: cursorValue,
      nextCursor: hasMore && last ? encodeReservationHistoryCursor({ createdAt: last.createdAtCursor, id: last.id }) : null,
      hasMore,
      issuedAt: new Date().toISOString(),
      reservations: page.map(({ cursorCreatedAt: _cursorCreatedAt, ...row }) => row),
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
  if (dataset !== "menu" && dataset !== "customers" && dataset !== "inventory" && dataset !== "orders" && dataset !== "reservations" && dataset !== "shifts" && dataset !== "accounting" && dataset !== "receivables" && dataset !== "cash_shifts" && dataset !== "reports" && dataset !== "cheques" && dataset !== "payroll" && dataset !== "bank") throw new HttpError(404, "این مجموعهٔ داده برای دریافت آفلاین تعریف نشده است");
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
  if (dataset === "reports" && (!hasAny(features, "cashier_pos") || (!hasAny(features, "sales_reports") && !hasAny(features, "profit_loss")))) throw new HttpError(403, "گزارش آفلاین به مجوز صندوق و دست‌کم یکی از گزارش فروش یا سود و زیان نیاز دارد");
  if (dataset === "cheques" && (!hasAny(features, "cashier_pos") || !hasAny(features, "cheque_register") || !hasAny(features, "accounting"))) throw new HttpError(403, "دریافت دفتر چک آفلاین به مجوز صندوق، دفتر چک و حسابداری نیاز دارد");
  if (dataset === "payroll" && (!hasAny(features, "cashier_pos") || !hasAny(features, "payroll"))) throw new HttpError(403, "دریافت اطلاعات حقوق به مجوز صندوق آفلاین و حقوق و دستمزد نیاز دارد");
  if (dataset === "bank" && (!hasAny(features, "cashier_pos") || !hasAny(features, "bank_report"))) throw new HttpError(403, "دریافت گزارش بانک آفلاین به مجوز صندوق و گزارش بانک نیاز دارد");
  if (dataset === "accounting") await Accounting.ensureAccounting(business);
  if (dataset === "cheques") await Accounting.ensureChequeAccountingAccounts(business);

  return db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) {
      throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    }
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    let payload: MenuPayload | CustomerPayload | InventoryPayload | OrdersPayload | ReservationsPayload | ShiftsPayload | AccountingPayload | ReceivablesPayload | CashShiftsPayload | BankPayload | SalesReportsPayload | ChequesPayload | PayrollPayload;
    if (dataset === "menu") {
      const [currentBusiness] = await tx.select({ id: businesses.id, name: businesses.name, slug: businesses.slug, type: businesses.type, logoUrl: businesses.logoUrl, accentColor: businesses.accentColor, taxPercent: businesses.taxPercent, servicePercent: businesses.servicePercent }).from(businesses).where(eq(businesses.id, business.id));
      if (!currentBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");
      const categoryRows = await tx.select({ id: categories.id, parentCategoryId: categories.parentCategoryId, name: categories.name, description: categories.description, emoji: categories.emoji, imageUrl: categories.imageUrl, sortOrder: categories.sortOrder, isActive: categories.isActive }).from(categories).where(eq(categories.businessId, business.id)).orderBy(asc(categories.sortOrder), asc(categories.id));
      const productRows = await tx.select({ id: products.id, categoryId: products.categoryId, name: products.name, description: products.description, videoUrl: products.videoUrl, price: products.price, sellingMode: products.sellingMode, yieldRatio: products.yieldRatio, oldPrice: products.oldPrice, emoji: products.emoji, imageUrl: products.imageUrl, prepMinutes: products.prepMinutes, isAvailable: products.isAvailable, isFeatured: products.isFeatured, modifierGroups: products.modifierGroups, dietaryTags: products.dietaryTags, allergenTags: products.allergenTags }).from(products).where(eq(products.businessId, business.id)).orderBy(asc(products.id));
      const canManageRecipes = hasAny(features, "recipes");
      const [recipeRows, recipeItemRows] = canManageRecipes ? await Promise.all([
        tx.select({ productId: recipes.productId, itemId: recipes.itemId, quantity: recipes.quantity, wastePercent: recipes.wastePercent })
          .from(recipes).where(eq(recipes.businessId, business.id)).orderBy(asc(recipes.productId), asc(recipes.itemId)).limit(200_001),
        tx.select({ id: inventoryItems.id, name: inventoryItems.name, unit: inventoryItems.unit, recipeUnit: inventoryItems.recipeUnit, recipeToStockFactor: inventoryItems.recipeToStockFactor, isActive: inventoryItems.isActive, trackStock: inventoryItems.trackStock })
          .from(inventoryItems).where(eq(inventoryItems.businessId, business.id)).orderBy(asc(inventoryItems.name), asc(inventoryItems.id)).limit(10_001),
      ]) : [[], []];
      if (canManageRecipes && recipeRows.length > 200_000) throw new HttpError(413, "دستورهای تهیه برای snapshot آفلاین از سقف مجاز بیشتر است");
      if (canManageRecipes && recipeItemRows.length > 10_000) throw new HttpError(413, "فهرست مواد اولیه برای snapshot دستور تهیه از سقف ۱۰٬۰۰۰ قلم بیشتر است");
      const recipeCounts = new Map<number, number>();
      const recipesByProduct = new Map<number, { itemId: number; quantity: number; wastePercent: number }[]>();
      for (const row of recipeRows) {
        const count = (recipeCounts.get(row.productId) ?? 0) + 1;
        if (count > 200) throw new HttpError(413, "دستور تهیهٔ یک محصول بیش از ۲۰۰ ماده دارد و برای دریافت آفلاین باید کوچک‌تر شود");
        recipeCounts.set(row.productId, count);
        const productRecipes = recipesByProduct.get(row.productId) ?? [];
        productRecipes.push({ itemId: row.itemId, quantity: row.quantity, wastePercent: row.wastePercent });
        recipesByProduct.set(row.productId, productRecipes);
      }
      const tableRows = await tx.select({ id: diningTables.id, name: diningTables.name, zone: diningTables.zone, capacity: diningTables.capacity, operationalStatus: diningTables.operationalStatus }).from(diningTables).where(eq(diningTables.businessId, business.id)).orderBy(asc(diningTables.id));
      payload = {
        business: currentBusiness, categories: categoryRows,
        products: productRows.map((product) => ({ ...product, recipes: recipesByProduct.get(product.id) ?? [] })),
        ...(canManageRecipes ? { recipeItems: recipeItemRows } : {}), tables: tableRows,
      };
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
      const categoryRows = await tx.select({ id: inventoryCategories.id, name: inventoryCategories.name })
        .from(inventoryCategories).where(eq(inventoryCategories.businessId, business.id)).orderBy(asc(inventoryCategories.name), asc(inventoryCategories.id)).limit(1001);
      if (categoryRows.length > 1000) throw new HttpError(413, "فهرست دسته‌بندی‌های انبار برای snapshot بیش از سقف ۱٬۰۰۰ دسته است");
      const supplierRows = await tx.select({
        id: suppliers.id, name: suppliers.name, contactPerson: suppliers.contactPerson, phone: suppliers.phone,
        address: suppliers.address, taxId: suppliers.taxId, bankInfo: suppliers.bankInfo, note: suppliers.note,
        isActive: suppliers.isActive, hasPayableAccount: sql<boolean>`${suppliers.accountId} is not null`,
      })
        .from(suppliers).where(eq(suppliers.businessId, business.id)).orderBy(asc(suppliers.name), asc(suppliers.id)).limit(1001);
      if (supplierRows.length > 1000) throw new HttpError(413, "فهرست فروشندگان برای snapshot انبار بیش از سقف ۱٬۰۰۰ نفر است");
      const movementRows = await tx.select({
        id: stockMovements.id, itemId: stockMovements.itemId, type: stockMovements.type, delta: stockMovements.delta,
        balanceAfter: stockMovements.balanceAfter, unitCost: stockMovements.unitCost, invoiceNo: stockMovements.invoiceNo,
        amount: stockMovements.amount, createdAt: stockMovements.createdAt,
      }).from(stockMovements).where(eq(stockMovements.businessId, business.id))
        .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id)).limit(300);
      const transferRows = await tx.select({ id: stockTransfers.id, status: stockTransfers.status, note: stockTransfers.note, createdAt: stockTransfers.createdAt, decidedAt: stockTransfers.decidedAt })
        .from(stockTransfers).where(eq(stockTransfers.businessId, business.id)).orderBy(desc(stockTransfers.createdAt), desc(stockTransfers.id)).limit(100);
      const transferLineRows = transferRows.length
        ? await tx.select().from(stockTransferLines).where(inArray(stockTransferLines.transferId, transferRows.map((row) => row.id))).orderBy(asc(stockTransferLines.id))
        : [];
      const itemById = new Map(itemRows.map((item) => [item.id, item]));
      payload = {
        items: itemRows,
        warehouses: warehouseRows,
        categories: categoryRows,
        suppliers: supplierRows,
        movements: movementRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        transfers: transferRows.map((transfer) => ({
          ...transfer,
          createdAt: transfer.createdAt.toISOString(),
          decidedAt: transfer.decidedAt?.toISOString() ?? null,
          lines: transferLineRows.filter((line) => line.transferId === transfer.id).map((line) => ({
            ...line,
            source: itemById.get(line.sourceItemId) ? { id: line.sourceItemId, name: itemById.get(line.sourceItemId)!.name, unit: itemById.get(line.sourceItemId)!.unit, warehouseId: itemById.get(line.sourceItemId)!.warehouseId } : null,
            destination: itemById.get(line.destinationItemId) ? { id: line.destinationItemId, name: itemById.get(line.destinationItemId)!.name, unit: itemById.get(line.destinationItemId)!.unit, warehouseId: itemById.get(line.destinationItemId)!.warehouseId } : null,
          })),
        })),
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
        tx.select({ id: staffShiftSwapRequests.id, scheduleId: staffShiftSwapRequests.scheduleId, fromStaffId: staffShiftSwapRequests.fromStaffId, toStaffId: staffShiftSwapRequests.toStaffId, status: staffShiftSwapRequests.status, reason: staffShiftSwapRequests.reason, decisionNote: staffShiftSwapRequests.decisionNote, startsAt: staffSchedules.startsAt, endsAt: staffSchedules.endsAt, scheduleStatus: staffSchedules.status, scheduleStaffId: staffSchedules.staffId, scheduleVersion: staffSchedules.version, scheduleUpdatedAt: staffSchedules.updatedAt, createdAt: staffShiftSwapRequests.createdAt })
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
        shiftSwapRequests: shiftSwapRows.map((row) => ({ ...row, fromStaffName: staffNameById.get(row.fromStaffId) ?? `کارمند ${row.fromStaffId}`, toStaffName: staffNameById.get(row.toStaffId) ?? `کارمند ${row.toStaffId}`, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), scheduleUpdatedAt: row.scheduleUpdatedAt.toISOString(), createdAt: row.createdAt.toISOString() })),
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
    } else if (dataset === "bank") {
      const from = new Date(Date.now() - 30 * 86_400_000);
      const [accountRows, aggregateRows, recentRows] = await Promise.all([
        tx.select({ id: bankAccounts.id, name: bankAccounts.name, bank: bankAccounts.bank, accountNumber: bankAccounts.accountNumber, openingBalance: bankAccounts.openingBalance })
          .from(bankAccounts).where(eq(bankAccounts.businessId, business.id)).orderBy(asc(bankAccounts.id)).limit(1_001),
        tx.select({ id: transactions.bankAccountId, kind: transactions.kind, total: sql<number>`coalesce(sum(${transactions.amount}), 0)::float8`, rangeTotal: sql<number>`coalesce(sum(case when ${transactions.date} >= ${from} then ${transactions.amount} else 0 end), 0)::float8` })
          .from(transactions).where(eq(transactions.businessId, business.id)).groupBy(transactions.bankAccountId, transactions.kind),
        tx.select({ id: transactions.id, kind: transactions.kind, category: sql<string>`left(${transactions.category}, 120)`, amount: transactions.amount, description: sql<string>`left(${transactions.description}, 240)`, date: transactions.date, bankAccountId: transactions.bankAccountId, posDeviceId: transactions.posDeviceId })
          .from(transactions).where(eq(transactions.businessId, business.id)).orderBy(desc(transactions.date), desc(transactions.id)).limit(26),
      ]);
      if (accountRows.length > 1_000) throw new HttpError(413, "تعداد حساب‌های بانکی برای snapshot آفلاین از سقف امن بیشتر است");
      const recentDeviceIds = [...new Set(recentRows.flatMap((row) => row.posDeviceId ? [row.posDeviceId] : []))];
      const posRows = recentDeviceIds.length ? await tx.select({ id: devices.id, name: devices.name, terminalNumber: devices.terminalNumber }).from(devices)
        .where(and(eq(devices.businessId, business.id), eq(devices.kind, "pos"), inArray(devices.id, recentDeviceIds))) : [];
      const accountById = new Map(accountRows.map((row) => [row.id, row]));
      const deviceById = new Map(posRows.map((row) => [row.id, row]));
      const aggregateByKey = new Map(aggregateRows.map((row) => [`${row.id ?? "cash"}:${row.kind}`, { total: Number(row.total), range: Number(row.rangeTotal) }]));
      const summarizeAccount = (id: number | null, name: string, bank: string, accountNumber: string, opening: number) => {
        const flow = (kind: "income" | "expense", range: boolean) => aggregateByKey.get(`${id ?? "cash"}:${kind}`)?.[range ? "range" : "total"] ?? 0;
        const numberSuffix = accountNumber.replace(/\s+/g, "").slice(-4);
        return { id, name: name.slice(0, 120), bank: bank.slice(0, 80), accountNumber: numberSuffix ? `•••• ${numberSuffix}` : "", opening, income: flow("income", true), expense: flow("expense", true), balance: opening + flow("income", false) - flow("expense", false) };
      };
      const accountSummaries = [summarizeAccount(null, "صندوق (نقدی)", "—", "", 0), ...accountRows.map((row) => summarizeAccount(row.id, row.name, row.bank, row.accountNumber, row.openingBalance))];
      const recent = recentRows.slice(0, 25).map((row) => {
        const pos = row.posDeviceId ? deviceById.get(row.posDeviceId) : null;
        const account = row.bankAccountId ? accountById.get(row.bankAccountId) : null;
        const linkedBank = account ? accountSummaries.find((summary) => summary.id === account.id)?.name : "";
        const accountName = pos
          ? `کارتخوان — ${pos.name}${pos.terminalNumber ? ` (شماره ${pos.terminalNumber})` : ""}${linkedBank ? ` · ${linkedBank}` : ""}`
          : account?.name ?? "صندوق (نقدی)";
        return { id: row.id, kind: row.kind, category: row.category, amount: row.amount, description: row.description, date: row.date.toISOString(), accountId: row.bankAccountId, accountName: accountName.slice(0, 180) };
      });
      payload = { days: 30, total: accountSummaries.reduce((sum, row) => sum + row.balance, 0), accounts: accountSummaries, recent };
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
    } else if (dataset === "cheques") {
      const [chequeRows, beneficiaryRows, eventRows, accountRows] = await Promise.all([
        tx.select({ id: cheques.id, beneficiaryId: cheques.beneficiaryId, direction: cheques.direction, status: cheques.status, partnerName: cheques.partnerName, amount: cheques.amount, issueDate: cheques.issueDate, dueDate: cheques.dueDate, chequeNumber: cheques.chequeNumber, serialNumber: cheques.serialNumber, bank: cheques.bank, branch: cheques.branch, expensePurpose: cheques.expensePurpose, sayadIdentifier: cheques.sayadIdentifier, note: cheques.note, accountingAccountId: cheques.accountingAccountId, accountingDocumentId: cheques.accountingDocumentId, createdAt: cheques.createdAt, updatedAt: cheques.updatedAt })
          .from(cheques).where(eq(cheques.businessId, business.id)).orderBy(desc(cheques.dueDate), desc(cheques.id)).limit(5_001),
        tx.select({ id: chequeBeneficiaries.id, fullName: chequeBeneficiaries.fullName, nationalId: chequeBeneficiaries.nationalId, phone: chequeBeneficiaries.phone })
          .from(chequeBeneficiaries).where(eq(chequeBeneficiaries.businessId, business.id)).orderBy(asc(chequeBeneficiaries.fullName), asc(chequeBeneficiaries.id)).limit(1_001),
        tx.select({ id: chequeEvents.id, chequeId: chequeEvents.chequeId, requestKey: chequeEvents.requestKey, fromStatus: chequeEvents.fromStatus, toStatus: chequeEvents.toStatus, note: chequeEvents.note, accountingAccountId: chequeEvents.accountingAccountId, reversalDocumentId: chequeEvents.reversalDocumentId, accountingDocumentId: chequeEvents.accountingDocumentId, createdAt: chequeEvents.createdAt })
          .from(chequeEvents).where(eq(chequeEvents.businessId, business.id)).orderBy(desc(chequeEvents.id)).limit(20_001),
        tx.select({ id: accAccounts.id, code: accAccounts.code, name: accAccounts.name, level: accAccounts.level, isActive: accAccounts.isActive })
          .from(accAccounts).where(and(eq(accAccounts.businessId, business.id), eq(accAccounts.isActive, true), inArray(accAccounts.level, ["moein", "tafsili"]))).orderBy(asc(accAccounts.code), asc(accAccounts.id)).limit(1_001),
      ]);
      if (chequeRows.length > 5_000 || beneficiaryRows.length > 1_000 || eventRows.length > 20_000 || accountRows.length > 1_000) {
        throw new HttpError(413, "دفتر چک برای دریافت آفلاین از سقف امن یک snapshot بیشتر است؛ دریافت صفحه‌بندی‌شده لازم است");
      }
      const ids = new Set(chequeRows.map((row) => row.id));
      payload = {
        cheques: chequeRows.map((row) => ({ ...row, issueDate: row.issueDate.toISOString(), dueDate: row.dueDate.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })),
        beneficiaries: beneficiaryRows,
        events: eventRows.filter((event) => ids.has(event.chequeId)).map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
        accounts: accountRows.filter((row) => row.code !== Accounting.C.CHEQUE_RECEIVABLE && row.code !== Accounting.C.CHEQUE_PAYABLE),
        banks: [...IRANIAN_BANKS],
        purposes: [...CHEQUE_PURPOSES],
        totalCheques: chequeRows.length,
      };
    } else if (dataset === "reports") {
      const now = new Date(), today = startOfDayTehran(now), from = new Date(today.getTime() - 89 * 86_400_000), to = new Date(today.getTime() + 86_400_000 - 1);
      const dateKey = sql<string>`to_char(${orders.createdAt} AT TIME ZONE 'Asia/Tehran', 'YYYY-MM-DD')`;
      const salesAvailable = hasAny(features, "sales_reports"), profitLossAvailable = hasAny(features, "profit_loss");
      const paidOrders = and(eq(orders.businessId, business.id), eq(orders.status, "paid"), eq(orders.paymentStatus, "paid"), gt(orders.createdAt, new Date(from.getTime() - 1)), lt(orders.createdAt, new Date(to.getTime() + 1)));
      const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" });
      const dayRows = Array.from({ length: 90 }, (_, index) => {
        const day = new Date(from.getTime() + index * 86_400_000);
        return { date: day.toISOString(), revenue: 0, orders: 0 };
      });
      let salesDailyByKey = new Map<string, { revenue: number; orders: number }>();
      let salesTotals = { revenue: 0, orders: 0, discounts: 0, tax: 0, cogs: 0, soldItems: 0 };
      let byProduct: { name: string; quantity: number; revenue: number }[] = [], statuses: { status: string; paymentStatus: string; orders: number; amount: number }[] = [];
      if (salesAvailable) {
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
        salesDailyByKey = new Map(dailyRows.map((row) => [row.day, { revenue: Number(row.revenue), orders: Number(row.orders) }]));
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
        salesTotals = { revenue: Number(totals?.revenue ?? 0), orders: Number(totals?.orders ?? 0), discounts: Number(totals?.discounts ?? 0), tax: Number(totals?.tax ?? 0), cogs: Number(totals?.cogs ?? 0), soldItems: Number(sold?.quantity ?? 0) };
        byProduct = byProductRows.map((row) => ({ name: row.name, quantity: Number(row.quantity), revenue: Number(row.revenue) }));
        statuses = statusRows.map((row) => ({ status: row.status, paymentStatus: row.paymentStatus, orders: Number(row.orders), amount: Number(row.amount) }));
      }
      const series = dayRows.map((day) => ({ ...day, ...(salesDailyByKey.get(dayFormatter.format(new Date(day.date))) ?? { revenue: 0, orders: 0 }) }));
      const orderCount = salesTotals.orders, revenue = salesTotals.revenue, cogs = salesTotals.cogs;
      let profitLoss: OfflineProfitLossPayload | null = null;
      if (profitLossAvailable) {
        const paidForPnl = await tx.select({ createdAt: orders.createdAt, subtotal: orders.subtotal, discountAmount: orders.discountAmount, deliveryFee: orders.deliveryFee, tax: orders.tax, cogs: orders.cogs })
          .from(orders).where(and(eq(orders.businessId, business.id), eq(orders.status, "paid"), gte(orders.createdAt, from), lte(orders.createdAt, to))).limit(50_001);
        if (paidForPnl.length > 50_000) throw new HttpError(413, "تعداد سفارش‌ها برای گزارش آفلاین سود و زیان از سقف امن بیشتر است");
        const pnlTransactions = await tx.select({ kind: transactions.kind, amount: transactions.amount, category: sql<string>`left(${transactions.category}, 120)`, accountMoeinId: transactions.accountMoeinId, date: transactions.date })
          .from(transactions).where(and(eq(transactions.businessId, business.id), gte(transactions.date, from), lte(transactions.date, to), sql`${transactions.source} <> 'sale'`)).limit(20_001);
        if (pnlTransactions.length > 20_000) throw new HttpError(413, "تعداد تراکنش‌ها برای گزارش آفلاین سود و زیان از سقف امن بیشتر است");
        const expenseAccounts = pnlTransactions.some((row) => row.kind === "expense")
          ? await tx.select({ id: accAccounts.id, name: accAccounts.name }).from(accAccounts).where(and(eq(accAccounts.businessId, business.id), eq(accAccounts.type, "expense")))
          : [];
        const expenseNames = new Map(expenseAccounts.map((row) => [row.id, row.name]));
        const pnlSeries = dayRows.map((day) => ({ date: day.date, revenue: 0, cogs: 0, expenses: 0 }));
        const pnlByDay = new Map(pnlSeries.map((row) => [dayFormatter.format(new Date(row.date)), row]));
        let pnlRevenue = 0, discounts = 0, tax = 0, pnlCogs = 0, expenses = 0, otherIncome = 0;
        const expenseBreakdown = new Map<string, number>();
        for (const order of paidForPnl) {
          const netRevenue = order.subtotal - order.discountAmount + order.deliveryFee;
          pnlRevenue += netRevenue; discounts += order.discountAmount; tax += order.tax; pnlCogs += order.cogs;
          const daily = pnlByDay.get(dayFormatter.format(order.createdAt));
          if (daily) { daily.revenue += netRevenue; daily.cogs += order.cogs; }
        }
        for (const transaction of pnlTransactions) {
          const daily = pnlByDay.get(dayFormatter.format(transaction.date));
          if (transaction.kind === "expense") {
            const label = ((transaction.accountMoeinId && expenseNames.get(transaction.accountMoeinId)) || transaction.category || "سایر").slice(0, 120);
            expenses += transaction.amount; expenseBreakdown.set(label, (expenseBreakdown.get(label) ?? 0) + transaction.amount);
            if (daily) daily.expenses += transaction.amount;
          } else if (transaction.kind === "income") otherIncome += transaction.amount;
        }
        const coveredOrders = paidForPnl.filter((order) => order.cogs > 0).length;
        const sortedExpenses = [...expenseBreakdown].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
        const topExpenses = sortedExpenses.slice(0, 100), remainingExpenses = sortedExpenses.slice(100).reduce((sum, row) => sum + row.amount, 0);
        if (remainingExpenses) topExpenses.push({ name: "سایر دسته‌ها", amount: remainingExpenses });
        profitLoss = {
          revenue: pnlRevenue, discounts, tax, cogs: pnlCogs, grossProfit: pnlRevenue - pnlCogs, expenses, otherIncome,
          net: pnlRevenue - pnlCogs - expenses + otherIncome,
          cogsCoverage: paidForPnl.length ? Math.round((coveredOrders / paidForPnl.length) * 100) : 0,
          expenseBreakdown: topExpenses,
          series: pnlSeries, basis: "recorded_order_cogs",
        };
      }
      payload = {
        salesAvailable,
        from: from.toISOString(), to: to.toISOString(),
        totals: { revenue, orders: orderCount, average: orderCount ? Math.round(revenue / orderCount) : 0, discounts: salesTotals.discounts, tax: salesTotals.tax, cogs, grossProfit: revenue - cogs, soldItems: salesTotals.soldItems },
        series,
        byProduct,
        statuses,
        profitLoss,
      };
    } else if (dataset === "payroll") {
      const [businessRow] = await tx.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, business.id)).limit(1);
      const runRows = await tx.select({
        id: payrollRuns.id, jalaliYear: payrollRuns.jalaliYear, jalaliMonth: payrollRuns.jalaliMonth, status: payrollRuns.status,
        salaryDocumentId: payrollRuns.salaryDocumentId, createdAt: payrollRuns.createdAt, approvedAt: payrollRuns.approvedAt,
      }).from(payrollRuns).where(eq(payrollRuns.businessId, business.id))
        .orderBy(desc(payrollRuns.jalaliYear), desc(payrollRuns.jalaliMonth), desc(payrollRuns.id)).limit(12);
      const runIds = runRows.map((row) => row.id);
      const itemRows = runIds.length ? await tx.select({
        id: payrollItems.id, runId: payrollItems.runId, staffId: payrollItems.staffId, staffSnapshot: payrollItems.staffSnapshot,
        workMinutes: payrollItems.workMinutes, overtimeMinutes: payrollItems.overtimeMinutes, fridayMinutes: payrollItems.fridayMinutes,
        holidayMinutes: payrollItems.holidayMinutes, nightMinutes: payrollItems.nightMinutes, leaveMinutes: payrollItems.leaveMinutes,
        unpaidLeaveMinutes: payrollItems.unpaidLeaveMinutes, shortMinutes: payrollItems.shortMinutes, earnings: payrollItems.earnings,
        deductions: payrollItems.deductions, grossToman: payrollItems.grossToman, employeeInsuranceToman: payrollItems.employeeInsuranceToman,
        employerInsuranceToman: payrollItems.employerInsuranceToman, incomeTaxToman: payrollItems.incomeTaxToman,
        penaltyToman: payrollItems.penaltyToman, netToman: payrollItems.netToman,
      }).from(payrollItems).where(and(eq(payrollItems.businessId, business.id), inArray(payrollItems.runId, runIds))).orderBy(asc(payrollItems.runId), asc(payrollItems.id)) : [];
      if (itemRows.length > 3_000) throw new HttpError(413, "آرشیو حقوق برای این دستگاه بیش از ۳٬۰۰۰ ردیف است؛ برای دریافت آفلاین باید دوره‌بندی شود");
      const settlementRows = runIds.length ? await tx.select({
        runId: payrollSettlements.runId, kind: payrollSettlements.kind, amountToman: payrollSettlements.amountToman,
        paidAt: payrollSettlements.paidAt,
      }).from(payrollSettlements).where(and(eq(payrollSettlements.businessId, business.id), inArray(payrollSettlements.runId, runIds))).orderBy(asc(payrollSettlements.id)) : [];
      const asItems = (runId: number) => itemRows.filter((item) => item.runId === runId).map((item) => {
        // Only payslip fields leave the server. The device encrypts the snapshot
        // with DPAPI and its read command requires the local manager PIN.
        const staffSnapshot = projectOfflinePayslipStaff(item.staffSnapshot);
        const { earnings, deductions } = projectOfflinePayslipLines(item.earnings, item.deductions);
        return {
          id: item.id, staffId: item.staffId, staffSnapshot, workMinutes: item.workMinutes,
          overtimeMinutes: item.overtimeMinutes, fridayMinutes: item.fridayMinutes, holidayMinutes: item.holidayMinutes,
          nightMinutes: item.nightMinutes, leaveMinutes: item.leaveMinutes, unpaidLeaveMinutes: item.unpaidLeaveMinutes,
          shortMinutes: item.shortMinutes, earnings, deductions, grossToman: item.grossToman,
          employeeInsuranceToman: item.employeeInsuranceToman, employerInsuranceToman: item.employerInsuranceToman,
          incomeTaxToman: item.incomeTaxToman, penaltyToman: item.penaltyToman, netToman: item.netToman,
        };
      });
      payload = {
        businessName: businessRow?.name ?? "",
        runs: runRows.map((run) => {
          const items = asItems(run.id);
          return {
            ...run, createdAt: run.createdAt.toISOString(), approvedAt: run.approvedAt?.toISOString() ?? null,
            totals: items.reduce((total, item) => ({
              gross: total.gross + item.grossToman, employeeInsurance: total.employeeInsurance + item.employeeInsuranceToman,
              employerInsurance: total.employerInsurance + item.employerInsuranceToman, tax: total.tax + item.incomeTaxToman,
              penalty: total.penalty + item.penaltyToman, net: total.net + item.netToman,
            }), { gross: 0, employeeInsurance: 0, employerInsurance: 0, tax: 0, penalty: 0, net: 0 }),
            items, settlements: settlementRows.filter((row) => row.runId === run.id).map((row) => ({ kind: row.kind, amountToman: row.amountToman, paidAt: row.paidAt.toISOString() })),
          };
        }),
        totalRuns: runRows.length, totalItems: itemRows.length,
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
      const configuredPreset = settingsOf(business).orderWorkflowPreset ?? 4;
      const workflowPreset: 1 | 2 | 3 | 4 = [1, 2, 3, 4].includes(configuredPreset) ? configuredPreset : 4;
      const orderRows = await tx.select({
        id: orders.id, number: orders.number, tableId: orders.tableId, tableName: diningTables.name,
        customerName: orders.customerName, customerPhone: orders.customerPhone, type: orders.type, source: orders.source,
        status: orders.status, note: orders.note, address: orders.address, deliveryFee: orders.deliveryFee,
        discountCode: orders.discountCode, discountAmount: orders.discountAmount, membershipDiscount: orders.membershipDiscount,
        cashbackUsed: orders.cashbackUsed, scheduledFor: orders.scheduledFor, deliveryStatus: orders.deliveryStatus,
        subtotal: orders.subtotal, tax: orders.tax, service: orders.service,
        total: orders.total, paymentMethod: orders.paymentMethod, paymentStatus: orders.paymentStatus,
        paymentBreakdown: orders.paymentBreakdown, createdAt: orders.createdAt,
        updatedAt: sql<string>`to_char(${orders.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      }).from(orders).leftJoin(diningTables, and(eq(diningTables.id, orders.tableId), eq(diningTables.businessId, business.id)))
        .where(and(eq(orders.businessId, business.id), isNull(orders.deletedAt)))
        .orderBy(desc(orders.createdAt), desc(orders.id)).limit(100);
      const cashierConfirmations = orderRows.length ? await tx.select({ orderId: orderStatusEvents.orderId, createdAt: orderStatusEvents.createdAt })
        .from(orderStatusEvents).where(and(eq(orderStatusEvents.businessId, business.id), eq(orderStatusEvents.kind, "cashier_confirmation"), inArray(orderStatusEvents.orderId, orderRows.map((row) => row.id)))) : [];
      const cashierConfirmationByOrder = new Map(cashierConfirmations.map((row) => [row.orderId, row.createdAt.toISOString()]));
      const itemRows = orderRows.length ? await tx.select({
        id: orderItems.id, orderId: orderItems.orderId, productId: orderItems.productId, name: orderItems.name,
        price: orderItems.price, quantity: orderItems.quantity, weightGrams: orderItems.weightGrams,
        tareGrams: orderItems.tareGrams, lineTotal: orderItems.lineTotal, note: orderItems.note,
        optionSnapshot: orderItems.optionSnapshot,
      }).from(orderItems).where(inArray(orderItems.orderId, orderRows.map((row) => row.id))).orderBy(asc(orderItems.id)) : [];
      const itemsByOrder = new Map<number, typeof itemRows>();
      for (const item of itemRows) itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);
      payload = {
        workflowPreset,
        orders: orderRows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          scheduledFor: row.scheduledFor?.toISOString() ?? null,
          cashierConfirmedAt: cashierConfirmationByOrder.get(row.id) ?? null,
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
      const message = dataset === "menu" ? "اطلاعات منو از سقف دریافت آفلاین بیشتر است؛ تصاویر باید از نشانی فایل بارگذاری‌شده باشند" : dataset === "customers" ? "فهرست مشتریان برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "orders" ? "تاریخچه سفارش‌ها برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "reservations" ? "تاریخچه رزروها برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "shifts" ? "برنامهٔ شیفت برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "accounting" ? "اطلاعات حسابداری برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "receivables" ? "اطلاعات مطالبات برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "cash_shifts" ? "اطلاعات شیفت صندوق برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "reports" ? "گزارش فروش برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : dataset === "payroll" ? "آرشیو فیش‌های حقوق برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است" : "اطلاعات انبار برای دریافت آفلاین از سقف ۴ مگابایت بیشتر است";
      throw new HttpError(413, message);
    }
    const payloadHash = createHash("sha256").update(canonical(payload)).digest("hex");
    const [latest] = await tx.select().from(offlineWorkspaceSnapshots).where(and(eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.dataset, dataset))).orderBy(desc(offlineWorkspaceSnapshots.revision)).limit(1);
    const now = new Date();
    const validUntil = new Date(now.getTime() + SNAPSHOT_TTL_MS);

    if (latest?.payloadHash === payloadHash) {
      const [refreshed] = await tx.update(offlineWorkspaceSnapshots).set({ issuedAt: now, validUntil }).where(and(eq(offlineWorkspaceSnapshots.id, latest.id), eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.businessId, business.id))).returning();
      if (!refreshed) throw new HttpError(409, "تمدید نسخهٔ دادهٔ آفلاین انجام نشد");
      if (dataset === "reservations" || dataset === "shifts" || dataset === "payroll") await tx.delete(offlineWorkspaceSnapshots).where(and(eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.dataset, dataset), lt(offlineWorkspaceSnapshots.revision, refreshed.revision)));
      return responseShape(refreshed);
    }

    const [saved] = await tx.insert(offlineWorkspaceSnapshots).values({ id: randomUUID(), terminalId: terminal.id, businessId: business.id, dataset, revision: (latest?.revision ?? 0) + 1, schemaVersion: 1, payloadHash, payload, issuedAt: now, validUntil }).returning();
    if (!saved) throw new HttpError(500, "ذخیرهٔ نسخهٔ دادهٔ آفلاین انجام نشد");
    if (dataset === "reservations" || dataset === "shifts" || dataset === "payroll") await tx.delete(offlineWorkspaceSnapshots).where(and(eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.dataset, dataset), lt(offlineWorkspaceSnapshots.revision, saved.revision)));
    return responseShape(saved);
  }, { isolationLevel: "repeatable read" });
}

type MenuCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "menu";
  action: "update_product" | "update_category" | "create_product" | "create_category" | "set_recipe";
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
  const actions = ["update_product", "update_category", "create_product", "create_category", "set_recipe"];
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.module !== "menu" || !actions.includes(String(raw.action))) {
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
  if (action === "set_recipe") {
    if (Object.keys(payload).some((key) => key !== "productId" && key !== "lines") || !Number.isSafeInteger(payload.productId) || Number(payload.productId) < 1 || !Array.isArray(payload.lines) || payload.lines.length > 200) {
      throw new HttpError(400, "اطلاعات دستور تهیهٔ محصول معتبر نیست");
    }
    const usedItems = new Set<number>();
    for (const line of payload.lines) {
      if (!isRecord(line) || Object.keys(line).some((key) => !["itemId", "quantity", "wastePercent"].includes(key))
        || !Number.isSafeInteger(line.itemId) || Number(line.itemId) < 1
        || typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity < 0.0001 || line.quantity > 100_000
        || typeof line.wastePercent !== "number" || !Number.isFinite(line.wastePercent) || line.wastePercent < 0 || line.wastePercent > 99.9
        || usedItems.has(Number(line.itemId))) {
        throw new HttpError(400, "مادهٔ تکراری یا مقدار دستور تهیه نامعتبر است");
      }
      usedItems.add(Number(line.itemId));
    }
    payload.lines.sort((a, b) => Number((a as Record<string, unknown>).itemId) - Number((b as Record<string, unknown>).itemId));
    return raw as unknown as MenuCommand;
  }
  if (action === "create_product" || action === "create_category") {
    const key = action === "create_product" ? "product" : "category";
    if (Object.keys(payload).length !== 1 || !isRecord(payload[key])) throw new HttpError(400, "اطلاعات قلم جدید منو معتبر نیست");
    const item = payload[key] as Record<string, unknown>;
    const allowed = action === "create_product" ? ["name", "description", "price", "categoryId", "modifierGroups"] : ["name", "description", "isActive", "sortOrder"];
    if (Object.keys(item).some((field) => !allowed.includes(field))) throw new HttpError(400, "قلم جدید منو فیلد ناشناخته دارد");
    const nameLimit = action === "create_product" ? 100 : 60;
    const descriptionLimit = action === "create_product" ? 400 : 500;
    if (typeof item.name !== "string" || !item.name.trim() || item.name.trim().length > nameLimit) throw new HttpError(400, "نام قلم منو معتبر نیست");
    if (typeof item.description !== "string" || item.description.length > descriptionLimit) throw new HttpError(400, "توضیح قلم منو معتبر نیست");
    if (action === "create_product") {
      const required = ["name", "description", "price", "categoryId"];
      if (required.some((field) => !(field in item))) throw new HttpError(400, "اطلاعات پایهٔ محصول کامل نیست");
      if (!Number.isSafeInteger(item.price) || Number(item.price) < 1 || Number(item.price) > 100_000_000) throw new HttpError(400, "قیمت محصول باید بیشتر از صفر و حداکثر ۱۰۰ میلیون تومان باشد");
      if (item.categoryId !== null && (!Number.isSafeInteger(item.categoryId) || Number(item.categoryId) < 1)) throw new HttpError(400, "دسته‌بندی محصول معتبر نیست");
      if ("modifierGroups" in item) {
        try { item.modifierGroups = normalizeProductOptionGroups(item.modifierGroups); }
        catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "گروه‌های گزینه محصول معتبر نیستند"); }
      }
    } else {
      if (typeof item.isActive !== "boolean" || !Number.isSafeInteger(item.sortOrder) || Number(item.sortOrder) < 0 || Number(item.sortOrder) > 10_000) throw new HttpError(400, "وضعیت یا ترتیب دسته‌بندی معتبر نیست");
    }
    return raw as unknown as MenuCommand;
  }
  const patch = payload.patch;
  const expectedId = action === "update_product" ? payload.productId : payload.categoryId;
  const payloadKeys = action === "update_product" ? ["productId", "patch"] : ["categoryId", "patch"];
  if (Object.keys(payload).some((key) => !payloadKeys.includes(key))) throw new HttpError(400, "محتوای فرمان منو فیلد ناشناخته دارد");
  if (!Number.isSafeInteger(expectedId) || Number(expectedId) < 1 || !isRecord(patch)) throw new HttpError(400, "شناسه یا تغییرات منو معتبر نیست");
  const allowed = action === "update_product" ? ["name", "description", "price", "isAvailable", "modifierGroups"] : ["name", "description", "isActive", "sortOrder"];
  const keys = Object.keys(patch);
  if (!keys.length || keys.some((key) => !allowed.includes(key))) throw new HttpError(400, "فرمان فقط می‌تواند فیلدهای مجاز منو را تغییر دهد");
  if ("name" in patch && (typeof patch.name !== "string" || !patch.name.trim() || patch.name.trim().length > (action === "update_product" ? 100 : 60))) throw new HttpError(400, "نام منو معتبر نیست");
  if ("description" in patch && (typeof patch.description !== "string" || patch.description.length > (action === "update_product" ? 400 : 500))) throw new HttpError(400, "توضیح منو معتبر نیست");
  if ("price" in patch && (!Number.isSafeInteger(patch.price) || Number(patch.price) < 0 || Number(patch.price) > 100_000_000)) throw new HttpError(400, "قیمت محصول معتبر نیست");
  if ("isAvailable" in patch && typeof patch.isAvailable !== "boolean") throw new HttpError(400, "وضعیت موجودی محصول معتبر نیست");
  if ("modifierGroups" in patch) {
    try { patch.modifierGroups = normalizeProductOptionGroups(patch.modifierGroups); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "گروه‌های گزینه محصول معتبر نیستند"); }
  }
  if ("isActive" in patch && typeof patch.isActive !== "boolean") throw new HttpError(400, "وضعیت دسته‌بندی معتبر نیست");
  if ("sortOrder" in patch && (!Number.isSafeInteger(patch.sortOrder) || Number(patch.sortOrder) < 0 || Number(patch.sortOrder) > 10_000)) throw new HttpError(400, "ترتیب دسته‌بندی معتبر نیست");
  return raw as unknown as MenuCommand;
}

export async function syncOfflineDashboardCommand(req: Request, raw: unknown) {
  if (isRecord(raw) && raw.module === "tables") return syncOfflineTableStatusCommand(req, raw);
  if (isRecord(raw) && raw.module === "cash_shifts") return syncOfflineCashShiftCommand(req, parseCashShiftCommand(raw));
  if (isRecord(raw) && raw.module === "cheques") return syncOfflineChequeCommand(req, raw);
  if (isRecord(raw) && raw.module === "orders") return syncOfflineOrderStatusCommand(req, raw);
  if (isRecord(raw) && raw.module === "staff") return syncOfflineStaffRequest(req, parseStaffCommand(raw));
  if (isRecord(raw) && raw.module === "accounting") return syncOfflineAccountingCommand(req, raw);
  if (isRecord(raw) && raw.module === "customers") return syncOfflineCustomerCommand(req, raw);
  const command = parseMenuCommand(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos")) throw new HttpError(403, "همگام‌سازی پنل آفلاین در اشتراک فعلی فعال نیست");
  if (command.action === "set_recipe" && !hasAny(features, "recipes")) throw new HttpError(403, "ویرایش دستور تهیه در اشتراک فعلی فعال نیست");
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
    if (command.action === "create_product") {
      const item = command.payload.product as { name: string; description: string; price: number; categoryId: number | null; modifierGroups?: ReturnType<typeof normalizeProductOptionGroups> };
      if (item.categoryId !== null) {
        const baseCategories = (snapshot.payload.categories as Record<string, unknown>[] | undefined) ?? [];
        const baseCategory = baseCategories.find((row) => row.id === item.categoryId && row.isActive === true);
        const [currentCategory] = await tx.select({ id: categories.id }).from(categories).where(and(
          eq(categories.id, item.categoryId), eq(categories.businessId, business.id), eq(categories.isActive, true),
        )).for("update");
        if (!baseCategory || !currentCategory) return record("conflict", 409, "دسته‌بندی انتخاب‌شده در نسخهٔ معتبر منو موجود نیست؛ دسته‌های تازه را دریافت کنید");
      }
      const [created] = await tx.insert(products).values({
        businessId: business.id, categoryId: item.categoryId, name: item.name.trim(), description: item.description.trim(),
        price: item.price, isAvailable: true, sellingMode: "count", yieldRatio: 1, modifierGroups: item.modifierGroups ?? [],
      }).returning({ id: products.id });
      if (!created) throw new HttpError(500, "ساخت محصول منو انجام نشد");
      return record("applied", 200, "", String(created.id));
    }
    if (command.action === "create_category") {
      const item = command.payload.category as { name: string; description: string; isActive: boolean; sortOrder: number };
      const [created] = await tx.insert(categories).values({
        businessId: business.id, name: item.name.trim(), description: item.description.trim(), isActive: item.isActive, sortOrder: item.sortOrder,
      }).returning({ id: categories.id });
      if (!created) throw new HttpError(500, "ساخت دسته‌بندی منو انجام نشد");
      return record("applied", 200, "", String(created.id));
    }
    if (command.action === "set_recipe") {
      const productId = Number(command.payload.productId);
      const baseProducts = (snapshot.payload.products as Record<string, unknown>[] | undefined) ?? [];
      const baseProduct = baseProducts.find((row) => row.id === productId);
      const baseRecipeItems = (snapshot.payload.recipeItems as Record<string, unknown>[] | undefined) ?? [];
      const baseLines = baseProduct?.recipes;
      if (!Array.isArray(baseLines) || !snapshot.payload.recipeItems) return record("conflict", 409, "دستور تهیه در نسخهٔ مبنا موجود نیست؛ اشتراک یا snapshot منو را تازه کنید");
      const [currentProduct] = await tx.select({ id: products.id }).from(products)
        .where(and(eq(products.id, productId), eq(products.businessId, business.id))).for("update");
      if (!currentProduct) return record("conflict", 409, "محصول دستور تهیه در سرور پیدا نشد");
      const currentLines = await tx.select({ itemId: recipes.itemId, quantity: recipes.quantity, wastePercent: recipes.wastePercent })
        .from(recipes).where(and(eq(recipes.businessId, business.id), eq(recipes.productId, productId)))
        .orderBy(asc(recipes.itemId)).for("update");
      const normalizeLines = (lines: unknown) => Array.isArray(lines)
        ? lines.map((line) => ({ itemId: Number((line as Record<string, unknown>).itemId), quantity: Number((line as Record<string, unknown>).quantity), wastePercent: Number((line as Record<string, unknown>).wastePercent) })).sort((a, b) => a.itemId - b.itemId)
        : [];
      if (canonical(normalizeLines(currentLines)) !== canonical(normalizeLines(baseLines))) return record("conflict", 409, "دستور تهیهٔ محصول از زمان دریافت snapshot تغییر کرده است؛ منو را تازه کنید و دوباره بررسی کنید");
      const lines = command.payload.lines as { itemId: number; quantity: number; wastePercent: number }[];
      const baseRecipeIds = new Set(normalizeLines(baseLines).map((line) => line.itemId));
      const itemIds = lines.map((line) => line.itemId);
      const currentItems = itemIds.length ? await tx.select({ id: inventoryItems.id, name: inventoryItems.name, unit: inventoryItems.unit, recipeUnit: inventoryItems.recipeUnit, recipeToStockFactor: inventoryItems.recipeToStockFactor, isActive: inventoryItems.isActive, trackStock: inventoryItems.trackStock })
        .from(inventoryItems).where(and(eq(inventoryItems.businessId, business.id), inArray(inventoryItems.id, itemIds))).for("update") : [];
      const currentItemById = new Map(currentItems.map((item) => [item.id, item]));
      for (const line of lines) {
        const baseItem = baseRecipeItems.find((item) => item.id === line.itemId);
        const currentItem = currentItemById.get(line.itemId);
        if (!baseItem || !currentItem) return record("conflict", 409, "یکی از مواد دستور تهیه از نسخهٔ این دستگاه حذف یا خارج شده است؛ snapshot انبار را تازه کنید");
        if (baseItem.name !== currentItem.name || baseItem.unit !== currentItem.unit || baseItem.recipeUnit !== currentItem.recipeUnit || Number(baseItem.recipeToStockFactor) !== Number(currentItem.recipeToStockFactor)
          || baseItem.isActive !== currentItem.isActive || baseItem.trackStock !== currentItem.trackStock) {
          return record("conflict", 409, "واحد یا وضعیت یکی از مواد اولیه تغییر کرده است؛ دستور تهیه را با snapshot تازه بازبینی کنید");
        }
        if (!currentItem.isActive && !baseRecipeIds.has(line.itemId)) return record("rejected", 422, "مادهٔ غیرفعال را نمی‌توان به دستور تهیه افزود");
      }
      await tx.delete(recipes).where(and(eq(recipes.businessId, business.id), eq(recipes.productId, productId)));
      if (lines.length) await tx.insert(recipes).values(lines.map((line) => ({
        businessId: business.id, productId, itemId: line.itemId, quantity: line.quantity, wastePercent: line.wastePercent,
      })));
      return record("applied", 200, "", String(productId));
    }
    const targetId = Number(command.action === "update_product" ? command.payload.productId : command.payload.categoryId);
    const patch = command.payload.patch as Record<string, unknown>;

    if (command.action === "update_product") {
      const [current] = await tx.select({ id: products.id, name: products.name, description: products.description, price: products.price, isAvailable: products.isAvailable, modifierGroups: products.modifierGroups })
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
  }, { isolationLevel: command.action === "set_recipe" ? "serializable" : "repeatable read" });

  if (outcome.httpStatus !== 200) {
    const error = typeof outcome.response.error === "string" ? outcome.response.error : "فرمان پنل آفلاین اعمال نشد";
    throw new HttpError(outcome.httpStatus, error);
  }
  return outcome.response;
}

type CashShiftCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "cash_shifts";
  action: "open" | "close";
  baseDataset: "cash_shifts";
  baseSnapshotId: string;
  baseRevision: number;
  payload: Record<string, unknown>;
};

function parseCashShiftCommand(raw: unknown): CashShiftCommand {
  const actions = ["open", "close"];
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.module !== "cash_shifts" || !actions.includes(String(raw.action))) {
    throw new HttpError(400, "قالب فرمان شیفت صندوق آفلاین معتبر نیست");
  }
  const commandKeys = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(raw).some((key) => !commandKeys.includes(key))) throw new HttpError(400, "فرمان شیفت صندوق فیلد ناشناخته دارد");
  if (typeof raw.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.id)
    || !Number.isSafeInteger(raw.businessId) || Number(raw.businessId) < 1 || raw.baseDataset !== "cash_shifts"
    || typeof raw.baseSnapshotId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.baseSnapshotId)
    || !Number.isSafeInteger(raw.baseRevision) || Number(raw.baseRevision) < 1 || !isRecord(raw.payload)) {
    throw new HttpError(400, "شناسه یا نسخهٔ مبنای شیفت صندوق معتبر نیست");
  }
  const payload = raw.payload;
  if (raw.action === "open") {
    if (Object.keys(payload).some((key) => !["openingCash", "note", "occurredAt"].includes(key))
      || !Number.isSafeInteger(payload.openingCash) || Number(payload.openingCash) < 0 || Number(payload.openingCash) > 2_147_483_647
      || typeof payload.note !== "string" || payload.note.length > 500 || !isIsoTimestamp(payload.occurredAt)) {
      throw new HttpError(400, "مبلغ یا اطلاعات بازکردن شیفت معتبر نیست");
    }
  } else {
    const allowedPayloadKeys = ["shiftId", "openCommandId", "expectedOpenedAt", "closingCash", "note", "occurredAt"];
    const hasShiftId = Number.isSafeInteger(payload.shiftId) && Number(payload.shiftId) > 0;
    const hasOpenCommandId = typeof payload.openCommandId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.openCommandId);
    if (Object.keys(payload).some((key) => !allowedPayloadKeys.includes(key)) || hasShiftId === hasOpenCommandId
      || !(payload.shiftId === null || hasShiftId) || !(payload.openCommandId === undefined || hasOpenCommandId)
      || !isIsoTimestamp(payload.expectedOpenedAt) || !Number.isSafeInteger(payload.closingCash) || Number(payload.closingCash) < 0 || Number(payload.closingCash) > 2_147_483_647
      || typeof payload.note !== "string" || payload.note.length > 500 || !isIsoTimestamp(payload.occurredAt)
      || Date.parse(payload.occurredAt as string) < Date.parse(payload.expectedOpenedAt as string)) {
      throw new HttpError(400, "مبلغ یا اطلاعات بستن شیفت معتبر نیست");
    }
  }
  return raw as unknown as CashShiftCommand;
}

async function syncOfflineCashShiftCommand(req: Request, command: CashShiftCommand) {
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos")) throw new HttpError(403, "مدیریت شیفت صندوق آفلاین به مجوز صندوق نیاز دارد");
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان شیفت متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");

  const outcome = await db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");
    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.module !== "cash_shifts" || previous.payloadHash !== payloadHash) {
        return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسهٔ فرمان قبلاً با محتوای دیگری ثبت شده است" } };
      }
      return { httpStatus: previous.httpStatus, response: previous.result };
    }
    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(
      eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId), eq(offlineWorkspaceSnapshots.terminalId, terminal.id),
      eq(offlineWorkspaceSnapshots.businessId, business.id), eq(offlineWorkspaceSnapshots.dataset, "cash_shifts"),
      eq(offlineWorkspaceSnapshots.revision, command.baseRevision),
    )).for("update");
    const record = async (state: "applied" | "conflict" | "rejected", httpStatus: 200 | 409 | 422, error = "", receipt = "") => {
      const response = { commandId: command.id, state, receipt, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({
        id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy,
        module: "cash_shifts", action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>,
        state, httpStatus, error, receipt, result: response,
      });
      return { httpStatus, response };
    };
    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "نسخهٔ شیفت صندوق پیدا نشد یا منقضی شده است؛ نسخهٔ تازه دریافت کنید");
    const now = Date.now();
    const occurredAt = new Date(String(command.payload.occurredAt));
    if (occurredAt.getTime() > now + 5 * 60_000 || occurredAt.getTime() < now - 8 * 86_400_000 || occurredAt < new Date(snapshot.issuedAt.getTime() - 5 * 60_000)) {
      return record("conflict", 409, "زمان دستگاه با نسخهٔ شیفت سازگار نیست؛ ساعت سیستم و نسخهٔ تازه را بررسی کنید");
    }
    const snapshotActive = isRecord(snapshot.payload.active) ? snapshot.payload.active : null;

    if (command.action === "open") {
      if (snapshotActive) return record("conflict", 409, "در نسخهٔ مبنا شیفتی باز است؛ ابتدا وضعیت آن را بررسی کنید");
      const [alreadyOpen] = await tx.select({ id: cashShifts.id }).from(cashShifts)
        .where(and(eq(cashShifts.businessId, business.id), isNull(cashShifts.closedAt))).for("update").limit(1);
      if (alreadyOpen) return record("conflict", 409, "در سرور شیفت صندوق دیگری باز شده است؛ نسخهٔ تازه را بررسی کنید");
      const [created] = await tx.insert(cashShifts).values({
        businessId: business.id, openedBy: terminal.createdBy, openedAt: occurredAt,
        openingCash: Number(command.payload.openingCash), note: String(command.payload.note).trim(),
      }).onConflictDoNothing().returning({ id: cashShifts.id });
      if (!created) return record("conflict", 409, "هم‌زمان شیفت دیگری باز شد؛ نسخهٔ تازه را بررسی کنید");
      return record("applied", 200, "", String(created.id));
    }

    let shiftId = Number(command.payload.shiftId ?? 0);
    if (command.payload.openCommandId) {
      const [openCommand] = await tx.select().from(offlineWorkspaceCommands).where(and(
        eq(offlineWorkspaceCommands.id, String(command.payload.openCommandId)), eq(offlineWorkspaceCommands.terminalId, terminal.id),
        eq(offlineWorkspaceCommands.businessId, business.id), eq(offlineWorkspaceCommands.module, "cash_shifts"),
        eq(offlineWorkspaceCommands.action, "open"), eq(offlineWorkspaceCommands.state, "applied"),
      )).for("update");
      if (!openCommand || (openCommand.payload as Record<string, unknown>).baseSnapshotId !== command.baseSnapshotId || !/^\d+$/.test(openCommand.receipt)) {
        return record("conflict", 409, "درخواست بازکردن شیفت هنوز در سرور تأیید نشده یا با این نسخه هم‌خوان نیست");
      }
      shiftId = Number(openCommand.receipt);
      const openPayload = (openCommand.payload as Record<string, unknown>).payload as Record<string, unknown>;
      if (!Number.isSafeInteger(shiftId) || Date.parse(String(openPayload?.occurredAt)) !== Date.parse(String(command.payload.expectedOpenedAt))) {
        return record("conflict", 409, "زمان شیفت محلی با درخواست بازکردن تأییدشده هم‌خوان نیست");
      }
    } else if (!snapshotActive || snapshotActive.id !== shiftId || snapshotActive.openedAt !== command.payload.expectedOpenedAt) {
      return record("conflict", 409, "شیفت از زمان دریافت نسخه تغییر کرده است؛ نسخهٔ تازه را بررسی کنید");
    }

    const [shift] = await tx.select().from(cashShifts).where(and(
      eq(cashShifts.id, shiftId), eq(cashShifts.businessId, business.id),
    )).for("update");
    if (!shift || shift.closedAt || shift.openedAt.getTime() !== Date.parse(String(command.payload.expectedOpenedAt))) {
      return record("conflict", 409, "شیفت باز پیدا نشد یا هم‌زمان بسته شده است");
    }
    const totals = await cashShiftTotals(tx as unknown as typeof db, business.id, shift.id);
    const expectedCash = shift.openingCash + totals.cashSales;
    const closingCash = Number(command.payload.closingCash);
    const note = [shift.note, String(command.payload.note).trim()].filter(Boolean).join("\n").slice(0, 1000);
    const [closed] = await tx.update(cashShifts).set({
      closedBy: terminal.createdBy, closedAt: occurredAt, closingCash, expectedCash, cashDifference: closingCash - expectedCash, note,
    }).where(and(eq(cashShifts.id, shift.id), eq(cashShifts.businessId, business.id), isNull(cashShifts.closedAt))).returning({ id: cashShifts.id });
    if (!closed) return record("conflict", 409, "شیفت هم‌زمان بسته شد؛ نسخهٔ تازه را بررسی کنید");
    return record("applied", 200, "", String(shift.id));
  });

  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, "error" in outcome.response && typeof outcome.response.error === "string" ? outcome.response.error : "همگام‌سازی شیفت صندوق انجام نشد");
  return outcome.response;
}

function parseCustomerCommand(raw: unknown): OfflineCustomerCommand {
  try {
    return parseOfflineCustomerCommand(raw);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "فرمان مشتری آفلاین معتبر نیست");
  }
}

export async function syncOfflineCustomerCommand(req: Request, raw: unknown) {
  const command = parseCustomerCommand(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "loyalty")) throw new HttpError(403, "صندوق آفلاین و باشگاه مشتریان باید در اشتراک فعال باشند");
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان مشتری متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");

  const outcome = await db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این دستگاه لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.module !== "customers" || previous.payloadHash !== payloadHash) {
        return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسهٔ فرمان قبلاً با محتوای دیگری ثبت شده است" } };
      }
      return { httpStatus: previous.httpStatus, response: previous.result };
    }

    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(
      eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId),
      eq(offlineWorkspaceSnapshots.terminalId, terminal.id),
      eq(offlineWorkspaceSnapshots.businessId, business.id),
      eq(offlineWorkspaceSnapshots.dataset, "customers"),
      eq(offlineWorkspaceSnapshots.revision, command.baseRevision),
    )).for("update");

    const record = async (state: "applied" | "conflict" | "rejected", httpStatus: 200 | 409 | 422, error = "", receipt = "") => {
      const response = { commandId: command.id, state, receipt, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({
        id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy,
        module: "customers", action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>,
        state, httpStatus, error, receipt, result: response,
      });
      return { httpStatus, response };
    };

    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "نسخهٔ مشتریان پیدا نشد یا منقضی شده است؛ پس از اتصال نسخهٔ تازه بگیرید");
    const snapshotCustomers = Array.isArray(snapshot.payload.customers) ? snapshot.payload.customers as Record<string, unknown>[] : [];

    if (command.action === "create") {
      const item = (command.payload as Extract<OfflineCustomerCommand["payload"], { customer: unknown }>).customer;
      if (snapshotCustomers.some((row) => row.phone === item.phone)) return record("conflict", 409, "این شماره در نسخهٔ محلی مشتریان موجود است؛ نام همان مشتری را ویرایش کنید");
      const [existingByPhone] = await tx.select({ id: customers.id, name: customers.name }).from(customers)
        .where(and(eq(customers.businessId, business.id), eq(customers.phone, item.phone))).for("update");
      if (existingByPhone) {
        if (existingByPhone.name === item.name) return record("applied", 200, "", String(existingByPhone.id));
        return record("conflict", 409, "این شماره پس از snapshot برای مشتری دیگری ثبت شده است؛ اطلاعات موجود را بررسی کنید");
      }
      const [created] = await tx.insert(customers).values({
        businessId: business.id, name: item.name, phone: item.phone, smsOptIn: false,
      }).onConflictDoNothing({ target: [customers.businessId, customers.phone] }).returning({ id: customers.id });
      if (!created) return record("conflict", 409, "این شماره هم‌زمان در سامانه ثبت شده است؛ نسخهٔ مشتریان را تازه کنید");
      return record("applied", 200, "", String(created.id));
    }

    const { customerId, patch } = command.payload as Extract<OfflineCustomerCommand["payload"], { customerId: number }>;
    const [current] = await tx.select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers).where(and(eq(customers.id, customerId), eq(customers.businessId, business.id))).for("update");
    const base = snapshotCustomers.find((row) => row.id === customerId);
    if (!current || !base) return record("conflict", 409, "مشتری در نسخهٔ مبنا یا سرور پیدا نشد؛ نسخهٔ تازه بگیرید");
    if (current.name !== base.name || current.phone !== base.phone) return record("conflict", 409, "اطلاعات مشتری از زمان دریافت نسخه تغییر کرده است؛ برای جلوگیری از بازنویسی، تغییر را بازبینی کنید");
    if (current.name === patch.name) return record("applied", 200, "", String(current.id));
    await tx.update(customers).set({ name: patch.name }).where(and(
      eq(customers.id, current.id), eq(customers.businessId, business.id), eq(customers.name, current.name), eq(customers.phone, current.phone),
    ));
    return record("applied", 200, "", String(current.id));
  });

  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, "error" in outcome.response && typeof outcome.response.error === "string" ? outcome.response.error : "همگام‌سازی تغییر مشتری انجام نشد");
  return outcome.response;
}

function parseOfflineOrderCommand(raw: unknown): OfflineOrderCommand {
  try {
    return parseOfflineOrderStatusCommand(raw);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "فرمان تغییر وضعیت سفارش معتبر نیست");
  }
}

export async function syncOfflineOrderStatusCommand(req: Request, raw: unknown) {
  const command = parseOfflineOrderCommand(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos")) throw new HttpError(403, "تغییر وضعیت آفلاین سفارش به مجوز صندوق نیاز دارد");
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان سفارش متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");

  const outcome = await db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این دستگاه لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id, settings: businesses.settings }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false))).for("update");
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.module !== "orders" || previous.payloadHash !== payloadHash) {
        return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسهٔ فرمان قبلاً با محتوای دیگری ثبت شده است" } };
      }
      return { httpStatus: previous.httpStatus, response: previous.result };
    }

    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(
      eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId),
      eq(offlineWorkspaceSnapshots.terminalId, terminal.id),
      eq(offlineWorkspaceSnapshots.businessId, business.id),
      eq(offlineWorkspaceSnapshots.dataset, "orders"),
      eq(offlineWorkspaceSnapshots.revision, command.baseRevision),
    )).for("update");
    const record = async (state: "applied" | "conflict", httpStatus: 200 | 409, error = "", receipt = "") => {
      const response = { commandId: command.id, state, receipt, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({
        id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy,
        module: "orders", action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>,
        state, httpStatus, error, receipt, result: response,
      });
      return { httpStatus, response };
    };

    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "نسخهٔ سفارش‌ها پیدا نشد یا منقضی شده است؛ پس از اتصال نسخهٔ تازه بگیرید");
    const snapshotOrders = Array.isArray(snapshot.payload.orders) ? snapshot.payload.orders as Record<string, unknown>[] : [];
    const base = snapshotOrders.find((row) => row.id === command.payload.orderId);
    if (!base || base.status !== command.payload.expectedStatus || base.updatedAt !== command.payload.expectedUpdatedAt) {
      return record("conflict", 409, "وضعیت سفارش از زمان دریافت نسخه تغییر کرده است؛ نسخهٔ تازه را بررسی کنید");
    }

    const [current] = await tx.select({
      id: orders.id, status: orders.status, type: orders.type,
      updatedAt: sql<string>`to_char(${orders.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    }).from(orders).where(and(eq(orders.id, command.payload.orderId), eq(orders.businessId, business.id), isNull(orders.deletedAt))).for("update");
    if (!current || current.status !== command.payload.expectedStatus || current.updatedAt !== command.payload.expectedUpdatedAt) {
      return record("conflict", 409, "سفارش پیدا نشد یا هم‌زمان تغییر کرده است؛ تغییر محلی اعمال نشد");
    }

    const preset = settingsOf({ ...business, settings: activeBusiness.settings }).orderWorkflowPreset ?? 4;
    const [cashierConfirmation] = await tx.select().from(orderStatusEvents).where(and(
      eq(orderStatusEvents.businessId, business.id), eq(orderStatusEvents.orderId, current.id), eq(orderStatusEvents.kind, "cashier_confirmation"),
    )).for("update");
    if (command.action === "confirm_cashier") {
      if (preset !== 4 || command.payload.expectedStatus !== "pending" || base.cashierConfirmedAt || cashierConfirmation) {
        return record("conflict", 409, "تأیید صندوقدار دیگر لازم یا مجاز نیست؛ نسخهٔ تازه را بررسی کنید");
      }
      await tx.insert(orderStatusEvents).values({
        businessId: business.id, orderId: current.id, kind: "cashier_confirmation",
        fromValue: "pending", toValue: "confirmed", actorType: "offline_terminal", actorId: terminal.createdBy,
      });
      return record("applied", 200, "", String(current.id));
    }

    if (command.payload.expectedStatus === "pending" && preset === 4 && (!base.cashierConfirmedAt || !cashierConfirmation)) {
      return record("conflict", 409, "پیش از شروع آماده‌سازی، تأیید صندوقدار لازم است");
    }
    const expectedNext = nextOfflineOrderStatus(command.payload.expectedStatus);
    if (expectedNext !== command.payload.status) return record("conflict", 409, "گذار وضعیت سفارش دیگر معتبر نیست");
    if (command.payload.status === "served" && current.type === "delivery") return record("conflict", 409, "وضعیت تحویل سفارش‌های ارسال فقط از workflow پیک تغییر می‌کند");

    const now = new Date();
    const [updated] = await tx.update(orders).set({ status: command.payload.status, updatedAt: now })
      .where(and(eq(orders.id, current.id), eq(orders.businessId, business.id), eq(orders.status, current.status)))
      .returning({ id: orders.id, number: orders.number });
    if (!updated) return record("conflict", 409, "تغییر وضعیت سفارش هم‌زمان انجام شد؛ نسخهٔ تازه را بررسی کنید");
    // These helpers accept the shared database executor type; the transaction
    // object implements the same query surface and remains bound to this tx.
    const orderTx = tx as unknown as typeof db;
    await recordOrderEvents(orderTx, business.id, current.id, { order: [current.status, command.payload.status] }, "offline_terminal", terminal.createdBy);
    if (command.payload.status === "ready") {
      await queuePrintJobs(business, current.id, features, false, undefined, orderTx, "completed");
      if (hasAny(features, "foodcourt_pager")) await tx.update(pagers).set({ status: "ringing", ringRequestedAt: now, ringSentAt: null })
        .where(and(eq(pagers.businessId, business.id), eq(pagers.orderId, current.id)));
    }
    if (command.payload.status === "served" && hasAny(features, "foodcourt_pager")) {
      await tx.update(pagers).set({ status: "free", orderId: null })
        .where(and(eq(pagers.businessId, business.id), eq(pagers.orderId, current.id)));
    }
    return record("applied", 200, "", String(updated.id));
  });

  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, "error" in outcome.response && typeof outcome.response.error === "string" ? outcome.response.error : "تغییر وضعیت سفارش انجام نشد");
  return outcome.response;
}

type StaffCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "staff";
  action: "create_shift" | "leave_request" | "shift_change" | "mark_absent" | "decide_leave" | "decide_shift_swap";
  baseDataset: "shifts";
  baseSnapshotId: string;
  baseRevision: number;
  payload: Record<string, unknown>;
};

function parseStaffCommand(raw: unknown): StaffCommand {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.module !== "staff" || !["create_shift", "leave_request", "shift_change", "mark_absent", "decide_leave", "decide_shift_swap"].includes(String(raw.action))) throw new HttpError(400, "قالب درخواست آفلاین کارکنان معتبر نیست");
  const allowedCommandKeys = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(raw).some((key) => !allowedCommandKeys.includes(key))) throw new HttpError(400, "فرمان کارکنان فیلد ناشناخته دارد");
  if (typeof raw.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.id)) throw new HttpError(400, "شناسهٔ درخواست معتبر نیست");
  if (!Number.isSafeInteger(raw.businessId) || Number(raw.businessId) < 1 || raw.baseDataset !== "shifts" || typeof raw.baseSnapshotId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.baseSnapshotId) || !Number.isSafeInteger(raw.baseRevision) || Number(raw.baseRevision) < 1 || !isRecord(raw.payload)) throw new HttpError(400, "شناسه یا نسخهٔ مبنای درخواست کارکنان معتبر نیست");
  const payload = raw.payload;
  if (raw.action === "create_shift") {
    if (Object.keys(payload).some((key) => !["staffId", "startsAt", "endsAt", "location"].includes(key)) || !Number.isSafeInteger(payload.staffId) || Number(payload.staffId) < 1 || !isIsoTimestamp(payload.startsAt) || !isIsoTimestamp(payload.endsAt) || Date.parse(payload.endsAt) <= Date.parse(payload.startsAt) || Date.parse(payload.endsAt) - Date.parse(payload.startsAt) > 24 * 60 * 60_000 || typeof payload.location !== "string" || payload.location.length > 100) throw new HttpError(400, "اطلاعات شیفت جدید معتبر نیست");
  } else if (raw.action === "leave_request") {
    if (Object.keys(payload).some((key) => !["staffId", "startsAt", "endsAt", "kind", "reason"].includes(key)) || !Number.isSafeInteger(payload.staffId) || Number(payload.staffId) < 1 || !isIsoTimestamp(payload.startsAt) || !isIsoTimestamp(payload.endsAt) || Date.parse(payload.endsAt) <= Date.parse(payload.startsAt) || Date.parse(payload.endsAt) - Date.parse(payload.startsAt) > 31 * 86_400_000 || !["personal", "sick", "unpaid"].includes(String(payload.kind)) || typeof payload.reason !== "string" || payload.reason.length > 500) throw new HttpError(400, "اطلاعات درخواست مرخصی معتبر نیست");
  } else if (raw.action === "mark_absent") {
    if (Object.keys(payload).some((key) => !["scheduleId", "expectedVersion", "expectedUpdatedAt", "note"].includes(key)) || !Number.isSafeInteger(payload.scheduleId) || Number(payload.scheduleId) < 1 || !Number.isSafeInteger(payload.expectedVersion) || Number(payload.expectedVersion) < 1 || !isIsoTimestamp(payload.expectedUpdatedAt) || typeof payload.note !== "string" || payload.note.length > 300) throw new HttpError(400, "اطلاعات ثبت غیبت آفلاین معتبر نیست");
  } else if (raw.action === "decide_leave") {
    if (Object.keys(payload).some((key) => !["requestId", "decision", "expectedStartsAt", "expectedEndsAt", "note"].includes(key)) || !Number.isSafeInteger(payload.requestId) || Number(payload.requestId) < 1 || !["approve", "reject"].includes(String(payload.decision)) || !isIsoTimestamp(payload.expectedStartsAt) || !isIsoTimestamp(payload.expectedEndsAt) || Date.parse(payload.expectedEndsAt) <= Date.parse(payload.expectedStartsAt) || typeof payload.note !== "string" || payload.note.length > 300) throw new HttpError(400, "اطلاعات تصمیم مرخصی آفلاین معتبر نیست");
  } else if (raw.action === "decide_shift_swap") {
    if (Object.keys(payload).some((key) => !["requestId", "decision", "scheduleId", "expectedScheduleVersion", "expectedScheduleUpdatedAt", "expectedFromStaffId", "expectedToStaffId", "note"].includes(key)) || !Number.isSafeInteger(payload.requestId) || Number(payload.requestId) < 1 || !["approve", "reject"].includes(String(payload.decision)) || !Number.isSafeInteger(payload.scheduleId) || Number(payload.scheduleId) < 1 || !Number.isSafeInteger(payload.expectedScheduleVersion) || Number(payload.expectedScheduleVersion) < 1 || !isIsoTimestamp(payload.expectedScheduleUpdatedAt) || !Number.isSafeInteger(payload.expectedFromStaffId) || Number(payload.expectedFromStaffId) < 1 || !Number.isSafeInteger(payload.expectedToStaffId) || Number(payload.expectedToStaffId) < 1 || payload.expectedFromStaffId === payload.expectedToStaffId || typeof payload.note !== "string" || payload.note.length > 300) throw new HttpError(400, "اطلاعات تصمیم تعویض شیفت آفلاین معتبر نیست");
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
      const ledgerPayload = command.action === "create_shift" ? command : { ...command, payload: { ...command.payload, reason: "", note: "" } };
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
    if (command.action === "decide_leave") {
      const requestId = Number(command.payload.requestId);
      const baseRequests = (snapshot.payload.leaveRequests as Record<string, unknown>[] | undefined) ?? [];
      const base = baseRequests.find((row) => row.id === requestId);
      if (!base || base.status !== "pending" || base.startsAt !== command.payload.expectedStartsAt || base.endsAt !== command.payload.expectedEndsAt) {
        return record("conflict", 409, "درخواست مرخصی با نسخهٔ ذخیره‌شده هم‌خوان نیست؛ نسخهٔ تازه را دریافت و دوباره بررسی کنید");
      }
      const [leave] = await tx.select().from(staffLeaveRequests).where(and(
        eq(staffLeaveRequests.id, requestId), eq(staffLeaveRequests.businessId, business.id),
      )).for("update");
      if (!leave || leave.status !== "pending" || leave.startsAt.toISOString() !== command.payload.expectedStartsAt || leave.endsAt.toISOString() !== command.payload.expectedEndsAt || leave.staffId !== Number(base.staffId)) {
        return record("conflict", 409, "درخواست مرخصی در سرور تغییر کرده یا دیگر در انتظار بررسی نیست");
      }
      const [member] = await tx.select({ id: staff.id, isActive: staff.isActive }).from(staff).where(and(
        eq(staff.id, leave.staffId), eq(staff.businessId, business.id),
      )).for("update");
      if (command.payload.decision === "approve" && !member?.isActive) return record("conflict", 409, "کارمند درخواست‌دهنده حذف یا غیرفعال شده است");
      if (command.payload.decision === "approve") {
        const [overlap] = await tx.select({ id: staffLeaveRequests.id }).from(staffLeaveRequests).where(and(
          eq(staffLeaveRequests.businessId, business.id), eq(staffLeaveRequests.staffId, leave.staffId),
          eq(staffLeaveRequests.status, "approved"), ne(staffLeaveRequests.id, leave.id),
          lt(staffLeaveRequests.startsAt, leave.endsAt), gt(staffLeaveRequests.endsAt, leave.startsAt),
        )).limit(1);
        if (overlap) return record("conflict", 409, "درخواست با مرخصی تأییدشدهٔ دیگری تداخل دارد");
        const [shift] = await tx.select({ id: staffSchedules.id }).from(staffSchedules).where(and(
          eq(staffSchedules.businessId, business.id), eq(staffSchedules.staffId, leave.staffId),
          eq(staffSchedules.status, "scheduled"), lt(staffSchedules.startsAt, leave.endsAt), gt(staffSchedules.endsAt, leave.startsAt),
        )).limit(1);
        if (shift) return record("conflict", 409, "در بازهٔ مرخصی برای کارمند شیفت فعال ثبت شده است");
      }
      const now = new Date();
      const [updated] = await tx.update(staffLeaveRequests).set({
        status: command.payload.decision === "approve" ? "approved" : "rejected",
        decidedBy: terminal.createdBy, decidedAt: now, decisionNote: String(command.payload.note).trim().slice(0, 300),
      }).where(and(
        eq(staffLeaveRequests.id, leave.id), eq(staffLeaveRequests.businessId, business.id), eq(staffLeaveRequests.status, "pending"),
      )).returning({ id: staffLeaveRequests.id });
      if (!updated) return record("conflict", 409, "درخواست مرخصی هم‌زمان تغییر کرده است");
      return record("applied", 200, "", randomUUID(), { requestId: updated.id, decision: command.payload.decision });
    }
    if (command.action === "decide_shift_swap") {
      const requestId = Number(command.payload.requestId);
      const baseRequests = (snapshot.payload.shiftSwapRequests as Record<string, unknown>[] | undefined) ?? [];
      const base = baseRequests.find((row) => row.id === requestId);
      if (!base || base.status !== "pending_manager" || base.scheduleId !== command.payload.scheduleId || base.fromStaffId !== command.payload.expectedFromStaffId || base.toStaffId !== command.payload.expectedToStaffId || base.scheduleVersion !== command.payload.expectedScheduleVersion || base.scheduleUpdatedAt !== command.payload.expectedScheduleUpdatedAt || base.scheduleStatus !== "scheduled" || base.scheduleStaffId !== command.payload.expectedFromStaffId) {
        return record("conflict", 409, "درخواست تعویض با نسخهٔ ذخیره‌شده هم‌خوان نیست؛ نسخهٔ تازه را دریافت و دوباره بررسی کنید");
      }
      const [request] = await tx.select().from(staffShiftSwapRequests).where(and(
        eq(staffShiftSwapRequests.id, requestId), eq(staffShiftSwapRequests.businessId, business.id),
      )).for("update");
      if (!request || request.status !== "pending_manager" || request.scheduleId !== Number(command.payload.scheduleId) || request.fromStaffId !== Number(command.payload.expectedFromStaffId) || request.toStaffId !== Number(command.payload.expectedToStaffId)) {
        return record("conflict", 409, "درخواست تعویض در سرور تغییر کرده یا دیگر در انتظار تأیید مدیر نیست");
      }
      if (command.payload.decision === "reject") {
        const [updated] = await tx.update(staffShiftSwapRequests).set({
          status: "rejected", decisionNote: String(command.payload.note).trim().slice(0, 300), decidedBy: terminal.createdBy, decidedAt: new Date(),
        }).where(and(
          eq(staffShiftSwapRequests.id, request.id), eq(staffShiftSwapRequests.businessId, business.id), eq(staffShiftSwapRequests.status, "pending_manager"),
        )).returning({ id: staffShiftSwapRequests.id });
        if (!updated) return record("conflict", 409, "درخواست تعویض هم‌زمان تغییر کرده است");
        return record("applied", 200, "", randomUUID(), { requestId: updated.id, decision: command.payload.decision });
      }
      const [shift] = await tx.select().from(staffSchedules).where(and(
        eq(staffSchedules.id, request.scheduleId), eq(staffSchedules.businessId, business.id),
      )).for("update");
      if (!shift || shift.status !== "scheduled" || shift.staffId !== request.fromStaffId || shift.staffId !== Number(command.payload.expectedFromStaffId) || shift.version !== Number(command.payload.expectedScheduleVersion) || shift.updatedAt.toISOString() !== command.payload.expectedScheduleUpdatedAt || shift.startsAt.toISOString() !== base.startsAt || shift.endsAt.toISOString() !== base.endsAt) {
        return record("conflict", 409, "شیفت از زمان دریافت نسخه تغییر کرده است؛ نسخهٔ تازه را دریافت و دوباره بررسی کنید");
      }
      if (shift.startsAt <= new Date()) return record("rejected", 422, "شیفت شروع شده یا گذشته است و دیگر قابل جابه‌جایی نیست");
      const lockedStaff = await tx.select({ id: staff.id, isActive: staff.isActive }).from(staff).where(and(
        eq(staff.businessId, business.id), inArray(staff.id, [request.fromStaffId, request.toStaffId]),
      )).orderBy(asc(staff.id)).for("update");
      if (lockedStaff.length !== 2 || lockedStaff.some((member) => !member.isActive)) return record("conflict", 409, "هر دو کارمند باید همچنان فعال باشند");
      const [overlap] = await tx.select({ id: staffSchedules.id }).from(staffSchedules).where(and(
        eq(staffSchedules.businessId, business.id), eq(staffSchedules.staffId, request.toStaffId),
        eq(staffSchedules.status, "scheduled"), ne(staffSchedules.id, shift.id),
        lt(staffSchedules.startsAt, shift.endsAt), gt(staffSchedules.endsAt, shift.startsAt),
      )).limit(1);
      if (overlap) return record("conflict", 409, "کارمند مقصد در این بازه شیفت دیگری دارد");
      const [leave] = await tx.select({ id: staffLeaveRequests.id }).from(staffLeaveRequests).where(and(
        eq(staffLeaveRequests.businessId, business.id), eq(staffLeaveRequests.staffId, request.toStaffId),
        eq(staffLeaveRequests.status, "approved"), lt(staffLeaveRequests.startsAt, shift.endsAt), gt(staffLeaveRequests.endsAt, shift.startsAt),
      )).limit(1);
      if (leave) return record("conflict", 409, "کارمند مقصد برای این بازه مرخصی تأییدشده دارد");
      const now = new Date();
      const [updatedShift] = await tx.update(staffSchedules).set({
        staffId: request.toStaffId, version: sql`${staffSchedules.version} + 1`, updatedBy: terminal.createdBy, updatedAt: now,
      }).where(and(
        eq(staffSchedules.id, shift.id), eq(staffSchedules.businessId, business.id), eq(staffSchedules.staffId, request.fromStaffId),
        eq(staffSchedules.status, "scheduled"), eq(staffSchedules.version, shift.version),
      )).returning({ id: staffSchedules.id });
      if (!updatedShift) return record("conflict", 409, "شیفت هم‌زمان تغییر کرده است؛ نسخهٔ تازه را دریافت کنید");
      const [updated] = await tx.update(staffShiftSwapRequests).set({
        status: "approved", decisionNote: String(command.payload.note).trim().slice(0, 300), decidedBy: terminal.createdBy, decidedAt: now,
      }).where(and(
        eq(staffShiftSwapRequests.id, request.id), eq(staffShiftSwapRequests.businessId, business.id), eq(staffShiftSwapRequests.status, "pending_manager"),
      )).returning({ id: staffShiftSwapRequests.id });
      if (!updated) throw new HttpError(409, "درخواست تعویض هم‌زمان تغییر کرده است؛ تراکنش جابه‌جایی لغو شد");
      return record("applied", 200, "", randomUUID(), { requestId: updated.id, scheduleId: updatedShift.id, decision: command.payload.decision });
    }
    if (command.action === "mark_absent") {
      const scheduleId = Number(command.payload.scheduleId);
      const snapshotSchedules = (snapshot.payload.schedules as Record<string, unknown>[] | undefined) ?? [];
      const baseShift = snapshotSchedules.find((row) => row.id === scheduleId);
      if (!baseShift || baseShift.status !== "scheduled" || baseShift.version !== command.payload.expectedVersion || baseShift.updatedAt !== command.payload.expectedUpdatedAt) {
        return record("conflict", 409, "شیفت از زمان دریافت نسخه تغییر کرده است؛ برنامه را تازه کنید و غیبت را بازبینی کنید");
      }
      const [shift] = await tx.select().from(staffSchedules)
        .where(and(eq(staffSchedules.id, scheduleId), eq(staffSchedules.businessId, business.id))).for("update");
      if (!shift || shift.status !== "scheduled" || shift.version !== Number(command.payload.expectedVersion) || shift.updatedAt.toISOString() !== command.payload.expectedUpdatedAt || shift.startsAt.toISOString() !== baseShift.startsAt) {
        return record("conflict", 409, "شیفت روی سرور تغییر کرده است؛ برنامه را تازه کنید و نتیجه را بررسی کنید");
      }
      const now = new Date();
      if (shift.startsAt > now) return record("rejected", 422, "غیبت فقط پس از شروع شیفت قابل ثبت است");
      const [attendance] = await tx.select({ checkInAt: staffAttendanceRecords.checkInAt, checkOutAt: staffAttendanceRecords.checkOutAt })
        .from(staffAttendanceRecords).where(and(eq(staffAttendanceRecords.businessId, business.id), eq(staffAttendanceRecords.scheduleId, scheduleId))).limit(1);
      if (attendance?.checkInAt || attendance?.checkOutAt) return record("conflict", 409, "برای این شیفت حضور در سامانه ثبت شده است؛ غیبت ثبت نشد");
      const [attendanceRequest] = await tx.select({ id: offlineStaffAttendanceRequests.id })
        .from(offlineStaffAttendanceRequests).where(and(
          eq(offlineStaffAttendanceRequests.businessId, business.id), eq(offlineStaffAttendanceRequests.scheduleId, scheduleId),
          inArray(offlineStaffAttendanceRequests.status, ["pending", "approved"]),
        )).limit(1);
      if (attendanceRequest) return record("conflict", 409, "درخواست حضور این شیفت هنوز تعیین‌تکلیف نشده است؛ غیبت ثبت نشد");
      const note = String(command.payload.note).trim().slice(0, 300);
      const [updated] = await tx.update(staffSchedules).set({
        status: "absent", absenceNote: note, absenceRecordedBy: terminal.createdBy, absenceRecordedAt: now,
        version: sql`${staffSchedules.version} + 1`, updatedBy: terminal.createdBy, updatedAt: now,
      }).where(and(
        eq(staffSchedules.id, scheduleId), eq(staffSchedules.businessId, business.id),
        eq(staffSchedules.status, "scheduled"), eq(staffSchedules.version, shift.version),
      )).returning({ id: staffSchedules.id });
      if (!updated) return record("conflict", 409, "شیفت هم‌زمان تغییر کرده است؛ برنامه را تازه کنید");
      return record("applied", 200, "", String(updated.id));
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
