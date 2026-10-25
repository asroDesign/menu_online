/** Shared journal presentation; the restaurant chart has one linked detail level. */
export type JournalAccount = { id: number; code: string; name: string; level: string; parentId: number | null };
export function journalAccountLabels(accountId: number, accounts: Map<number, JournalAccount>) {
  const account = accounts.get(accountId);
  const chain: JournalAccount[] = [];
  const seen = new Set<number>();
  let current = account;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = current.parentId ? accounts.get(current.parentId) : undefined;
  }
  const moein = chain.find((item) => item.level === "moein");
  return {
    code: account?.code ?? "", name: account?.name ?? "حساب نامشخص", level: account?.level ?? "",
    kol: chain.find((item) => item.level === "kol")?.name ?? "",
    moein: moein?.name ?? "", moeinCode: moein?.code ?? "",
    tafsili: chain.filter((item) => item.level === "tafsili").reverse().map((item) => `${item.code} — ${item.name}`).join(" / "),
  };
}

/** Internal posting may pass fractional costs; reject invalid values before rounding to toman. */
export function journalAmount(value: unknown): number {
  const number = value == null || value === "" ? 0 : Number(value);
  if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(Math.round(number))) {
    throw new Error("مبلغ سند باید عدد معتبر، غیرمنفی و در محدوده مجاز باشد");
  }
  return Math.round(number);
}

export function journalPagination(pageValue: string | null, limitValue: string | null) {
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(limitValue) || 20)));
  const page = Math.min(1_000_000, Math.max(1, Math.trunc(Number(pageValue) || 1)));
  return { page, limit, offset: (page - 1) * limit };
}
