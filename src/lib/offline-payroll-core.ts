type PayrollLineInput = { key?: unknown; label?: unknown; amountToman?: unknown; taxable?: unknown; insurable?: unknown; accounting?: unknown };
export type OfflinePayslipEarning = { key: string; label: string; amountToman: number; taxable: boolean; insurable: boolean };
export type OfflinePayslipDeduction = { key: string; label: string; amountToman: number; accounting: boolean };

const PAYSLIP_STAFF_FIELDS = [
  "name", "fatherName", "nationalId", "insuranceNumber", "jobTitle", "jobCode",
  "employmentStartDate", "bankAccountName", "bankAccountNumber", "iban",
] as const;

/** Minimum private staff fields required to render the existing printable payslip. */
export function projectOfflinePayslipStaff(value: unknown): Record<string, unknown> {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const projected: Record<string, unknown> = {};
  for (const key of PAYSLIP_STAFF_FIELDS) {
    const field = source[key];
    if (typeof field === "string") projected[key] = field.trim().slice(0, 120);
  }
  const warnings = source.warnings;
  if (Array.isArray(warnings)) projected.warnings = warnings.filter((entry): entry is string => typeof entry === "string").slice(0, 30).map((entry) => entry.slice(0, 300));
  return projected;
}

function baseLine(entry: PayrollLineInput) {
  if (!entry || typeof entry !== "object") return null;
  const key = typeof entry.key === "string" ? entry.key.slice(0, 60) : "";
  const label = typeof entry.label === "string" ? entry.label.trim().slice(0, 120) : "";
  const amountToman = Number(entry.amountToman);
  if (!key || !label || !Number.isSafeInteger(amountToman) || amountToman < 0) return null;
  return { key, label, amountToman };
}

function projectEarnings(value: unknown): OfflinePayslipEarning[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((value: PayrollLineInput) => {
    const line = baseLine(value);
    return line ? [{ ...line, taxable: value.taxable === true, insurable: value.insurable === true }] : [];
  });
}

function projectDeductions(value: unknown): OfflinePayslipDeduction[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((value: PayrollLineInput) => {
    const line = baseLine(value);
    return line ? [{ ...line, accounting: value.accounting === true }] : [];
  });
}

export function projectOfflinePayslipLines(earnings: unknown, deductions: unknown): { earnings: OfflinePayslipEarning[]; deductions: OfflinePayslipDeduction[] } {
  return { earnings: projectEarnings(earnings), deductions: projectDeductions(deductions) };
}
