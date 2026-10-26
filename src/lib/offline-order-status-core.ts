type OfflineOrderCommandBase = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "orders";
  baseDataset: "orders";
  baseSnapshotId: string;
  baseRevision: number;
};
export type OfflineOrderStatusCommand = OfflineOrderCommandBase & {
  action: "change_status";
  payload: { orderId: number; expectedStatus: "pending" | "preparing" | "ready"; expectedUpdatedAt: string; status: "preparing" | "ready" | "served" };
};
export type OfflineCashierConfirmationCommand = OfflineOrderCommandBase & {
  action: "confirm_cashier";
  payload: { orderId: number; expectedStatus: "pending"; expectedUpdatedAt: string };
};
export type OfflineOrderCommand = OfflineOrderStatusCommand | OfflineCashierConfirmationCommand;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const NEXT_STATUS: Record<string, string> = { pending: "preparing", preparing: "ready", ready: "served" };
const COMMAND_KEYS = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function nextOfflineOrderStatus(status: unknown) {
  return typeof status === "string" ? NEXT_STATUS[status] ?? null : null;
}

export function parseOfflineOrderStatusCommand(raw: unknown): OfflineOrderCommand {
  if (!isRecord(raw) || Object.keys(raw).some((key) => !COMMAND_KEYS.includes(key))) throw new Error("فرمان وضعیت سفارش آفلاین معتبر نیست");
  if (raw.schemaVersion !== 1 || raw.module !== "orders" || !["change_status", "confirm_cashier"].includes(String(raw.action)) || raw.baseDataset !== "orders") throw new Error("نوع فرمان وضعیت سفارش پشتیبانی نمی‌شود");
  if (typeof raw.id !== "string" || !UUID.test(raw.id) || !Number.isSafeInteger(raw.businessId) || Number(raw.businessId) < 1) throw new Error("شناسهٔ فرمان یا کسب‌وکار معتبر نیست");
  if (typeof raw.baseSnapshotId !== "string" || !UUID.test(raw.baseSnapshotId) || !Number.isSafeInteger(raw.baseRevision) || Number(raw.baseRevision) < 1) throw new Error("نسخهٔ مبنای سفارش معتبر نیست");
  if (!isRecord(raw.payload)) throw new Error("اطلاعات تغییر وضعیت سفارش معتبر نیست");
  const payload = raw.payload;
  if (raw.action === "confirm_cashier") {
    if (Object.keys(payload).length !== 3 || Object.keys(payload).some((key) => !["orderId", "expectedStatus", "expectedUpdatedAt"].includes(key)) || !Number.isSafeInteger(payload.orderId) || Number(payload.orderId) < 1 || payload.expectedStatus !== "pending") {
      throw new Error("درخواست تأیید صندوق‌دار معتبر نیست");
    }
  } else if (Object.keys(payload).length !== 4 || Object.keys(payload).some((key) => !["orderId", "expectedStatus", "expectedUpdatedAt", "status"].includes(key)) || !Number.isSafeInteger(payload.orderId) || Number(payload.orderId) < 1 || typeof payload.expectedStatus !== "string" || typeof payload.status !== "string" || NEXT_STATUS[payload.expectedStatus] !== payload.status) {
    throw new Error("تغییر وضعیت باید یک مرحلهٔ مجاز به جلو باشد");
  }
  if (typeof payload.expectedUpdatedAt !== "string" || !ISO.test(payload.expectedUpdatedAt) || !Number.isFinite(Date.parse(payload.expectedUpdatedAt))) throw new Error("زمان نسخهٔ سفارش معتبر نیست");
  return raw as unknown as OfflineOrderCommand;
}
