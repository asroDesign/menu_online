import type { MenuImportRow } from "@/db/schema";

const MAX_ROWS = 1000;
const MAX_COLUMNS = 8;
const MAX_PRICE = 100_000_000;
const digits = (value: string) => value.replace(/[۰-۹٠-٩]/g, (digit) => {
  const fa = "۰۱۲۳۴۵۶۷۸۹".indexOf(digit);
  return String(fa >= 0 ? fa : "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
});
const headerKey = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, "");

export function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') {
      if (field.length) throw new Error("ساختار CSV نامعتبر است؛ علامت نقل‌قول باید ابتدای سلول باشد.");
      quoted = true;
    } else if (char === ",") {
      row.push(field); field = "";
      if (row.length >= MAX_COLUMNS) throw new Error("فایل بیشتر از ۸ ستون دارد.");
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      if (rows.length > MAX_ROWS + 1) throw new Error("حداکثر ۱۰۰۰ ردیف کالا قابل پردازش است.");
    } else field += char;
  }
  if (quoted) throw new Error("یک سلول نقل‌قول بسته‌نشده دارد.");
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (!rows.length) throw new Error("فایل خالی است.");
  if (rows.length - 1 > MAX_ROWS) throw new Error("حداکثر ۱۰۰۰ ردیف کالا قابل پردازش است.");
  return rows;
}

function parsePrice(value: string): number | null {
  const normalized = digits(value).replace(/[٬,\s]/g, "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const price = Number(normalized);
  return Number.isSafeInteger(price) && price >= 0 && price <= MAX_PRICE ? price : null;
}

function parseAvailable(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ["1", "true", "yes", "موجود", "بله", "فعال"].includes(normalized)) return true;
  if (["0", "false", "no", "ناموجود", "خیر", "غیرفعال"].includes(normalized)) return false;
  return null;
}

export function parseProductCsv(source: string, existingExternalIds: Set<string>): MenuImportRow[] {
  const rows = parseCsv(source.replace(/^\uFEFF/, ""));
  const headers = rows[0].map(headerKey);
  const aliases: Record<string, string[]> = {
    externalId: ["externalid", "sku", "کد", "کدکالا", "شناسه"],
    category: ["category", "دسته", "دستهبندی"],
    name: ["name", "نام", "ناممحصول"],
    description: ["description", "توضیحات", "شرح"],
    priceToman: ["pricetoman", "price", "قیمتتومان", "قیمت"],
    available: ["available", "موجود", "وضعیت"],
  };
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, headers.findIndex((header) => names.includes(header))])) as Record<keyof typeof aliases, number>;
  if (columns.name < 0 || columns.priceToman < 0) throw new Error("ستون‌های «نام» و «قیمت تومان» اجباری هستند.");
  const used = new Set<string>();
  return rows.slice(1).map((cells) => {
    const value = (key: keyof typeof columns) => columns[key] < 0 ? "" : (cells[columns[key]] ?? "").trim();
    const externalId = value("externalId").slice(0, 80);
    const category = value("category").slice(0, 60);
    const name = value("name").trim();
    const description = value("description").slice(0, 400);
    const priceToman = parsePrice(value("priceToman"));
    const available = parseAvailable(value("available"));
    const errors: string[] = [];
    if (!name || name.length > 100) errors.push("نام محصول اجباری و حداکثر ۱۰۰ نویسه است.");
    if (priceToman === null) errors.push("قیمت باید عدد صحیح تومان بین صفر و ۱۰۰ میلیون باشد.");
    if (columns.available >= 0 && available === null) errors.push("وضعیت باید موجود/ناموجود یا yes/no باشد.");
    if (externalId && used.has(externalId)) errors.push("کد کالا در همین فایل تکراری است.");
    if (externalId) used.add(externalId);
    return {
      externalId,
      category,
      name,
      description,
      priceToman: priceToman ?? 0,
      available: available ?? true,
      errors,
      duplicate: !!externalId && existingExternalIds.has(externalId),
    };
  });
}
