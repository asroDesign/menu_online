export type ProductOption = { id: string; name: string; priceDelta: number; active: boolean };
export type ProductOptionGroup = {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  active: boolean;
  options: ProductOption[];
};
export type ProductOptionSnapshot = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
};

export const DIETARY_TAGS = [
  { id: "vegetarian", label: "گیاهی" },
  { id: "vegan", label: "وگان" },
  { id: "gluten_free", label: "بدون گلوتن" },
  { id: "dairy_free", label: "بدون لبنیات" },
  { id: "spicy", label: "تند" },
] as const;
export const ALLERGEN_TAGS = [
  { id: "milk", label: "شیر" },
  { id: "eggs", label: "تخم‌مرغ" },
  { id: "peanuts", label: "بادام‌زمینی" },
  { id: "tree_nuts", label: "مغزها" },
  { id: "wheat", label: "گندم" },
  { id: "soy", label: "سویا" },
  { id: "fish", label: "ماهی" },
  { id: "shellfish", label: "صدف دریایی" },
  { id: "sesame", label: "کنجد" },
] as const;

const idPattern = /^[a-zA-Z0-9_-]{1,48}$/;
const cleanName = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 60) : "";

/** Normalize untrusted product-editor JSON before persisting it. */
export function normalizeProductOptionGroups(value: unknown): ProductOptionGroup[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error("گروه‌های گزینه نامعتبر است");
  const groupIds = new Set<string>();
  const optionIds = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("گروه گزینه نامعتبر است");
    const group = raw as Record<string, unknown>;
    const id = String(group.id ?? "");
    const name = cleanName(group.name);
    const required = group.required === true;
    const active = group.active !== false;
    const min = Number(group.min ?? (required ? 1 : 0));
    const max = Number(group.max ?? 1);
    if (!idPattern.test(id) || groupIds.has(id) || !name || !Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || max > 10 || min > max || (required && min < 1) || (!required && min > 0))
      throw new Error("تنظیم حداقل یا حداکثر انتخاب گروه گزینه نامعتبر است");
    if (!Array.isArray(group.options) || group.options.length < 1 || group.options.length > 20)
      throw new Error("هر گروه باید بین ۱ تا ۲۰ گزینه داشته باشد");
    groupIds.add(id);
    const options = group.options.map((rawOption) => {
      if (!rawOption || typeof rawOption !== "object") throw new Error("گزینه نامعتبر است");
      const option = rawOption as Record<string, unknown>;
      const optionId = String(option.id ?? "");
      const optionName = cleanName(option.name);
      const priceDelta = Number(option.priceDelta ?? 0);
      if (!idPattern.test(optionId) || optionIds.has(optionId) || !optionName || !Number.isSafeInteger(priceDelta) || Math.abs(priceDelta) > 100_000_000)
        throw new Error("نام، شناسه یا مبلغ گزینه نامعتبر است");
      optionIds.add(optionId);
      return { id: optionId, name: optionName, priceDelta, active: option.active !== false };
    });
    if (max > options.length || min > options.filter((option) => option.active).length)
      throw new Error("حد انتخاب گروه از تعداد گزینه‌های فعال بیشتر است");
    return { id, name, required, min, max, active, options };
  });
}

export function normalizeTags(value: unknown, allowed: readonly { id: string }[], max: number, label: string) {
  if (!Array.isArray(value) || value.length > max || value.some((x) => typeof x !== "string" || !allowed.some((t) => t.id === x)))
    throw new Error(`${label} نامعتبر است`);
  return [...new Set(value as string[])];
}

export function resolveProductOptionSelection(groups: ProductOptionGroup[], input: unknown) {
  if (!Array.isArray(input) || input.length > 40 || input.some((id) => typeof id !== "string") || new Set(input).size !== input.length)
    throw new Error("انتخاب گزینه‌های محصول نامعتبر است");
  const selectedIds = new Set(input as string[]);
  const validIds = new Set<string>();
  const knownOptions = new Map<string, ProductOption>();
  for (const group of groups) if (group.active) for (const option of group.options) knownOptions.set(option.id, option);
  for (const id of selectedIds) {
    const option = knownOptions.get(id);
    if (!option) throw new Error("گزینه به این محصول تعلق ندارد");
    if (!option.active) throw new Error("یکی از گزینه‌ها غیرفعال شده است؛ منو را تازه کنید");
  }
  const snapshot: ProductOptionSnapshot[] = [];
  for (const group of groups) {
    if (!group.active) continue;
    const selected = group.options.filter((option) => selectedIds.has(option.id));
    for (const option of group.options) if (option.active) validIds.add(option.id);
    if (selected.length < group.min || selected.length > group.max)
      throw new Error(`تعداد انتخاب‌های گروه «${group.name}» مجاز نیست`);
    for (const option of selected) {
      if (!option.active) throw new Error("یکی از گزینه‌ها غیرفعال شده است؛ منو را تازه کنید");
      snapshot.push({ groupId: group.id, groupName: group.name, optionId: option.id, optionName: option.name, priceDelta: option.priceDelta });
      selectedIds.delete(option.id);
    }
  }
  if (selectedIds.size || input.some((id) => !validIds.has(String(id)))) throw new Error("گزینه به این محصول تعلق ندارد یا فعال نیست");
  const priceDelta = snapshot.reduce((sum, option) => sum + option.priceDelta, 0);
  if (!Number.isSafeInteger(priceDelta)) throw new Error("مجموع قیمت گزینه‌ها معتبر نیست");
  return { priceDelta, snapshot };
}

export function productUnitPrice(basePrice: number, priceDelta: number) {
  const price = basePrice + priceDelta;
  if (!Number.isSafeInteger(price) || price < 0 || price > 2_147_483_647) throw new Error("قیمت نهایی محصول معتبر نیست");
  return price;
}

export const optionId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
