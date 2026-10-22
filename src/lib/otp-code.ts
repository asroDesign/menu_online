/** Normalize typed/pasted Persian, Arabic, or Latin OTP digits into ASCII digits. */
export function normalizeOtpCode(value: string, length = 6) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\D/g, "")
    .slice(0, Math.max(1, Math.min(12, length)));
}
