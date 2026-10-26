import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, inventoryItems, offlineTerminals, offlineWorkspaceCommands, offlineWorkspaceSnapshots, suppliers, users } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { ensureAccounting } from "@/lib/accounting";
import { offlineAuth } from "@/lib/offline-pos";
import { hasAny } from "@/lib/plans";
import { allocateStockValue, stockReceiptTotal } from "@/lib/stock-receipt-totals";
import { applyStockReceipt } from "@/lib/stock-receipts";
import { isWasteReason } from "@/lib/stock-waste";

type InventoryWasteCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "inventory";
  action: "waste";
  baseDataset: "inventory";
  baseSnapshotId: string;
  baseRevision: number;
  payload: {
    itemId: number;
    quantity: number;
    expectedStock: number;
    expectedCostPerUnit?: number;
    wasteReason: string;
    note: string;
    occurredAt: string;
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;
const STOCK_EPSILON = 1e-9;
const moneyValue = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000_000;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function parseCommand(raw: unknown): InventoryWasteCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "فرمان ضایعات آفلاین معتبر نیست");
  const command = raw as Record<string, unknown>;
  const allowed = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(command).some((key) => !allowed.includes(key))) throw new HttpError(400, "فرمان ضایعات فیلد ناشناخته دارد");
  if (command.schemaVersion !== 1 || command.module !== "inventory" || command.action !== "waste" || command.baseDataset !== "inventory") throw new HttpError(400, "نسخه یا نوع فرمان ضایعات پشتیبانی نمی‌شود");
  if (typeof command.id !== "string" || !UUID.test(command.id) || !Number.isSafeInteger(command.businessId) || Number(command.businessId) < 1) throw new HttpError(400, "شناسهٔ فرمان یا کسب‌وکار معتبر نیست");
  if (typeof command.baseSnapshotId !== "string" || !UUID.test(command.baseSnapshotId) || !Number.isSafeInteger(command.baseRevision) || Number(command.baseRevision) < 1) throw new HttpError(400, "نسخهٔ مبنای موجودی معتبر نیست");
  if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) throw new HttpError(400, "اطلاعات ضایعات معتبر نیست");
  const payload = command.payload as Record<string, unknown>;
  const payloadKeys = ["itemId", "quantity", "expectedStock", "expectedCostPerUnit", "wasteReason", "note", "occurredAt"];
  if (Object.keys(payload).some((key) => !payloadKeys.includes(key))) throw new HttpError(400, "اطلاعات ضایعات فیلد ناشناخته دارد");
  if (!Number.isSafeInteger(payload.itemId) || Number(payload.itemId) < 1) throw new HttpError(400, "کالای ضایعات معتبر نیست");
  if (typeof payload.quantity !== "number" || !Number.isFinite(payload.quantity) || payload.quantity <= 0 || payload.quantity > 1_000_000_000) throw new HttpError(400, "مقدار ضایعات نامعتبر است");
  if (typeof payload.expectedStock !== "number" || !Number.isFinite(payload.expectedStock) || payload.expectedStock < payload.quantity || payload.expectedStock > 1_000_000_000) throw new HttpError(400, "موجودی مبنای ضایعات نامعتبر است");
  if (payload.expectedCostPerUnit !== undefined && (!Number.isSafeInteger(payload.expectedCostPerUnit) || Number(payload.expectedCostPerUnit) < 0 || Number(payload.expectedCostPerUnit) > 2_147_483_647)) throw new HttpError(400, "بهای مبنای ضایعات نامعتبر است");
  if (!isWasteReason(payload.wasteReason)) throw new HttpError(400, "دلیل ضایعات معتبر نیست");
  if (typeof payload.note !== "string" || payload.note.length > 600 || [...payload.note].length > 300) throw new HttpError(400, "توضیح ضایعات بیش از حد طولانی است");
  if (typeof payload.occurredAt !== "string" || payload.occurredAt.length > 40 || !RFC3339.test(payload.occurredAt) || !Number.isFinite(Date.parse(payload.occurredAt))) throw new HttpError(400, "زمان ضایعات معتبر نیست");
  return raw as InventoryWasteCommand;
}

export async function syncOfflineInventoryWaste(req: Request, raw: unknown) {
  const command = parseCommand(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "inventory") || !hasAny(features, "stock_movements")) {
    throw new HttpError(403, "صندوق آفلاین، انبار و گردش انبار باید در اشتراک فعال باشند");
  }
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان ضایعات متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");
  await ensureAccounting(business);

  const outcome = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این دستگاه لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.payloadHash !== payloadHash) {
        return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسه فرمان قبلاً با محتوای دیگری ثبت شده است" } };
      }
      return { httpStatus: previous.httpStatus, response: previous.result };
    }

    const record = async (state: "applied" | "conflict" | "rejected", httpStatus: 200 | 409 | 422, error = "", receipt = "") => {
      const response = { commandId: command.id, state, receipt, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({
        id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy,
        module: command.module, action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>,
        state, httpStatus, error, receipt, result: response,
      });
      return { httpStatus, response };
    };

    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(
      eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId), eq(offlineWorkspaceSnapshots.terminalId, terminal.id),
      eq(offlineWorkspaceSnapshots.businessId, business.id), eq(offlineWorkspaceSnapshots.dataset, "inventory"),
      eq(offlineWorkspaceSnapshots.revision, command.baseRevision),
    )).for("update");
    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "نسخهٔ موجودی مبنا منقضی شده یا پیدا نمی‌شود؛ snapshot تازه دریافت کنید");
    const occurredAt = new Date(command.payload.occurredAt);
    const serverNow = Date.now();
    if (occurredAt.getTime() > serverNow + 5 * 60_000 || occurredAt.getTime() < snapshot.issuedAt.getTime() - 5 * 60_000) {
      return record("rejected", 422, "زمان ثبت دستگاه با بازهٔ نسخهٔ محلی سازگار نیست");
    }
    const baseItems = Array.isArray(snapshot.payload.items) ? snapshot.payload.items as Record<string, unknown>[] : [];
    const baseItem = baseItems.find((item) => item.id === command.payload.itemId);
    if (!baseItem || baseItem.isActive !== true || baseItem.trackStock !== true) return record("conflict", 409, "کالا در نسخهٔ مبنای انبار فعال و قابل ردیابی نیست");
    const baseStock = Number(baseItem.stock);
    if (!Number.isFinite(baseStock) || command.payload.expectedStock > baseStock + STOCK_EPSILON) return record("rejected", 422, "موجودی مبنای ضایعات از snapshot بیشتر است");

    await tx.execute(sql`select pg_advisory_xact_lock(${business.id})`);
    const [item] = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.id, command.payload.itemId), eq(inventoryItems.businessId, business.id))).for("update");
    if (!item || !item.isActive || !item.trackStock) return record("conflict", 409, "کالا در سرور حذف، غیرفعال یا از ردیابی موجودی خارج شده است");
    if (Math.abs(item.costPerUnit - Number(command.payload.expectedCostPerUnit ?? baseItem.costPerUnit)) > 0 || Math.abs(item.stock - command.payload.expectedStock) > STOCK_EPSILON) {
      return record("conflict", 409, "موجودی یا بهای کالا پس از دریافت نسخه تغییر کرده است؛ موجودی تازه را بررسی کنید");
    }
    const [issuer] = await tx.select({ name: users.name }).from(users).where(eq(users.id, terminal.createdBy));
    const result = await applyStockReceipt(tx, business, {
      type: "waste",
      requestKey: command.id,
      date: occurredAt,
      lines: [{ itemId: item.id, quantity: command.payload.quantity }],
      wasteReason: command.payload.wasteReason,
      note: command.payload.note,
    }, issuer?.name ?? "صندوق آفلاین");
    return record("applied", 200, "", String(result.receipt.id));
  }, { isolationLevel: "repeatable read" });

  if (outcome.httpStatus !== 200) {
    const error = typeof outcome.response.error === "string" ? outcome.response.error : "فرمان ضایعات آفلاین اعمال نشد";
    throw new HttpError(outcome.httpStatus, error);
  }
  return outcome.response;
}

type InventoryMovementCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "inventory";
  action: "movement";
  baseDataset: "inventory";
  baseSnapshotId: string;
  baseRevision: number;
  payload: {
    type: "out" | "adjust";
    itemId: number;
    quantity: number;
    expectedStock: number;
    expectedCostPerUnit: number;
    note: string;
    occurredAt: string;
  };
};

function parseInventoryMovement(raw: unknown): InventoryMovementCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "فرمان گردش آفلاین معتبر نیست");
  const command = raw as Record<string, unknown>;
  const allowed = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(command).some((key) => !allowed.includes(key)) || command.schemaVersion !== 1 || command.module !== "inventory" || command.action !== "movement" || command.baseDataset !== "inventory") throw new HttpError(400, "نسخه یا نوع فرمان گردش پشتیبانی نمی‌شود");
  if (typeof command.id !== "string" || !UUID.test(command.id) || !Number.isSafeInteger(command.businessId) || Number(command.businessId) < 1 || typeof command.baseSnapshotId !== "string" || !UUID.test(command.baseSnapshotId) || !Number.isSafeInteger(command.baseRevision) || Number(command.baseRevision) < 1) throw new HttpError(400, "شناسهٔ فرمان یا snapshot انبار معتبر نیست");
  if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) throw new HttpError(400, "اطلاعات گردش معتبر نیست");
  const payload = command.payload as Record<string, unknown>;
  const payloadKeys = ["type", "itemId", "quantity", "expectedStock", "expectedCostPerUnit", "note", "occurredAt"];
  const proposedDelta = payload.type === "out" ? Number(payload.quantity) : Number(payload.quantity) - Number(payload.expectedStock);
  const extendedCost = Math.abs(proposedDelta) * Number(payload.expectedCostPerUnit);
  if (Object.keys(payload).some((key) => !payloadKeys.includes(key)) || !["out", "adjust"].includes(String(payload.type)) || !Number.isSafeInteger(payload.itemId) || Number(payload.itemId) < 1 || typeof payload.quantity !== "number" || !Number.isFinite(payload.quantity) || payload.quantity < 0 || payload.quantity > 1_000_000_000 || (payload.type === "out" && payload.quantity <= 0) || typeof payload.expectedStock !== "number" || !Number.isFinite(payload.expectedStock) || payload.expectedStock < 0 || payload.expectedStock > 1_000_000_000 || (payload.type === "out" && payload.quantity > payload.expectedStock + STOCK_EPSILON) || !moneyValue(payload.expectedCostPerUnit) || payload.expectedCostPerUnit > 2_147_483_647 || !Number.isFinite(extendedCost) || extendedCost > 1_000_000_000_000 || typeof payload.note !== "string" || payload.note.length > 600 || [...payload.note].length > 300 || typeof payload.occurredAt !== "string" || payload.occurredAt.length > 40 || !RFC3339.test(payload.occurredAt) || !Number.isFinite(Date.parse(payload.occurredAt))) throw new HttpError(400, "مقدار، نوع یا وضعیت مبنای گردش معتبر نیست");
  return raw as InventoryMovementCommand;
}

export async function syncOfflineInventoryMovement(req: Request, raw: unknown) {
  const command = parseInventoryMovement(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "inventory") || !hasAny(features, "stock_movements")) throw new HttpError(403, "صندوق آفلاین، انبار و گردش انبار باید در اشتراک فعال باشند");
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان گردش متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");
  await ensureAccounting(business);

  const outcome = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این دستگاه لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");
    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.payloadHash !== payloadHash) return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسهٔ فرمان قبلاً با محتوای دیگری ثبت شده است" } };
      return { httpStatus: previous.httpStatus, response: previous.result };
    }
    const record = async (state: "applied" | "conflict" | "rejected", httpStatus: 200 | 409 | 422, error = "", receipt = "") => {
      const response = { commandId: command.id, state, receipt, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({ id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy, module: command.module, action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>, state, httpStatus, error, receipt, result: response });
      return { httpStatus, response };
    };
    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(
      eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId), eq(offlineWorkspaceSnapshots.terminalId, terminal.id),
      eq(offlineWorkspaceSnapshots.businessId, business.id), eq(offlineWorkspaceSnapshots.dataset, "inventory"),
      eq(offlineWorkspaceSnapshots.revision, command.baseRevision),
    )).for("update");
    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "نسخهٔ موجودی مبنا منقضی شده یا پیدا نمی‌شود؛ snapshot تازه دریافت کنید");
    const occurredAt = new Date(command.payload.occurredAt);
    if (occurredAt.getTime() > Date.now() + 5 * 60_000 || occurredAt.getTime() < snapshot.issuedAt.getTime() - 5 * 60_000) return record("rejected", 422, "زمان ثبت دستگاه با بازهٔ نسخهٔ محلی سازگار نیست");
    const baseItems = Array.isArray(snapshot.payload.items) ? snapshot.payload.items as Record<string, unknown>[] : [];
    const baseItem = baseItems.find((item) => item.id === command.payload.itemId);
    if (!baseItem || baseItem.isActive !== true || baseItem.trackStock !== true) return record("conflict", 409, "کالا در نسخهٔ مبنای انبار فعال و قابل ردیابی نیست");
    await tx.execute(sql`select pg_advisory_xact_lock(${business.id})`);
    const [item] = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.id, command.payload.itemId), eq(inventoryItems.businessId, business.id))).for("update");
    if (!item || !item.isActive || !item.trackStock) return record("conflict", 409, "کالا در سرور حذف، غیرفعال یا از ردیابی موجودی خارج شده است");
    if (Math.abs(item.stock - command.payload.expectedStock) > STOCK_EPSILON || item.costPerUnit !== command.payload.expectedCostPerUnit) return record("conflict", 409, "موجودی یا بهای کالا پس از دریافت نسخه تغییر کرده است؛ اطلاعات تازه را بررسی کنید");
    if (command.payload.type === "out" && command.payload.quantity > item.stock + STOCK_EPSILON) return record("conflict", 409, "موجودی فعلی برای این خروج کافی نیست؛ موجودی تازه را بررسی کنید");
    if (command.payload.type === "adjust" && Math.abs(command.payload.quantity - item.stock) <= STOCK_EPSILON) return record("rejected", 422, "موجودی شمارش‌شده با موجودی فعلی تفاوتی ندارد");
    const [issuer] = await tx.select({ name: users.name }).from(users).where(eq(users.id, terminal.createdBy));
    const result = await applyStockReceipt(tx, business, {
      type: command.payload.type, requestKey: command.id, date: occurredAt,
      note: command.payload.note, lines: [{ itemId: item.id, quantity: command.payload.quantity }],
    }, issuer?.name ?? "صندوق آفلاین");
    return record("applied", 200, "", String(result.receipt.id));
  }, { isolationLevel: "repeatable read" });
  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, typeof outcome.response.error === "string" ? outcome.response.error : "گردش انبار آفلاین اعمال نشد");
  return outcome.response;
}

type InventoryReceiveCommand = {
  schemaVersion: 1; id: string; businessId: number; module: "inventory"; action: "receive";
  baseDataset: "inventory"; baseSnapshotId: string; baseRevision: number;
  payload: {
    occurredAt: string; invoiceNo: string; supplierId: number | null; note: string;
    discount: number; extraCost: number; shippingCost: number; taxAmount: number; total: number; paidAmount: number;
    payFrom: "cash" | "bank" | "payable";
    lines: { itemId: number; quantity: number; unitCost: number; expectedStock: number; expectedCostPerUnit: number; allocatedAmount: number; resultCostPerUnit: number }[];
  };
};

function parseInventoryReceive(raw: unknown): InventoryReceiveCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "فرمان ورود انبار آفلاین معتبر نیست");
  const command = raw as Record<string, unknown>;
  const allowed = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(command).some((key) => !allowed.includes(key)) || command.schemaVersion !== 1 || command.module !== "inventory" || command.action !== "receive" || command.baseDataset !== "inventory") throw new HttpError(400, "نسخه یا نوع فرمان ورود انبار پشتیبانی نمی‌شود");
  if (typeof command.id !== "string" || !UUID.test(command.id) || !Number.isSafeInteger(command.businessId) || Number(command.businessId) < 1 || typeof command.baseSnapshotId !== "string" || !UUID.test(command.baseSnapshotId) || !Number.isSafeInteger(command.baseRevision) || Number(command.baseRevision) < 1) throw new HttpError(400, "شناسهٔ فرمان یا snapshot انبار معتبر نیست");
  if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) throw new HttpError(400, "اطلاعات فاکتور ورود انبار معتبر نیست");
  const payload = command.payload as Record<string, unknown>;
  const keys = ["occurredAt", "invoiceNo", "supplierId", "note", "discount", "extraCost", "shippingCost", "taxAmount", "total", "paidAmount", "payFrom", "lines"];
  if (Object.keys(payload).some((key) => !keys.includes(key)) || typeof payload.occurredAt !== "string" || payload.occurredAt.length > 40 || !RFC3339.test(payload.occurredAt) || !Number.isFinite(Date.parse(payload.occurredAt)) || typeof payload.invoiceNo !== "string" || payload.invoiceNo.length > 40 || typeof payload.note !== "string" || [...payload.note].length > 300 || (payload.supplierId !== null && (!Number.isSafeInteger(payload.supplierId) || Number(payload.supplierId) < 1)) || !["cash", "bank", "payable"].includes(String(payload.payFrom)) || !moneyValue(payload.discount) || !moneyValue(payload.extraCost) || !moneyValue(payload.shippingCost) || !moneyValue(payload.taxAmount) || !moneyValue(payload.total) || !moneyValue(payload.paidAmount) || !Array.isArray(payload.lines) || payload.lines.length < 1 || payload.lines.length > 100) throw new HttpError(400, "اطلاعات فاکتور ورود انبار ناقص یا نامعتبر است");
  const seen = new Set<number>();
  for (const rawLine of payload.lines) {
    if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) throw new HttpError(400, "ردیف فاکتور نامعتبر است");
    const line = rawLine as Record<string, unknown>;
    const lineKeys = ["itemId", "quantity", "unitCost", "expectedStock", "expectedCostPerUnit", "allocatedAmount", "resultCostPerUnit"];
    if (Object.keys(line).some((key) => !lineKeys.includes(key)) || !Number.isSafeInteger(line.itemId) || Number(line.itemId) < 1 || seen.has(Number(line.itemId)) || typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 1_000_000_000 || !moneyValue(line.unitCost) || line.unitCost < 1 || line.unitCost > 1_000_000_000 || Math.round(line.quantity * line.unitCost) < 1 || typeof line.expectedStock !== "number" || !Number.isFinite(line.expectedStock) || line.expectedStock < 0 || line.expectedStock > 1_000_000_000 || !moneyValue(line.expectedCostPerUnit) || line.expectedCostPerUnit > 2_147_483_647 || !moneyValue(line.allocatedAmount) || !moneyValue(line.resultCostPerUnit) || line.resultCostPerUnit > 2_147_483_647) throw new HttpError(400, "مقدار، بهای خرید یا وضعیت مبنای ردیف فاکتور نامعتبر است");
    seen.add(Number(line.itemId));
  }
  return raw as InventoryReceiveCommand;
}

export async function syncOfflineInventoryReceive(req: Request, raw: unknown) {
  const command = parseInventoryReceive(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "inventory") || !hasAny(features, "stock_movements")) throw new HttpError(403, "صندوق آفلاین، انبار و گردش انبار باید در اشتراک فعال باشند");
  if (command.businessId !== business.id) throw new HttpError(403, "فاکتور متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");
  const payload = command.payload;
  const orderedLines = [...payload.lines].sort((left, right) => left.itemId - right.itemId);
  const subtotal = orderedLines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitCost), 0);
  let computedTotal: number;
  try { computedTotal = stockReceiptTotal(subtotal, payload.discount, payload.extraCost, payload.shippingCost, payload.taxAmount); }
  catch (error) { throw new HttpError(400, (error as Error).message); }
  if (computedTotal <= 0 || computedTotal !== payload.total || payload.discount > subtotal || payload.paidAmount > computedTotal || (payload.payFrom === "payable" && payload.paidAmount !== 0)) throw new HttpError(400, "جمع فاکتور یا مبلغ پرداختی با اقلام و هزینه‌ها سازگار نیست");
  const allocated = allocateStockValue(orderedLines.map((line) => Math.round(line.quantity * line.unitCost)), computedTotal);
  if (orderedLines.some((line, index) => allocated[index] !== line.allocatedAmount)) throw new HttpError(400, "تخصیص مالیات و هزینه‌ها به بهای کالا با محاسبهٔ سرور برابر نیست");
  if (payload.payFrom === "payable" && !payload.supplierId) throw new HttpError(400, "برای ثبت فاکتور نسیه، فروشنده را انتخاب کنید");
  await ensureAccounting(business);

  const outcome = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این دستگاه لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");
    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.payloadHash !== payloadHash) return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسهٔ فرمان قبلاً با محتوای دیگری ثبت شده است" } };
      return { httpStatus: previous.httpStatus, response: previous.result };
    }
    const record = async (state: "applied" | "conflict" | "rejected", httpStatus: 200 | 409 | 422, error = "", receipt = "", details: Record<string, unknown> = {}) => {
      const response = { commandId: command.id, state, receipt, ...details, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({ id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy, module: command.module, action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>, state, httpStatus, error, receipt, result: response });
      return { httpStatus, response };
    };
    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId), eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.businessId, business.id), eq(offlineWorkspaceSnapshots.dataset, "inventory"), eq(offlineWorkspaceSnapshots.revision, command.baseRevision))).for("update");
    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "نسخهٔ موجودی منقضی یا پیدا نمی‌شود؛ ابتدا snapshot تازه بگیرید");
    const occurredAt = new Date(payload.occurredAt);
    if (occurredAt.getTime() > Date.now() + 24 * 60 * 60_000 || occurredAt.getTime() < snapshot.issuedAt.getTime() - 7 * 86_400_000) return record("rejected", 422, "تاریخ فاکتور بیرون از بازهٔ مجاز نسخهٔ محلی است");
    const baseItems = Array.isArray(snapshot.payload.items) ? snapshot.payload.items as Record<string, unknown>[] : [];
    const baseSuppliers = Array.isArray(snapshot.payload.suppliers) ? snapshot.payload.suppliers as Record<string, unknown>[] : [];
    if (payload.supplierId !== null && !baseSuppliers.some((row) => row.id === payload.supplierId && row.isActive === true)) return record("conflict", 409, "فروشنده در نسخهٔ مبنا فعال نیست؛ اطلاعات انبار را تازه کنید");
    await tx.execute(sql`select pg_advisory_xact_lock(${business.id})`);
    const sortedLines = [...payload.lines].sort((left, right) => left.itemId - right.itemId);
    for (const line of sortedLines) {
      const baseItem = baseItems.find((row) => row.id === line.itemId);
      if (!baseItem || baseItem.isActive !== true || baseItem.trackStock !== true) return record("conflict", 409, "یکی از کالاها در snapshot موجودی فعال و قابل ردیابی نیست");
      const [item] = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.id, line.itemId), eq(inventoryItems.businessId, business.id))).for("update");
      if (!item || !item.isActive || !item.trackStock) return record("conflict", 409, "یکی از کالاها در سرور حذف، غیرفعال یا از ردیابی موجودی خارج شده است");
      if (Math.abs(item.stock - line.expectedStock) > STOCK_EPSILON || item.costPerUnit !== line.expectedCostPerUnit) return record("conflict", 409, `موجودی یا بهای «${item.name}» پس از دریافت نسخه تغییر کرده است؛ اطلاعات تازه را بررسی کنید`);
      const expectedCost = Math.round((Math.max(0, item.stock) * item.costPerUnit + line.allocatedAmount) / (item.stock + line.quantity));
      if (!Number.isSafeInteger(expectedCost) || expectedCost !== line.resultCostPerUnit || expectedCost > 2_147_483_647) return record("rejected", 422, `محاسبهٔ بهای میانگین «${item.name}» معتبر نیست`);
    }
    const [issuer] = await tx.select({ name: users.name }).from(users).where(eq(users.id, terminal.createdBy));
    const result = await applyStockReceipt(tx, business, {
      type: "in", requestKey: command.id, date: occurredAt, invoiceNo: payload.invoiceNo, supplierId: payload.supplierId ?? undefined,
      note: payload.note, discount: payload.discount, extraCost: payload.extraCost, shippingCost: payload.shippingCost,
      taxAmount: payload.taxAmount, total: payload.total, paidAmount: payload.paidAmount, payFrom: payload.payFrom,
      lines: payload.lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity, unitCost: line.unitCost })),
    }, issuer?.name ?? "صندوق آفلاین");
    return record("applied", 200, "", String(result.receipt.id), { receiptId: result.receipt.id, total: result.receipt.total, documentId: result.receipt.documentId });
  }, { isolationLevel: "repeatable read" });
  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, typeof outcome.response.error === "string" ? outcome.response.error : "فاکتور ورود آفلاین اعمال نشد");
  return outcome.response;
}
