import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, inventoryCategories, inventoryItems, offlineTerminals, offlineWorkspaceCommands, offlineWorkspaceSnapshots, stockMovements, stockTransferLines, stockTransfers, suppliers, users, warehouses } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { C, ensureAccounting, postDocumentInTransaction } from "@/lib/accounting";
import { offlineAuth } from "@/lib/offline-pos";
import { hasAny } from "@/lib/plans";
import { allocateStockValue, stockReceiptTotal } from "@/lib/stock-receipt-totals";
import { applyStockReceipt } from "@/lib/stock-receipts";
import { isWasteReason } from "@/lib/stock-waste";
import { recipeToStockFactor, validInventoryUnit } from "@/lib/inventory-units";

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

type InventoryTransferCommand = {
  schemaVersion: 1; id: string; businessId: number; module: "inventory"; action: "transfer";
  baseDataset: "inventory"; baseSnapshotId: string; baseRevision: number;
  payload: {
    intent: "request" | "approve" | "reject";
    note: string;
    occurredAt: string;
    lines?: { sourceItemId: number; destinationItemId: number; quantity: number }[];
    transferId?: number;
    expectedCreatedAt?: string;
    expectedItems?: { itemId: number; expectedStock: number; expectedCostPerUnit: number }[];
  };
};

function parseInventoryTransfer(raw: unknown): InventoryTransferCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "فرمان انتقال آفلاین معتبر نیست");
  const command = raw as Record<string, unknown>;
  const allowed = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(command).some((key) => !allowed.includes(key)) || command.schemaVersion !== 1 || command.module !== "inventory" || command.action !== "transfer" || command.baseDataset !== "inventory") throw new HttpError(400, "نسخه یا نوع فرمان انتقال پشتیبانی نمی‌شود");
  if (typeof command.id !== "string" || !UUID.test(command.id) || !Number.isSafeInteger(command.businessId) || Number(command.businessId) < 1 || typeof command.baseSnapshotId !== "string" || !UUID.test(command.baseSnapshotId) || !Number.isSafeInteger(command.baseRevision) || Number(command.baseRevision) < 1) throw new HttpError(400, "شناسهٔ فرمان یا snapshot انبار معتبر نیست");
  if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) throw new HttpError(400, "اطلاعات انتقال معتبر نیست");
  const payload = command.payload as Record<string, unknown>, commonKeys = ["intent", "note", "occurredAt"], requestKeys = [...commonKeys, "lines"], decisionKeys = [...commonKeys, "transferId", "expectedCreatedAt", "expectedItems"];
  if (!["request", "approve", "reject"].includes(String(payload.intent)) || typeof payload.note !== "string" || [...payload.note].length > 500 || typeof payload.occurredAt !== "string" || payload.occurredAt.length > 40 || !RFC3339.test(payload.occurredAt) || !Number.isFinite(Date.parse(payload.occurredAt))) throw new HttpError(400, "نوع، توضیح یا زمان انتقال معتبر نیست");
  if (payload.intent === "request") {
    if (Object.keys(payload).some((key) => !requestKeys.includes(key)) || !Array.isArray(payload.lines) || payload.lines.length < 1 || payload.lines.length > 100) throw new HttpError(400, "اقلام درخواست انتقال معتبر نیستند");
    const pairs = new Set<string>();
    for (const rawLine of payload.lines) {
      if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) throw new HttpError(400, "ردیف انتقال معتبر نیست");
      const line = rawLine as Record<string, unknown>, pair = `${line.sourceItemId}:${line.destinationItemId}`;
      if (Object.keys(line).some((key) => !["sourceItemId", "destinationItemId", "quantity"].includes(key)) || !Number.isSafeInteger(line.sourceItemId) || Number(line.sourceItemId) < 1 || !Number.isSafeInteger(line.destinationItemId) || Number(line.destinationItemId) < 1 || line.sourceItemId === line.destinationItemId || pairs.has(pair) || typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 1_000_000) throw new HttpError(400, "قلم یا مقدار انتقال معتبر نیست");
      pairs.add(pair);
    }
  } else {
    if (Object.keys(payload).some((key) => !decisionKeys.includes(key)) || !Number.isSafeInteger(payload.transferId) || Number(payload.transferId) < 1 || typeof payload.expectedCreatedAt !== "string" || payload.expectedCreatedAt.length > 40 || !RFC3339.test(payload.expectedCreatedAt) || !Number.isFinite(Date.parse(payload.expectedCreatedAt)) || !Array.isArray(payload.lines) || payload.lines.length < 1 || payload.lines.length > 100 || !Array.isArray(payload.expectedItems) || payload.expectedItems.length > 200) throw new HttpError(400, "تصمیم انتقال معتبر نیست");
    const pairs = new Set<string>();
    for (const rawLine of payload.lines) {
      if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) throw new HttpError(400, "ردیف تصمیم انتقال معتبر نیست");
      const line = rawLine as Record<string, unknown>, pair = `${line.sourceItemId}:${line.destinationItemId}`;
      if (Object.keys(line).some((key) => !["sourceItemId", "destinationItemId", "quantity"].includes(key)) || !Number.isSafeInteger(line.sourceItemId) || Number(line.sourceItemId) < 1 || !Number.isSafeInteger(line.destinationItemId) || Number(line.destinationItemId) < 1 || line.sourceItemId === line.destinationItemId || pairs.has(pair) || typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 1_000_000) throw new HttpError(400, "ردیف تصمیم انتقال معتبر نیست");
      pairs.add(pair);
    }
    const itemIds = new Set<number>();
    for (const rawItem of payload.expectedItems) {
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) throw new HttpError(400, "موجودی مورد انتظار انتقال معتبر نیست");
      const item = rawItem as Record<string, unknown>;
      if (Object.keys(item).some((key) => !["itemId", "expectedStock", "expectedCostPerUnit"].includes(key)) || !Number.isSafeInteger(item.itemId) || Number(item.itemId) < 1 || itemIds.has(Number(item.itemId)) || typeof item.expectedStock !== "number" || !Number.isFinite(item.expectedStock) || item.expectedStock < 0 || item.expectedStock > 1_000_000_000 || !moneyValue(item.expectedCostPerUnit) || item.expectedCostPerUnit > 2_147_483_647) throw new HttpError(400, "موجودی مورد انتظار انتقال معتبر نیست");
      itemIds.add(Number(item.itemId));
    }
  }
  return raw as InventoryTransferCommand;
}

export async function syncOfflineInventoryTransfer(req: Request, raw: unknown) {
  const command = parseInventoryTransfer(raw), { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "inventory") || !hasAny(features, "stock_movements")) throw new HttpError(403, "صندوق آفلاین، انبار و گردش انبار باید در اشتراک فعال باشند");
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان انتقال متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");
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
    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId), eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.businessId, business.id), eq(offlineWorkspaceSnapshots.dataset, "inventory"), eq(offlineWorkspaceSnapshots.revision, command.baseRevision))).for("update");
    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "نسخهٔ موجودی مبنا منقضی شده یا پیدا نمی‌شود؛ snapshot تازه دریافت کنید");
    const occurredAt = new Date(command.payload.occurredAt);
    if (occurredAt.getTime() > Date.now() + 5 * 60_000 || occurredAt.getTime() < snapshot.issuedAt.getTime() - 5 * 60_000) return record("rejected", 422, "زمان انتقال بیرون از بازهٔ snapshot محلی است");

    if (command.payload.intent === "request") {
      const lines = command.payload.lines!;
      const itemIds = [...new Set(lines.flatMap((line) => [line.sourceItemId, line.destinationItemId]))].sort((a, b) => a - b);
      const baseItems = Array.isArray(snapshot.payload.items) ? snapshot.payload.items as Record<string, unknown>[] : [];
      const baseById = new Map(baseItems.map((item) => [Number(item.id), item]));
      for (const line of lines) {
        const source = baseById.get(line.sourceItemId), destination = baseById.get(line.destinationItemId);
        if (!source || !destination || source.isActive !== true || destination.isActive !== true || source.trackStock !== true || destination.trackStock !== true || !source.warehouseId || !destination.warehouseId || source.warehouseId === destination.warehouseId || source.unit !== destination.unit || String(source.name).trim().toLocaleLowerCase() !== String(destination.name).trim().toLocaleLowerCase()) return record("conflict", 409, "اقلام مبدأ و مقصد در snapshot دیگر سازگار نیستند؛ انبار را تازه کنید");
      }
      await tx.execute(sql`select pg_advisory_xact_lock(${business.id})`);
      const locked = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.businessId, business.id), inArray(inventoryItems.id, itemIds))).orderBy(inventoryItems.id).for("update");
      const liveById = new Map(locked.map((item) => [item.id, item]));
      if (locked.length !== itemIds.length) return record("conflict", 409, "یکی از اقلام انتقال در سرور پیدا نشد");
      for (const line of lines) {
        const source = liveById.get(line.sourceItemId)!, destination = liveById.get(line.destinationItemId)!;
        if (!source.isActive || !destination.isActive || !source.trackStock || !destination.trackStock || !source.warehouseId || !destination.warehouseId || source.warehouseId === destination.warehouseId || source.unit !== destination.unit || source.name.trim().toLocaleLowerCase() !== destination.name.trim().toLocaleLowerCase()) return record("conflict", 409, "قلم یا مقصد انتقال در سرور تغییر کرده است");
      }
      const [transfer] = await tx.insert(stockTransfers).values({ businessId: business.id, requestKey: command.id, note: command.payload.note, createdBy: terminal.createdBy }).returning();
      for (const line of lines) await tx.insert(stockTransferLines).values({ transferId: transfer.id, ...line, unitCost: liveById.get(line.sourceItemId)!.costPerUnit });
      return record("applied", 200, "", String(transfer.id));
    }

    const [baseTransfer] = ((Array.isArray(snapshot.payload.transfers) ? snapshot.payload.transfers : []) as Record<string, unknown>[]).filter((row) => Number(row.id) === command.payload.transferId);
    if (!baseTransfer || baseTransfer.status !== "pending" || baseTransfer.createdAt !== command.payload.expectedCreatedAt) return record("conflict", 409, "درخواست انتقال در snapshot موجود یا در انتظار بررسی نیست؛ فهرست را تازه کنید");
    await tx.execute(sql`select pg_advisory_xact_lock(${business.id})`);
    const [transfer] = await tx.select().from(stockTransfers).where(and(eq(stockTransfers.id, command.payload.transferId!), eq(stockTransfers.businessId, business.id))).for("update");
    if (!transfer || transfer.status !== "pending" || transfer.createdAt.toISOString() !== command.payload.expectedCreatedAt) return record("conflict", 409, "درخواست انتقال هم‌زمان بررسی یا تغییر کرده است");
    const lines = await tx.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, transfer.id)).orderBy(stockTransferLines.id);
    const baseLines = Array.isArray(baseTransfer.lines) ? baseTransfer.lines as Record<string, unknown>[] : [];
    const commandLines = command.payload.lines!;
    if (lines.length === 0 || baseLines.length !== lines.length || commandLines.length !== lines.length || lines.some((line, index) => line.sourceItemId !== Number(baseLines[index]?.sourceItemId) || line.destinationItemId !== Number(baseLines[index]?.destinationItemId) || line.quantity !== Number(baseLines[index]?.quantity) || line.sourceItemId !== commandLines[index]?.sourceItemId || line.destinationItemId !== commandLines[index]?.destinationItemId || line.quantity !== commandLines[index]?.quantity)) return record("conflict", 409, "اقلام درخواست انتقال نسبت به snapshot تغییر کرده‌اند");
    if (command.payload.intent === "reject") {
      const [saved] = await tx.update(stockTransfers).set({ status: "rejected", decidedBy: terminal.createdBy, decidedAt: new Date() }).where(and(eq(stockTransfers.id, transfer.id), eq(stockTransfers.status, "pending"))).returning();
      if (!saved) return record("conflict", 409, "درخواست انتقال قبلاً بررسی شده است");
      return record("applied", 200, "", String(saved.id));
    }

    const expected = command.payload.expectedItems!, itemIds = [...new Set(lines.flatMap((line) => [line.sourceItemId, line.destinationItemId]))].sort((a, b) => a - b);
    const expectedById = new Map(expected.map((item) => [item.itemId, item]));
    if (expected.length !== itemIds.length || itemIds.some((itemId) => !expectedById.has(itemId))) return record("rejected", 422, "موجودی مبنا برای همهٔ اقلام انتقال لازم است");
    const locked = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.businessId, business.id), inArray(inventoryItems.id, itemIds))).orderBy(inventoryItems.id).for("update");
    const liveById = new Map(locked.map((item) => [item.id, item]));
    if (locked.length !== itemIds.length) return record("conflict", 409, "یکی از اقلام انتقال در سرور پیدا نشد");
    for (const itemId of itemIds) {
      const item = liveById.get(itemId)!, expectedItem = expectedById.get(itemId)!;
      if (!item.isActive || !item.trackStock || Math.abs(item.stock - expectedItem.expectedStock) > STOCK_EPSILON || item.costPerUnit !== expectedItem.expectedCostPerUnit) return record("conflict", 409, "موجودی یا بهای یکی از اقلام انتقال تغییر کرده است؛ snapshot تازه دریافت کنید");
    }
    const balances = new Map(locked.map((item) => [item.id, item.stock]));
    const movementBalances = new Map(balances);
    const movementRows: { businessId: number; itemId: number; type: "out" | "in"; delta: number; balanceAfter: number; note: string; unitCost: number }[] = [];
    for (const line of lines) {
      const source = liveById.get(line.sourceItemId)!, destination = liveById.get(line.destinationItemId)!;
      if (!source.warehouseId || !destination.warehouseId || source.warehouseId === destination.warehouseId || source.unit !== destination.unit || source.name.trim().toLocaleLowerCase() !== destination.name.trim().toLocaleLowerCase()) return record("conflict", 409, "مبدأ و مقصد دیگر برای انتقال سازگار نیستند");
      const sourceStock = balances.get(source.id)!, destinationStock = balances.get(destination.id)!;
      if (sourceStock + STOCK_EPSILON < line.quantity) return record("conflict", 409, `موجودی ${source.name} برای انتقال کافی نیست`);
      if (destinationStock + line.quantity > 1_000_000_000) return record("rejected", 422, `موجودی مقصد ${destination.name} از سقف مجاز بیشتر می‌شود`);
      balances.set(source.id, Math.max(0, sourceStock - line.quantity));
      balances.set(destination.id, destinationStock + line.quantity);
      movementBalances.set(source.id, movementBalances.get(source.id)! - line.quantity);
      movementBalances.set(destination.id, movementBalances.get(destination.id)! + line.quantity);
      movementRows.push(
        { businessId: business.id, itemId: source.id, type: "out", delta: -line.quantity, balanceAfter: movementBalances.get(source.id)!, note: `انتقال انبار #${transfer.id} · خروج`, unitCost: line.unitCost },
        { businessId: business.id, itemId: destination.id, type: "in", delta: line.quantity, balanceAfter: movementBalances.get(destination.id)!, note: `انتقال انبار #${transfer.id} · ورود`, unitCost: line.unitCost },
      );
    }
    const [saved] = await tx.update(stockTransfers).set({ status: "approved", decidedBy: terminal.createdBy, decidedAt: new Date() }).where(and(eq(stockTransfers.id, transfer.id), eq(stockTransfers.status, "pending"))).returning();
    if (!saved) return record("conflict", 409, "درخواست انتقال هم‌زمان بررسی شده است");
    for (const item of locked) await tx.update(inventoryItems).set({ stock: balances.get(item.id)! }).where(eq(inventoryItems.id, item.id));
    if (movementRows.length) await tx.insert(stockMovements).values(movementRows);
    return record("applied", 200, "", String(saved.id));
  }, { isolationLevel: "repeatable read" });
  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, typeof outcome.response.error === "string" ? outcome.response.error : "درخواست انتقال آفلاین اعمال نشد");
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

type InventoryCreateItemCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "inventory";
  action: "create_item";
  baseDataset: "inventory";
  baseSnapshotId: string;
  baseRevision: number;
  payload: {
    occurredAt: string;
    name: string;
    sku: string;
    unit: string;
    recipeUnit: string;
    recipeToStockFactor: number;
    warehouseId: number | null;
    categoryId: number | null;
    openingStock: number;
    minStock: number;
    reorderPoint: number;
    openingUnitCost: number;
    lastPurchaseCost: number;
    expiryDate: string | null;
    trackStock: boolean;
    isActive: boolean;
    openingNote: string;
  };
};

function parseInventoryCreateItem(raw: unknown): InventoryCreateItemCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "فرمان تعریف کالای آفلاین معتبر نیست");
  const command = raw as Record<string, unknown>;
  const allowed = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(command).some((key) => !allowed.includes(key)) || command.schemaVersion !== 1 || command.module !== "inventory" || command.action !== "create_item" || command.baseDataset !== "inventory") throw new HttpError(400, "نسخه یا نوع فرمان تعریف کالا پشتیبانی نمی‌شود");
  if (typeof command.id !== "string" || !UUID.test(command.id) || !Number.isSafeInteger(command.businessId) || Number(command.businessId) < 1 || typeof command.baseSnapshotId !== "string" || !UUID.test(command.baseSnapshotId) || !Number.isSafeInteger(command.baseRevision) || Number(command.baseRevision) < 1) throw new HttpError(400, "شناسهٔ فرمان یا snapshot انبار معتبر نیست");
  if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) throw new HttpError(400, "اطلاعات کالای آفلاین معتبر نیست");
  const payload = command.payload as Record<string, unknown>;
  const keys = ["occurredAt", "name", "sku", "unit", "recipeUnit", "recipeToStockFactor", "warehouseId", "categoryId", "openingStock", "minStock", "reorderPoint", "openingUnitCost", "lastPurchaseCost", "expiryDate", "trackStock", "isActive", "openingNote"];
  const optionalId = (value: unknown) => value === null || Number.isSafeInteger(value) && Number(value) > 0;
  const quantity = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000;
  if (Object.keys(payload).some((key) => !keys.includes(key)) || typeof payload.occurredAt !== "string" || payload.occurredAt.length > 40 || !RFC3339.test(payload.occurredAt) || !Number.isFinite(Date.parse(payload.occurredAt)) || typeof payload.name !== "string" || payload.name.trim().length < 2 || [...payload.name].length > 80 || typeof payload.sku !== "string" || payload.sku.length > 64 || typeof payload.unit !== "string" || !validInventoryUnit(payload.unit) || typeof payload.recipeUnit !== "string" || !validInventoryUnit(payload.recipeUnit) || typeof payload.recipeToStockFactor !== "number" || !Number.isFinite(payload.recipeToStockFactor) || payload.recipeToStockFactor <= 0 || payload.recipeToStockFactor > 1_000_000_000 || !optionalId(payload.warehouseId) || !optionalId(payload.categoryId) || !quantity(payload.openingStock) || !quantity(payload.minStock) || !quantity(payload.reorderPoint) || !moneyValue(payload.openingUnitCost) || payload.openingUnitCost > 1_000_000_000 || !moneyValue(payload.lastPurchaseCost) || payload.lastPurchaseCost > 1_000_000_000 || (payload.expiryDate !== null && (typeof payload.expiryDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.expiryDate) || !Number.isFinite(Date.parse(`${payload.expiryDate}T00:00:00.000Z`)) || new Date(`${payload.expiryDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== payload.expiryDate)) || typeof payload.trackStock !== "boolean" || typeof payload.isActive !== "boolean" || typeof payload.openingNote !== "string" || [...payload.openingNote].length > 300) throw new HttpError(400, "نام، واحد، موجودی یا مشخصات کالای جدید معتبر نیست");
  const openingAmount = Math.round(Number(payload.openingStock) * Number(payload.openingUnitCost));
  if (!Number.isSafeInteger(openingAmount) || openingAmount > 1_000_000_000_000) throw new HttpError(400, "ارزش موجودی اول دوره بیش از حد مجاز است");
  const automaticFactor = recipeToStockFactor(payload.unit, payload.recipeUnit);
  if (automaticFactor !== null && Math.abs(automaticFactor - payload.recipeToStockFactor) > 1e-9) throw new HttpError(400, "ضریب تبدیل واحد با محاسبهٔ سرور سازگار نیست");
  const sku = payload.sku.trim().toUpperCase();
  if (sku && !/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(sku)) throw new HttpError(400, "کد کالا فقط می‌تواند شامل حروف لاتین، عدد و . _ / - باشد");
  return raw as InventoryCreateItemCommand;
}

export async function syncOfflineInventoryCreateItem(req: Request, raw: unknown) {
  const command = parseInventoryCreateItem(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "inventory") || (command.payload.openingStock > 0 && !hasAny(features, "stock_movements"))) throw new HttpError(403, "صندوق آفلاین و انبار باید در اشتراک فعال باشند؛ ثبت موجودی افتتاحیه به مجوز گردش انبار نیاز دارد");
  if (command.businessId !== business.id) throw new HttpError(403, "کالای جدید متعلق به کسب‌وکار این دستگاه نیست");
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
    const record = async (state: "applied" | "conflict" | "rejected", httpStatus: 200 | 409 | 422, error = "", receipt = "", details: Record<string, unknown> = {}) => {
      const response = { commandId: command.id, state, receipt, ...details, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({ id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy, module: command.module, action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>, state, httpStatus, error, receipt, result: response });
      return { httpStatus, response };
    };
    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId), eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.businessId, business.id), eq(offlineWorkspaceSnapshots.dataset, "inventory"), eq(offlineWorkspaceSnapshots.revision, command.baseRevision))).for("update");
    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "نسخهٔ انبار مبنا منقضی شده یا پیدا نمی‌شود؛ ابتدا snapshot تازه بگیرید");
    const occurredAt = new Date(command.payload.occurredAt);
    if (occurredAt.getTime() > Date.now() + 24 * 60 * 60_000 || occurredAt.getTime() < snapshot.issuedAt.getTime() - 7 * 86_400_000) return record("rejected", 422, "تاریخ تعریف کالا بیرون از بازهٔ مجاز نسخهٔ محلی است");
    const { warehouseId, categoryId } = command.payload;
    const baseWarehouses = Array.isArray(snapshot.payload.warehouses) ? snapshot.payload.warehouses as Record<string, unknown>[] : [];
    const baseCategories = Array.isArray(snapshot.payload.categories) ? snapshot.payload.categories as Record<string, unknown>[] : [];
    if (warehouseId !== null && !baseWarehouses.some((row) => row.id === warehouseId)) return record("conflict", 409, "انبار در snapshot محلی پیدا نشد؛ اطلاعات انبار را تازه کنید");
    if (categoryId !== null && !baseCategories.some((row) => row.id === categoryId)) return record("conflict", 409, "دسته‌بندی انبار در snapshot محلی پیدا نشد؛ اطلاعات انبار را تازه کنید");
    await tx.execute(sql`select pg_advisory_xact_lock(${business.id})`);
    if (warehouseId !== null) {
      const [warehouse] = await tx.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.id, warehouseId), eq(warehouses.businessId, business.id)));
      if (!warehouse) return record("conflict", 409, "انبار انتخاب‌شده در سرور متعلق به این کسب‌وکار نیست");
    }
    if (categoryId !== null) {
      const [category] = await tx.select({ id: inventoryCategories.id }).from(inventoryCategories).where(and(eq(inventoryCategories.id, categoryId), eq(inventoryCategories.businessId, business.id)));
      if (!category) return record("conflict", 409, "دسته‌بندی انتخاب‌شده در سرور متعلق به این کسب‌وکار نیست");
    }
    const name = command.payload.name.trim();
    const [duplicateName] = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.businessId, business.id), sql`lower(${inventoryItems.name}) = ${name.toLocaleLowerCase("fa-IR")}`, warehouseId === null ? sql`${inventoryItems.warehouseId} IS NULL` : eq(inventoryItems.warehouseId, warehouseId))).limit(1);
    if (duplicateName) return record("conflict", 409, "این قلم در انبار انتخاب‌شده از قبل ثبت شده است");
    let sku = command.payload.sku.trim().toUpperCase();
    if (!sku) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = `INV-${business.id}-${randomBytes(4).toString("hex").toUpperCase()}`;
        const [duplicate] = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.businessId, business.id), sql`lower(${inventoryItems.sku}) = ${candidate.toLowerCase()}`)).limit(1);
        if (!duplicate) { sku = candidate; break; }
      }
      if (!sku) return record("rejected", 422, "ساخت کد کالا انجام نشد؛ دوباره تلاش کنید");
    } else {
      const [duplicateSku] = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.businessId, business.id), sql`lower(${inventoryItems.sku}) = ${sku.toLowerCase()}`)).limit(1);
      if (duplicateSku) return record("conflict", 409, "این کد کالا قبلاً ثبت شده است");
    }
    const openingStock = command.payload.openingStock;
    const openingUnitCost = command.payload.openingUnitCost;
    const openingAmount = Math.round(openingStock * openingUnitCost);
    const [item] = await tx.insert(inventoryItems).values({
      businessId: business.id, warehouseId, categoryId, name, sku, unit: command.payload.unit, recipeUnit: command.payload.recipeUnit,
      recipeToStockFactor: command.payload.recipeToStockFactor, stock: openingStock, minStock: command.payload.minStock,
      reorderPoint: command.payload.reorderPoint, trackStock: command.payload.trackStock, isActive: command.payload.isActive,
      expiryDate: command.payload.expiryDate, costPerUnit: openingStock > 0 ? openingUnitCost : command.payload.lastPurchaseCost,
      lastPurchaseCost: command.payload.lastPurchaseCost || openingUnitCost,
    }).returning();
    let movementId: number | null = null;
    let documentId: number | null = null;
    if (openingStock > 0) {
      const [movement] = await tx.insert(stockMovements).values({
        businessId: business.id, itemId: item.id, type: "adjust", delta: openingStock, balanceAfter: openingStock,
        unitCost: openingUnitCost, amount: openingAmount, note: command.payload.openingNote.trim() || "ثبت موجودی اول دوره", createdAt: occurredAt,
      }).returning({ id: stockMovements.id });
      movementId = movement.id;
      if (openingAmount > 0) {
        const document = await postDocumentInTransaction(tx, business, {
          date: occurredAt, source: "inventory", sourceRef: `opening-item:${item.id}`, createdBy: String(terminal.createdBy),
          description: `موجودی اول دوره — ${item.name} (${sku})`,
          lines: [{ code: C.INV, debit: openingAmount, description: item.name }, { code: C.CAPITAL, credit: openingAmount, description: "موجودی افتتاحیه" }],
        });
        documentId = document.id;
      }
    }
    return record("applied", 200, "", String(item.id), { itemId: item.id, movementId, documentId });
  }, { isolationLevel: "repeatable read" });

  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, typeof outcome.response.error === "string" ? outcome.response.error : "تعریف کالای آفلاین اعمال نشد");
  return outcome.response;
}
