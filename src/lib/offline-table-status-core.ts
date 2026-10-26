import { canTransitionTable, isOperationalTableState, type OperationalTableState } from "@/lib/table-lifecycle-core";

export type OfflineTableStatusCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "tables";
  action: "set_status";
  baseDataset: "menu";
  baseSnapshotId: string;
  baseRevision: number;
  payload: {
    tableId: number;
    expectedStatus: OperationalTableState;
    status: OperationalTableState;
    reason: string;
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ownKeys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key));

export function parseOfflineTableStatusCommand(raw: unknown): OfflineTableStatusCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("فرمان وضعیت میز معتبر نیست");
  const command = raw as Record<string, unknown>;
  if (!ownKeys(command, ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"])) throw new Error("فرمان وضعیت میز فیلد ناشناخته دارد");
  if (command.schemaVersion !== 1 || command.module !== "tables" || command.action !== "set_status" || command.baseDataset !== "menu") throw new Error("نسخه یا نوع فرمان وضعیت میز پشتیبانی نمی‌شود");
  if (typeof command.id !== "string" || !UUID.test(command.id) || !Number.isSafeInteger(command.businessId) || Number(command.businessId) < 1) throw new Error("شناسه فرمان یا کسب‌وکار معتبر نیست");
  if (typeof command.baseSnapshotId !== "string" || !UUID.test(command.baseSnapshotId) || !Number.isSafeInteger(command.baseRevision) || Number(command.baseRevision) < 1) throw new Error("نسخه مبنای میز معتبر نیست");
  if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) throw new Error("اطلاعات تغییر وضعیت میز معتبر نیست");
  const payload = command.payload as Record<string, unknown>;
  if (!ownKeys(payload, ["tableId", "expectedStatus", "status", "reason"]) || !Number.isSafeInteger(payload.tableId) || Number(payload.tableId) < 1) throw new Error("شناسه میز یا فیلدهای فرمان معتبر نیست");
  if (typeof payload.expectedStatus !== "string" || !isOperationalTableState(payload.expectedStatus) || typeof payload.status !== "string" || !isOperationalTableState(payload.status)) throw new Error("وضعیت فعلی یا مقصد میز معتبر نیست");
  if (typeof payload.reason !== "string" || [...payload.reason].length > 240) throw new Error("علت تغییر وضعیت میز معتبر نیست");
  if (!canTransitionTable(payload.expectedStatus, payload.status)) throw new Error("این انتقال وضعیت میز مجاز نیست");
  if (payload.status === "out_of_service" && !payload.reason.trim()) throw new Error("برای خارج‌کردن میز از سرویس، علت را بنویسید");
  return raw as OfflineTableStatusCommand;
}
