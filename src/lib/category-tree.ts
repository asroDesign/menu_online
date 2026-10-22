export type CategoryParentRow = { id: number; parentCategoryId: number | null };

/** Validate that a category parent exists in the tenant and cannot create a self/descendant cycle. */
export function categoryParentError(
  categoryId: number | undefined,
  parentCategoryId: number | null,
  rows: CategoryParentRow[],
): string | null {
  if (parentCategoryId === null) return null;
  if (!Number.isInteger(parentCategoryId) || parentCategoryId < 1) return "دسته‌بندی والد نامعتبر است";
  if (categoryId === parentCategoryId) return "یک دسته‌بندی نمی‌تواند والد خودش باشد";

  const byId = new Map(rows.map((row) => [row.id, row]));
  let current: number | null = parentCategoryId;
  const visited = new Set<number>();
  while (current !== null) {
    if (categoryId !== undefined && current === categoryId) return "انتخاب زیر‌دسته به‌عنوان والد، چرخه ایجاد می‌کند";
    if (visited.has(current)) return "ساختار دسته‌بندی‌ها معتبر نیست";
    visited.add(current);
    const row = byId.get(current);
    if (!row) return "دسته‌بندی والد پیدا نشد";
    current = row.parentCategoryId;
  }
  return null;
}
