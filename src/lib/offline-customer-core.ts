export type OfflineCustomerCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "customers";
  action: "create" | "update";
  baseDataset: "customers";
  baseSnapshotId: string;
  baseRevision: number;
  payload:
    | { customer: { name: string; phone: string } }
    | { customerId: number; patch: { name: string } };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMAND_KEYS = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];

export function normalizeOfflineCustomerName(value: unknown) {
  if (typeof value !== "string") throw new Error("نام مشتری معتبر نیست");
  const name = value.trim();
  if (!name || Array.from(name).length > 80) throw new Error("نام مشتری باید بین ۱ تا ۸۰ نویسه باشد");
  return name;
}

export function normalizeOfflineCustomerPhone(value: unknown) {
  if (typeof value !== "string") throw new Error("شمارهٔ موبایل مشتری معتبر نیست");
  const digits = value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\D/g, "");
  const local = digits.startsWith("98") ? `0${digits.slice(2)}` : digits.length === 10 && digits.startsWith("9") ? `0${digits}` : digits;
  if (!/^09\d{9}$/.test(local)) throw new Error("شمارهٔ موبایل باید یک شمارهٔ معتبر ایران باشد");
  return local;
}

export function parseOfflineCustomerCommand(raw: unknown): OfflineCustomerCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("فرمان مشتری آفلاین معتبر نیست");
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => !COMMAND_KEYS.includes(key))) throw new Error("فرمان مشتری فیلد ناشناخته دارد");
  if (value.schemaVersion !== 1 || value.module !== "customers" || (value.action !== "create" && value.action !== "update") || value.baseDataset !== "customers") {
    throw new Error("نسخه یا نوع فرمان مشتری آفلاین پشتیبانی نمی‌شود");
  }
  if (typeof value.id !== "string" || !UUID.test(value.id) || !Number.isSafeInteger(value.businessId) || Number(value.businessId) < 1) {
    throw new Error("شناسهٔ فرمان یا کسب‌وکار معتبر نیست");
  }
  if (typeof value.baseSnapshotId !== "string" || !UUID.test(value.baseSnapshotId) || !Number.isSafeInteger(value.baseRevision) || Number(value.baseRevision) < 1) {
    throw new Error("نسخهٔ مبنای مشتریان معتبر نیست");
  }
  if (!value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) throw new Error("اطلاعات مشتری معتبر نیست");
  const payload = value.payload as Record<string, unknown>;
  if (value.action === "create") {
    if (Object.keys(payload).length !== 1 || !payload.customer || typeof payload.customer !== "object" || Array.isArray(payload.customer)) {
      throw new Error("ساختار مشتری تازه معتبر نیست");
    }
    const customer = payload.customer as Record<string, unknown>;
    if (Object.keys(customer).some((key) => !["name", "phone"].includes(key)) || Object.keys(customer).length !== 2) {
      throw new Error("مشتری تازه فقط نام و شمارهٔ موبایل می‌پذیرد");
    }
    return {
      schemaVersion: 1,
      id: value.id,
      businessId: Number(value.businessId),
      module: "customers",
      action: "create",
      baseDataset: "customers",
      baseSnapshotId: value.baseSnapshotId,
      baseRevision: Number(value.baseRevision),
      payload: { customer: { name: normalizeOfflineCustomerName(customer.name), phone: normalizeOfflineCustomerPhone(customer.phone) } },
    };
  }
  if (Object.keys(payload).length !== 2 || !Number.isSafeInteger(payload.customerId) || Number(payload.customerId) < 1 || !payload.patch || typeof payload.patch !== "object" || Array.isArray(payload.patch)) {
    throw new Error("ساختار ویرایش مشتری معتبر نیست");
  }
  const patch = payload.patch as Record<string, unknown>;
  if (Object.keys(patch).length !== 1 || Object.keys(patch)[0] !== "name") throw new Error("در حالت آفلاین فقط نام مشتری قابل ویرایش است");
  return {
    schemaVersion: 1,
    id: value.id,
    businessId: Number(value.businessId),
    module: "customers",
    action: "update",
    baseDataset: "customers",
    baseSnapshotId: value.baseSnapshotId,
    baseRevision: Number(value.baseRevision),
    payload: { customerId: Number(payload.customerId), patch: { name: normalizeOfflineCustomerName(patch.name) } },
  };
}
