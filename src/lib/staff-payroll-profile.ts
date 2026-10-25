const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const normalizeDigits = (value: unknown) => String(value ?? "")
  .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));

function integerValue(value: unknown, label: string) {
  const input = normalizeDigits(value).replace(/[٬,\s]/g, "");
  if (input === "") return 0;
  const number = Number(input);
  if (!Number.isSafeInteger(number) || number < 0 || number > 1_000_000_000_000) throw new Error(`${label} باید عدد صحیح و مثبت باشد`);
  return number;
}

function dateValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const date = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("تاریخ استخدام یا تولد معتبر نیست");
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error("تاریخ استخدام یا تولد معتبر نیست");
  return date;
}

export function staffPayrollPatch(body: Record<string, unknown>) {
  const out: Record<string, string | number | boolean | null> = {};
  const strings: [string, number][] = [
    ["nationalId", 10], ["fatherName", 80], ["jobTitle", 100], ["jobCode", 30],
    ["insuranceNumber", 40], ["bankAccountName", 100], ["bankAccountNumber", 50], ["iban", 34],
  ];
  for (const [key, max] of strings) if (key in body) {
    const value = String(body[key] ?? "").trim().slice(0, max);
    if (key === "nationalId" && value && !/^\d{10}$/.test(normalizeDigits(value))) throw new Error("کد ملی باید ۱۰ رقم باشد");
    if (key === "iban" && value) {
      const iban = normalizeDigits(value.replace(/\s/g, "").toUpperCase());
      if (!/^IR\d{24}$/.test(iban)) throw new Error("شماره شبا باید با IR و ۲۴ رقم وارد شود");
      out[key] = iban;
    } else out[key] = key === "nationalId" ? normalizeDigits(value) : value;
  }
  for (const key of ["birthDate", "employmentStartDate", "employmentEndDate"] as const) if (key in body) out[key] = dateValue(body[key]);
  const start = out.employmentStartDate;
  const end = out.employmentEndDate;
  if (typeof start === "string" && typeof end === "string" && end < start) throw new Error("تاریخ پایان همکاری نباید پیش از شروع به کار باشد");
  if ("maritalStatus" in body) {
    const value = String(body.maritalStatus);
    if (!["single", "married", "unknown"].includes(value)) throw new Error("وضعیت تأهل معتبر نیست");
    out.maritalStatus = value;
  }
  if ("contractType" in body) {
    const value = String(body.contractType);
    if (!["permanent", "temporary", "fixed_term", "part_time", "project"].includes(value)) throw new Error("نوع قرارداد معتبر نیست");
    out.contractType = value;
  }
  if ("salaryMode" in body) {
    const value = String(body.salaryMode);
    if (!["statutory", "fixed"].includes(value)) throw new Error("شیوه پرداخت معتبر نیست");
    out.salaryMode = value;
  }
  for (const [key, label] of [
    ["insuredHistoryDays", "سابقه بیمه"], ["childrenCount", "تعداد فرزند"], ["monthlyBaseSalaryToman", "حقوق پایه"],
    ["fixedAgreedSalaryToman", "حقوق توافقی ثابت"], ["managementAllowanceToman", "حق مدیریت"], ["annualServiceBaseToman", "پایه سنوات"],
  ] as [string, string][]) if (key in body) out[key] = integerValue(body[key], label);
  for (const key of ["childAllowanceEligible", "overtimeEligible", "insuranceEnabled", "incomeTaxEnabled", "includeHousing", "includeFood", "includeMaritalAllowance", "includeChildAllowance", "includeSeniority"] as const) {
    if (key in body) {
      if (typeof body[key] !== "boolean") throw new Error(`مقدار ${key} معتبر نیست`);
      out[key] = body[key] as boolean;
    }
  }
  return out;
}
