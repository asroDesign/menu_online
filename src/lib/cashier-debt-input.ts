export type CashierDebtInput = { name: string; phone: string; type: "person" | "company"; companyName: string; dueAt: string | null; description: string };
export function parseCashierDebt(value: unknown): CashierDebtInput {
  const b = (value ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const phone = String(b.phone ?? "").replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[\s-]/g, "").replace(/^(\+98|0098|98)/, "0");
  const type = b.type ?? "person";
  const companyName = typeof b.companyName === "string" ? b.companyName.trim() : "";
  if (!name || name.length > 80) throw new Error("نام مشتری یا مسئول حساب را وارد کنید (حداکثر ۸۰ حرف)");
  if (!/^09\d{9}$/.test(phone)) throw new Error("شماره موبایل معتبر وارد کنید");
  if (type !== "person" && type !== "company") throw new Error("نوع حساب معتبر نیست");
  if (type === "company" && (!companyName || companyName.length > 120)) throw new Error("نام شرکت یا گروه را وارد کنید (حداکثر ۱۲۰ حرف)");
  const dueAt = b.dueAt ? String(b.dueAt) : null;
  if (dueAt && (!/^\d{4}-\d{2}-\d{2}/.test(dueAt) || !Number.isFinite(Date.parse(dueAt)))) throw new Error("سررسید معتبر نیست");
  if (dueAt && new Date(`${dueAt.slice(0,10)}T12:00:00Z`).toISOString().slice(0,10) !== dueAt.slice(0,10)) throw new Error("روز سررسید معتبر نیست");
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (description.length > 500) throw new Error("توضیح حداکثر ۵۰۰ حرف است");
  return { name, phone, type, companyName, dueAt, description };
}
