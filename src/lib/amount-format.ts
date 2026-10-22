const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Strip separators and normalize Persian/Arabic numerals to an API-friendly integer string. */
export function normalizeAmountInput(value: string | number | null | undefined, allowNegative = false) {
  const normalized = String(value ?? "")
    .replace(/[۰-۹]/g, (digit) => String(FA_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(AR_DIGITS.indexOf(digit)));
  const sign = allowNegative && /^\s*-/.test(normalized) ? "-" : "";
  return sign + normalized.replace(/[^0-9]/g, "");
}

/** Format an integer amount as Persian digits grouped with the Persian thousands separator. */
export function formatAmountInput(value: string | number | null | undefined, allowNegative = false) {
  const normalized = normalizeAmountInput(value, allowNegative);
  const sign = normalized.startsWith("-") ? "-" : "";
  const digits = sign ? normalized.slice(1) : normalized;
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, "٬").replace(/\d/g, (digit) => FA_DIGITS[Number(digit)]);
}
