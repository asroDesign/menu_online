import { canTransitionTable, isOperationalTableState, type OperationalTableState } from "@/lib/table-lifecycle-core";

type Baseline = { name: string; zone: string; capacity: number; operationalStatus: OperationalTableState };
type CommandBase = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "tables";
  baseDataset: "menu";
  baseSnapshotId: string;
  baseRevision: number;
};
export type OfflineTableCommand = CommandBase & (
  | { action: "create"; payload: { localId: number; name: string; zone: string; capacity: number } }
  | { action: "update"; payload: { tableId: number; expected: Baseline; patch: Partial<Pick<Baseline, "name" | "zone" | "capacity">> } }
  | { action: "delete"; payload: { tableId: number; expected: Baseline } }
  | { action: "set_status"; payload: { tableId: number; expectedStatus: OperationalTableState; status: OperationalTableState; reason: string } }
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ownKeys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key));
const validText = (value: unknown, max: number, required = false) => typeof value === "string" && [...value].length <= max && (!required || !!value.trim());

function parseBaseline(value: unknown): Baseline {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("نسخهٔ مبنای میز معتبر نیست");
  const row = value as Record<string, unknown>;
  if (!ownKeys(row, ["name", "zone", "capacity", "operationalStatus"]) || !validText(row.name, 40, true) || !validText(row.zone, 40)
    || !Number.isSafeInteger(row.capacity) || Number(row.capacity) < 1 || Number(row.capacity) > 100
    || typeof row.operationalStatus !== "string" || !isOperationalTableState(row.operationalStatus)) throw new Error("اطلاعات نسخهٔ میز معتبر نیست");
  return value as Baseline;
}

function parseTableFields(payload: Record<string, unknown>) {
  if (!validText(payload.name, 40, true) || !validText(payload.zone, 40) || !Number.isSafeInteger(payload.capacity) || Number(payload.capacity) < 1 || Number(payload.capacity) > 100) {
    throw new Error("نام، سالن یا ظرفیت میز معتبر نیست");
  }
}

export function parseOfflineTableStatusCommand(raw: unknown): OfflineTableCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("فرمان میز معتبر نیست");
  const command = raw as Record<string, unknown>;
  if (!ownKeys(command, ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"])) throw new Error("فرمان میز فیلد ناشناخته دارد");
  if (command.schemaVersion !== 1 || command.module !== "tables" || !["create", "update", "delete", "set_status"].includes(String(command.action)) || command.baseDataset !== "menu") throw new Error("نسخه یا نوع فرمان میز پشتیبانی نمی‌شود");
  if (typeof command.id !== "string" || !UUID.test(command.id) || !Number.isSafeInteger(command.businessId) || Number(command.businessId) < 1) throw new Error("شناسه فرمان یا کسب‌وکار معتبر نیست");
  if (typeof command.baseSnapshotId !== "string" || !UUID.test(command.baseSnapshotId) || !Number.isSafeInteger(command.baseRevision) || Number(command.baseRevision) < 1) throw new Error("نسخه مبنای میز معتبر نیست");
  if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) throw new Error("اطلاعات تغییر میز معتبر نیست");
  const payload = command.payload as Record<string, unknown>;

  if (command.action === "create") {
    if (!ownKeys(payload, ["localId", "name", "zone", "capacity"]) || !Number.isSafeInteger(payload.localId) || Number(payload.localId) >= 0) throw new Error("شناسهٔ محلی میز جدید معتبر نیست");
    parseTableFields(payload);
  } else if (command.action === "update") {
    if (!ownKeys(payload, ["tableId", "expected", "patch"]) || !Number.isSafeInteger(payload.tableId) || Number(payload.tableId) < 1 || !payload.patch || typeof payload.patch !== "object" || Array.isArray(payload.patch)) throw new Error("اطلاعات ویرایش میز معتبر نیست");
    parseBaseline(payload.expected);
    const patch = payload.patch as Record<string, unknown>;
    if (!ownKeys(patch, ["name", "zone", "capacity"]) || !Object.keys(patch).length) throw new Error("فیلدهای ویرایش میز معتبر نیستند");
    if ("name" in patch && !validText(patch.name, 40, true)) throw new Error("نام میز معتبر نیست");
    if ("zone" in patch && !validText(patch.zone, 40)) throw new Error("نام سالن معتبر نیست");
    if ("capacity" in patch && (!Number.isSafeInteger(patch.capacity) || Number(patch.capacity) < 1 || Number(patch.capacity) > 100)) throw new Error("ظرفیت میز باید بین ۱ تا ۱۰۰ نفر باشد");
  } else if (command.action === "delete") {
    if (!ownKeys(payload, ["tableId", "expected"]) || !Number.isSafeInteger(payload.tableId) || Number(payload.tableId) < 1) throw new Error("اطلاعات حذف میز معتبر نیست");
    parseBaseline(payload.expected);
  } else {
    if (!ownKeys(payload, ["tableId", "expectedStatus", "status", "reason"]) || !Number.isSafeInteger(payload.tableId) || Number(payload.tableId) < 1) throw new Error("شناسه میز یا فیلدهای فرمان معتبر نیست");
    if (typeof payload.expectedStatus !== "string" || !isOperationalTableState(payload.expectedStatus) || typeof payload.status !== "string" || !isOperationalTableState(payload.status)) throw new Error("وضعیت فعلی یا مقصد میز معتبر نیست");
    if (typeof payload.reason !== "string" || [...payload.reason].length > 240) throw new Error("علت تغییر وضعیت میز معتبر نیست");
    if (!canTransitionTable(payload.expectedStatus, payload.status)) throw new Error("این انتقال وضعیت میز مجاز نیست");
    if (payload.status === "out_of_service" && !payload.reason.trim()) throw new Error("برای خارج‌کردن میز از سرویس، علت را بنویسید");
  }
  return raw as OfflineTableCommand;
}
