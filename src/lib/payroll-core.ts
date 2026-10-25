import * as jalali from "jalaali-js";

export type TaxBand = { upToToman: number | null; ratePercent: number };

export type PayrollPolicyCore = {
  jalaliYear: number;
  minimumDailyWageToman: number;
  monthlyHousingToman: number;
  monthlyFoodToman: number;
  monthlyMaritalToman: number;
  monthlyChildToman: number;
  monthlySeniorityToman: number;
  monthlyTaxExemptionToman: number;
  taxBrackets: TaxBand[];
  taxableComponentKeys: string[];
  insurableComponentKeys: string[];
  employeeInsurancePercent: number;
  employerInsurancePercent: number;
  unemploymentInsurancePercent: number;
  overtimePercent: number;
  fridayPremiumPercent: number;
  holidayPremiumPercent: number;
  nightPremiumPercent: number;
  standardMonthlyHours: number;
  minimumInsuredHistoryDaysForChildAllowance: number;
  annualLeaveDays: number;
  legalSourceNote: string;
};

export type PayrollProfileCore = {
  id: number;
  name: string;
  nationalId?: string;
  insuranceNumber?: string;
  jobTitle?: string;
  jobCode?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  iban?: string;
  employmentStartDate?: string | null;
  employmentEndDate?: string | null;
  maritalStatus: string;
  childrenCount: number;
  childAllowanceEligible: boolean;
  insuredHistoryDays: number;
  salaryMode: "statutory" | "fixed";
  monthlyBaseSalaryToman: number;
  fixedAgreedSalaryToman: number;
  managementAllowanceToman: number;
  annualServiceBaseToman: number;
  overtimeEligible: boolean;
  insuranceEnabled: boolean;
  incomeTaxEnabled: boolean;
  includeHousing: boolean;
  includeFood: boolean;
  includeMaritalAllowance: boolean;
  includeChildAllowance: boolean;
  includeSeniority: boolean;
};

export type PayrollMetrics = {
  workMinutes: number;
  overtimeMinutes: number;
  fridayMinutes: number;
  holidayMinutes: number;
  nightMinutes: number;
  annualLeaveMinutes: number;
  sickLeaveMinutes: number;
  unpaidLeaveMinutes: number;
  otherLeaveMinutes: number;
  shortMinutes: number;
  rewardToman: number;
  taxableRewardToman: number;
  insurableRewardToman: number;
  penaltyToman: number;
  warnings?: string[];
};

export type PayrollEarning = { key: string; label: string; amountToman: number; taxable: boolean; insurable: boolean };
export type PayrollDeduction = { key: string; label: string; amountToman: number; accounting: boolean };

export type PayrollResult = {
  earnings: PayrollEarning[];
  deductions: PayrollDeduction[];
  workMinutes: number;
  overtimeMinutes: number;
  fridayMinutes: number;
  holidayMinutes: number;
  nightMinutes: number;
  leaveMinutes: number;
  unpaidLeaveMinutes: number;
  shortMinutes: number;
  grossToman: number;
  taxableToman: number;
  insuranceBaseToman: number;
  employeeInsuranceToman: number;
  employerInsuranceToman: number;
  incomeTaxToman: number;
  penaltyToman: number;
  netToman: number;
  warnings: string[];
};

export const payroll1405Defaults: Omit<PayrollPolicyCore, "jalaliYear"> = {
  minimumDailyWageToman: 554_185,
  monthlyHousingToman: 3_000_000,
  monthlyFoodToman: 2_200_000,
  monthlyMaritalToman: 500_000,
  monthlyChildToman: 1_662_555,
  monthlySeniorityToman: 500_000,
  monthlyTaxExemptionToman: 40_000_000,
  taxBrackets: [
    { upToToman: 40_000_000, ratePercent: 10 },
    { upToToman: 60_000_000, ratePercent: 15 },
    { upToToman: 80_000_000, ratePercent: 20 },
    { upToToman: 100_000_000, ratePercent: 25 },
    { upToToman: null, ratePercent: 30 },
  ],
  taxableComponentKeys: ["base", "management", "overtime", "friday", "holiday", "night", "reward"],
  insurableComponentKeys: ["base", "management", "seniority", "overtime", "friday", "holiday", "night", "reward"],
  employeeInsurancePercent: 7,
  employerInsurancePercent: 20,
  unemploymentInsurancePercent: 3,
  overtimePercent: 40,
  fridayPremiumPercent: 40,
  holidayPremiumPercent: 0,
  nightPremiumPercent: 35,
  standardMonthlyHours: 220,
  minimumInsuredHistoryDaysForChildAllowance: 720,
  annualLeaveDays: 26,
  legalSourceNote: "پیش‌فرض نمونه ۱۴۰۵؛ بر اساس جدول مزد و نرخ‌های مالیاتی گزارش‌شده. با متن نهایی بخشنامه‌های وزارت کار، تأمین اجتماعی و سازمان امور مالیاتی تطبیق داده شود.",
};

export function defaultPayrollPolicy(year: number): PayrollPolicyCore & { annualLeaveDays: number } {
  const defaults = year === 1405 ? payroll1405Defaults : {
    ...payroll1405Defaults,
    minimumDailyWageToman: 0,
    monthlyHousingToman: 0,
    monthlyFoodToman: 0,
    monthlyMaritalToman: 0,
    monthlyChildToman: 0,
    monthlySeniorityToman: 0,
    monthlyTaxExemptionToman: 0,
    taxBrackets: [],
  };
  return { jalaliYear: year, ...defaults };
}

/** Progressive monthly tax. Bracket widths are amount ranges after the configured exemption. */
export function progressivePayrollTax(incomeToman: number, exemptionToman: number, bands: TaxBand[]) {
  let remaining = Math.max(0, Math.floor(incomeToman) - Math.max(0, Math.floor(exemptionToman)));
  let previousLimit = 0;
  let tax = 0;
  for (const band of bands) {
    const width = band.upToToman == null ? remaining : Math.max(0, band.upToToman - previousLimit);
    const taxable = Math.min(remaining, width);
    tax += taxable * Math.max(0, band.ratePercent) / 100;
    remaining -= taxable;
    if (band.upToToman != null) previousLimit = band.upToToman;
    if (remaining <= 0) break;
  }
  return Math.max(0, Math.round(tax));
}

function rounded(value: number) { return Math.max(0, Math.round(Number.isFinite(value) ? value : 0)); }
function yearsAtPeriodStart(date: string | null | undefined, year: number, month: number) {
  if (!date) return 0;
  const [gy, gm, gd] = date.split("-").map(Number);
  if (!gy || !gm || !gd) return 0;
  const g = jalali.toGregorian(year, month, 1);
  const target = Date.UTC(g.gy, g.gm - 1, g.gd);
  let years = g.gy - gy;
  const anniversary = Date.UTC(gy + years, gm - 1, gd);
  if (target < anniversary) years--;
  return Math.max(0, years);
}

export function calculatePayroll(input: {
  profile: PayrollProfileCore;
  policy: PayrollPolicyCore;
  year: number;
  month: number;
  monthDays: number;
  metrics: PayrollMetrics;
}): PayrollResult {
  const { profile, policy, year, month, monthDays } = input;
  const metrics = input.metrics;
  const warnings = [...(metrics.warnings ?? [])];
  const configuredBase = profile.salaryMode === "fixed" ? profile.fixedAgreedSalaryToman : profile.monthlyBaseSalaryToman;
  const hasConfiguredBase = Number.isFinite(configuredBase) && configuredBase > 0;
  // Salary fields are stored as zero when the employee has not been configured.
  // In that case use this year's legal daily minimum on the standard 30-day basis.
  // Never replace a positive agreed/statutory amount entered by the employer.
  const hasLegalMinimum = Number.isFinite(policy.minimumDailyWageToman) && policy.minimumDailyWageToman > 0;
  const base = hasConfiguredBase ? configuredBase : hasLegalMinimum ? policy.minimumDailyWageToman * 30 : 0;
  if (!hasConfiguredBase && hasLegalMinimum) {
    warnings.push(`حقوق پایه برای کارمند ثبت نشده است؛ حداقل مزد روزانهٔ سال ${policy.jalaliYear} به‌صورت خودکار مبنا قرار گرفت.`);
  } else if (!hasConfiguredBase) {
    warnings.push(`حقوق پایه ثبت نشده و حداقل مزد قانونی سال ${policy.jalaliYear} نیز در تنظیمات حقوق تعریف نشده است؛ مبلغ پایه محاسبه نشد.`);
  }
  const periodStartGregorian = jalali.toGregorian(year, month, 1);
  const periodEndGregorian = jalali.toGregorian(year, month, monthDays);
  const periodStart = Date.UTC(periodStartGregorian.gy, periodStartGregorian.gm - 1, periodStartGregorian.gd);
  const periodEnd = Date.UTC(periodEndGregorian.gy, periodEndGregorian.gm - 1, periodEndGregorian.gd);
  const toUtcDay = (value: string | null | undefined) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const hire = toUtcDay(profile.employmentStartDate);
  const leaving = toUtcDay(profile.employmentEndDate);
  const activeStart = hire !== null && hire > periodStart ? hire : periodStart;
  const activeEnd = leaving !== null && leaving < periodEnd ? leaving : periodEnd;
  const employedDays = activeEnd < activeStart ? 0 : Math.floor((activeEnd - activeStart) / 86_400_000) + 1;
  const hoursPerDay = 44 / 6;
  const unpaidHours = Math.max(0, metrics.unpaidLeaveMinutes) / 60;
  const paidDays = Math.max(0, employedDays - unpaidHours / hoursPerDay);
  // Monthly wage fields are configured on the conventional 30-day basis.
  // Convert to daily wage before prorating partial employment or unpaid leave.
  const paidRatio = monthDays > 0 ? Math.min(monthDays, paidDays) / 30 : 0;
  const monthlyBase = rounded(base * paidRatio);
  const minimumBase = rounded(policy.minimumDailyWageToman * Math.min(monthDays, paidDays));
  if (policy.minimumDailyWageToman > 0 && monthlyBase < minimumBase)
    warnings.push(`حقوق پایه کمتر از کف مزد این ماه است (${minimumBase.toLocaleString("en-US")} تومان). مبلغ قرارداد و وضعیت استخدام بررسی شود.`);

  const components: PayrollEarning[] = [];
  const add = (key: string, label: string, amount: number, eligible = true) => {
    const value = rounded(amount);
    if (value > 0) components.push({ key, label, amountToman: value, taxable: eligible && policy.taxableComponentKeys.includes(key), insurable: eligible && policy.insurableComponentKeys.includes(key) });
  };
  add("base", "حقوق پایه / توافقی", monthlyBase);
  if (profile.includeHousing) add("housing", "کمک‌هزینه مسکن", policy.monthlyHousingToman * paidRatio);
  if (profile.includeFood) add("food", "کمک‌هزینه اقلام مصرفی", policy.monthlyFoodToman * paidRatio);
  if (profile.includeMaritalAllowance && profile.maritalStatus === "married") add("marital", "حق تأهل", policy.monthlyMaritalToman * paidRatio);
  const childEligible = profile.childAllowanceEligible && profile.insuredHistoryDays >= policy.minimumInsuredHistoryDaysForChildAllowance;
  if (profile.includeChildAllowance && childEligible && profile.childrenCount > 0) add("children", "حق اولاد", policy.monthlyChildToman * profile.childrenCount * paidRatio, true);
  const serviceYears = yearsAtPeriodStart(profile.employmentStartDate, year, month);
  if (profile.includeSeniority && serviceYears >= 1) {
    const perYear = profile.annualServiceBaseToman > 0 ? profile.annualServiceBaseToman : policy.monthlySeniorityToman;
    add("seniority", "پایه سنوات ماهانه", perYear * paidRatio);
  } else if (profile.includeSeniority && !profile.employmentStartDate && policy.monthlySeniorityToman > 0) {
    warnings.push("برای محاسبهٔ پایه سنوات، تاریخ شروع به کار کارمند را در پروفایل کارکنان ثبت کنید.");
  }
  add("management", "حق مدیریت", profile.managementAllowanceToman * paidRatio);

  const hourly = base / Math.max(1, policy.standardMonthlyHours);
  const overtimeMinutes = profile.overtimeEligible ? Math.max(0, metrics.overtimeMinutes) : 0;
  if (!profile.overtimeEligible && metrics.overtimeMinutes > 0) warnings.push("اضافه‌کاری برای این قرارداد غیرفعال است؛ ساعت ثبت‌شده در مبلغ حقوق منظور نشده است.");
  add("overtime", "اضافه‌کاری", hourly * overtimeMinutes / 60 * (1 + policy.overtimePercent / 100), profile.overtimeEligible);
  add("friday", "جمعه‌کاری", hourly * Math.max(0, metrics.fridayMinutes) / 60 * (1 + policy.fridayPremiumPercent / 100));
  add("holiday", "تعطیل‌کاری", hourly * Math.max(0, metrics.holidayMinutes) / 60 * (1 + policy.holidayPremiumPercent / 100));
  add("night", "فوق‌العاده شب‌کاری", hourly * Math.max(0, metrics.nightMinutes) / 60 * policy.nightPremiumPercent / 100);
  add("reward", "تشویقی و پاداش تأییدشده", metrics.rewardToman, true);

  const regularGross = components.reduce((sum, item) => sum + item.amountToman, 0);
  const shortageDeduction = rounded(hourly * Math.max(0, metrics.shortMinutes) / 60);
  const shortAndUnpaid = Math.min(regularGross, shortageDeduction);
  const gross = Math.max(0, regularGross - shortAndUnpaid);
  const taxableBeforeExemption = components.filter((item) => item.key !== "reward" && item.taxable).reduce((sum, item) => sum + item.amountToman, 0);
  const taxable = Math.max(0, taxableBeforeExemption - shortAndUnpaid + Math.max(0, metrics.taxableRewardToman));
  const insuranceBase = Math.max(0, components.filter((item) => item.key !== "reward" && item.insurable).reduce((sum, item) => sum + item.amountToman, 0) - shortAndUnpaid + Math.max(0, metrics.insurableRewardToman));
  const employeeInsurance = profile.insuranceEnabled ? rounded(insuranceBase * policy.employeeInsurancePercent / 100) : 0;
  const employerInsurance = profile.insuranceEnabled ? rounded(insuranceBase * (policy.employerInsurancePercent + policy.unemploymentInsurancePercent) / 100) : 0;
  const incomeTax = profile.incomeTaxEnabled ? progressivePayrollTax(taxable, policy.monthlyTaxExemptionToman, policy.taxBrackets) : 0;
  const penalty = rounded(metrics.penaltyToman);
  const leaveMinutes = metrics.annualLeaveMinutes + metrics.sickLeaveMinutes + metrics.unpaidLeaveMinutes + metrics.otherLeaveMinutes;
  const deductions: PayrollDeduction[] = [];
  if (shortAndUnpaid > 0) deductions.push({ key: "time_deduction", label: "کسر ساعت و مرخصی بدون حقوق", amountToman: shortAndUnpaid, accounting: false });
  if (employeeInsurance > 0) deductions.push({ key: "insurance", label: "بیمه سهم کارمند", amountToman: employeeInsurance, accounting: true });
  if (incomeTax > 0) deductions.push({ key: "tax", label: "مالیات حقوق", amountToman: incomeTax, accounting: true });
  if (penalty > 0) deductions.push({ key: "penalty", label: "جریمه/کسر تأییدشده", amountToman: penalty, accounting: true });
  const net = Math.max(0, gross - employeeInsurance - incomeTax - penalty);
  if (profile.insuranceEnabled && !profile.insuranceNumber) warnings.push("شماره بیمه برای خروجی لیست بیمه وارد نشده است.");
  if (!profile.nationalId) warnings.push("کد ملی برای خروجی بیمه و مالیات ثبت نشده است.");
  if (!profile.insuranceEnabled) warnings.push("محاسبه بیمه برای این کارمند غیرفعال است؛ مبنای قانونی یا وضعیت شمول را بررسی کنید.");
  if (!profile.incomeTaxEnabled) warnings.push("محاسبه مالیات حقوق برای این کارمند غیرفعال است؛ وضعیت شمول را بررسی کنید.");

  return {
    earnings: components, deductions,
    workMinutes: metrics.workMinutes, overtimeMinutes, fridayMinutes: metrics.fridayMinutes,
    holidayMinutes: metrics.holidayMinutes, nightMinutes: metrics.nightMinutes, leaveMinutes,
    unpaidLeaveMinutes: metrics.unpaidLeaveMinutes, shortMinutes: metrics.shortMinutes,
    grossToman: gross, taxableToman: taxable, insuranceBaseToman: insuranceBase,
    employeeInsuranceToman: employeeInsurance, employerInsuranceToman: employerInsurance,
    incomeTaxToman: incomeTax, penaltyToman: penalty, netToman: net,
    warnings: [...new Set(warnings)],
  };
}

/** Split an attendance interval by local Tehran hour, returning totals for Friday and 22:00–06:00 night work. */
export function classifyAttendanceInterval(start: Date | number, end: Date | number) {
  const offset = 210 * 60_000;
  let cursor = new Date(start).getTime();
  const finish = new Date(end).getTime();
  let total = 0, friday = 0, night = 0;
  while (cursor < finish) {
    const local = new Date(cursor + offset);
    const hour = local.getUTCHours();
    const weekday = local.getUTCDay();
    const boundary = Math.min(finish, cursor + (60 - local.getUTCMinutes()) * 60_000 - local.getUTCSeconds() * 1000 - local.getUTCMilliseconds());
    const minutes = Math.max(0, (boundary - cursor) / 60_000);
    total += minutes;
    if (weekday === 5) friday += minutes;
    if (hour >= 22 || hour < 6) night += minutes;
    if (boundary <= cursor) break;
    cursor = boundary;
  }
  return { totalMinutes: Math.round(total), fridayMinutes: Math.round(friday), nightMinutes: Math.round(night) };
}
