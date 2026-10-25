import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  accAccounts, bankAccounts, payrollItems, payrollPolicies, payrollRuns, payrollSettlements,
  payrollItemEvents, staff, staffAttendanceRecords, staffPayrollAdjustments, staffPayrollLeaves, staffSchedules, users,
} from "@/db/schema";
import { HttpError, readJson, withAuth, type AuthContext } from "@/lib/auth";
import { ensurePayrollAccountingAccounts, bankDetailId, postDocumentInTransaction, type LineIn } from "@/lib/accounting";
import { calculatePayroll, defaultPayrollPolicy, classifyAttendanceInterval, type PayrollMetrics, type PayrollPolicyCore, type PayrollProfileCore } from "@/lib/payroll-core";
import { fromJ, jMonthLength, jMonthRange } from "@/lib/jalali";
import { csvCell } from "@/lib/csv";
import { flattenPayrollRun } from "@/lib/payroll-run-response";

export const dynamic = "force-dynamic";
type Ctx = { path: string[] };
const JSON = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const digits = (v: unknown) => String(v ?? "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const int = (v: unknown, label: string, min = 0, max = 1_000_000_000_000) => {
  const text = digits(v).replace(/[٬,\s]/g, "");
  const value = text === "" ? 0 : Number(text);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new HttpError(400, `${label} نامعتبر است`);
  return value;
};
const periodOf = (year: number, month: number) => ({
  start: jMonthRange(year, month).start,
  end: new Date(jMonthRange(year, month).end.getTime() + 1000),
  days: jMonthLength(year, month),
});
function parsePeriod(value: unknown) {
  const match = digits(value).match(/^(\d{4})[-/](\d{1,2})$/);
  if (!match) throw new HttpError(400, "ماه را با قالب سال-ماه شمسی انتخاب کنید");
  const year = Number(match[1]), month = Number(match[2]);
  if (year < 1380 || year > 1500 || month < 1 || month > 12) throw new HttpError(400, "ماه شمسی معتبر نیست");
  return { year, month };
}

function policyValues(year: number) {
  return defaultPayrollPolicy(year);
}
async function getPolicy(businessId: number, year: number) {
  const [policy] = await db.select().from(payrollPolicies).where(and(eq(payrollPolicies.businessId, businessId), eq(payrollPolicies.jalaliYear, year))).limit(1);
  return policy ?? policyValues(year);
}

function cleanPolicy(body: Record<string, unknown>, year: number) {
  const base = policyValues(year);
  const amount = (key: string, label: string) => int(body[key] ?? (base as any)[key], label);
  const percent = (key: string, label: string) => int(body[key] ?? (base as any)[key], label, 0, 100);
  const componentKeys = ["base", "housing", "food", "marital", "children", "seniority", "management", "overtime", "friday", "holiday", "night", "reward"];
  const keys = (key: string, fallback: string[]) => {
    const value = body[key] ?? fallback;
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !componentKeys.includes(item))) throw new HttpError(400, "اجزای مشمول بیمه یا مالیات نامعتبرند");
    return [...new Set(value as string[])];
  };
  let bands = body.taxBrackets ?? (base as any).taxBrackets;
  if (!Array.isArray(bands) || bands.length > 10) throw new HttpError(400, "جدول پلکانی مالیات نامعتبر است");
  bands = bands.map((entry: any) => ({
    upToToman: entry?.upToToman == null || entry?.upToToman === "" ? null : int(entry.upToToman, "حد پلکان مالیات"),
    ratePercent: int(entry?.ratePercent, "نرخ پلکان مالیات", 0, 100),
  }));
  let previous = 0;
  for (let index = 0; index < bands.length; index++) {
    const band = bands[index];
    if (band.upToToman != null && band.upToToman <= previous) throw new HttpError(400, "حد پلکان‌های مالیات باید صعودی باشد");
    if (band.upToToman == null && index !== bands.length - 1) throw new HttpError(400, "پلکان نامحدود باید آخرین ردیف باشد");
    if (band.upToToman != null) previous = band.upToToman;
  }
  const note = String(body.legalSourceNote ?? "").trim().slice(0, 500);
  return {
    jalaliYear: year,
    minimumDailyWageToman: amount("minimumDailyWageToman", "حداقل مزد روزانه"),
    monthlyHousingToman: amount("monthlyHousingToman", "کمک‌هزینه مسکن"),
    monthlyFoodToman: amount("monthlyFoodToman", "بن و اقلام مصرفی"),
    monthlyMaritalToman: amount("monthlyMaritalToman", "حق تأهل"),
    monthlyChildToman: amount("monthlyChildToman", "حق اولاد"),
    monthlySeniorityToman: amount("monthlySeniorityToman", "پایه سنوات"),
    monthlyTaxExemptionToman: amount("monthlyTaxExemptionToman", "معافیت ماهانه مالیات"),
    taxBrackets: bands,
    taxableComponentKeys: keys("taxableComponentKeys", base.taxableComponentKeys),
    insurableComponentKeys: keys("insurableComponentKeys", base.insurableComponentKeys),
    employeeInsurancePercent: percent("employeeInsurancePercent", "درصد بیمه سهم کارمند"),
    employerInsurancePercent: percent("employerInsurancePercent", "درصد بیمه سهم کارفرما"),
    unemploymentInsurancePercent: percent("unemploymentInsurancePercent", "درصد بیمه بیکاری"),
    overtimePercent: int(body.overtimePercent ?? base.overtimePercent, "درصد اضافه‌کاری", 0, 300),
    fridayPremiumPercent: int(body.fridayPremiumPercent ?? base.fridayPremiumPercent, "درصد فوق‌العاده جمعه‌کاری", 0, 300),
    holidayPremiumPercent: int(body.holidayPremiumPercent ?? base.holidayPremiumPercent, "درصد تعطیل‌کاری", 0, 300),
    nightPremiumPercent: int(body.nightPremiumPercent ?? base.nightPremiumPercent, "درصد فوق‌العاده شب‌کاری", 0, 300),
    standardMonthlyHours: int(body.standardMonthlyHours ?? base.standardMonthlyHours, "ساعت موظفی ماهانه", 1, 400),
    minimumInsuredHistoryDaysForChildAllowance: int(body.minimumInsuredHistoryDaysForChildAllowance ?? base.minimumInsuredHistoryDaysForChildAllowance, "حداقل سابقه بیمه برای حق اولاد", 0, 20_000),
    annualLeaveDays: int(body.annualLeaveDays ?? base.annualLeaveDays, "مرخصی سالانه", 0, 100),
    legalSourceNote: note,
  };
}

function profileOf(row: typeof staff.$inferSelect): PayrollProfileCore & Record<string, unknown> {
  return {
    id: row.id, name: row.name, nationalId: row.nationalId, insuranceNumber: row.insuranceNumber,
    fatherName: row.fatherName, birthDate: row.birthDate,
    jobTitle: row.jobTitle, jobCode: row.jobCode, bankAccountName: row.bankAccountName,
    bankAccountNumber: row.bankAccountNumber, iban: row.iban,
    employmentStartDate: row.employmentStartDate, employmentEndDate: row.employmentEndDate,
    maritalStatus: row.maritalStatus, childrenCount: row.childrenCount, childAllowanceEligible: row.childAllowanceEligible,
    insuredHistoryDays: row.insuredHistoryDays, salaryMode: row.salaryMode === "fixed" ? "fixed" : "statutory",
    monthlyBaseSalaryToman: row.monthlyBaseSalaryToman, fixedAgreedSalaryToman: row.fixedAgreedSalaryToman,
    managementAllowanceToman: row.managementAllowanceToman, annualServiceBaseToman: row.annualServiceBaseToman,
    overtimeEligible: row.overtimeEligible, insuranceEnabled: row.insuranceEnabled, incomeTaxEnabled: row.incomeTaxEnabled,
    includeHousing: row.includeHousing, includeFood: row.includeFood, includeMaritalAllowance: row.includeMaritalAllowance,
    includeChildAllowance: row.includeChildAllowance, includeSeniority: row.includeSeniority,
  };
}

async function workMetrics(businessId: number, year: number, month: number, employees: (typeof staff.$inferSelect)[], policy: PayrollPolicyCore) {
  const period = periodOf(year, month);
  const ids = employees.map((employee) => employee.id);
  const [attendance, scheduled, leaves, adjustments] = await Promise.all([
    db.select().from(staffAttendanceRecords).where(and(eq(staffAttendanceRecords.businessId, businessId), inArray(staffAttendanceRecords.staffId, ids.length ? ids : [0]), gte(staffAttendanceRecords.checkInAt, period.start), lt(staffAttendanceRecords.checkInAt, period.end))),
    db.select({ staffId: staffSchedules.staffId, id: staffSchedules.id, startsAt: staffSchedules.startsAt, endsAt: staffSchedules.endsAt, status: staffSchedules.status }).from(staffSchedules).where(and(eq(staffSchedules.businessId, businessId), inArray(staffSchedules.staffId, ids.length ? ids : [0]), inArray(staffSchedules.status, ["scheduled", "absent"]), gte(staffSchedules.startsAt, period.start), lt(staffSchedules.startsAt, period.end))),
    db.select().from(staffPayrollLeaves).where(and(eq(staffPayrollLeaves.businessId, businessId), eq(staffPayrollLeaves.jalaliYear, year), eq(staffPayrollLeaves.jalaliMonth, month), eq(staffPayrollLeaves.status, "approved"))),
    db.select().from(staffPayrollAdjustments).where(and(eq(staffPayrollAdjustments.businessId, businessId), eq(staffPayrollAdjustments.jalaliYear, year), eq(staffPayrollAdjustments.jalaliMonth, month))),
  ]);
  const result = new Map<number, PayrollMetrics>();
  const forStaff = (id: number) => {
    let value = result.get(id);
    if (!value) {
      value = { workMinutes: 0, overtimeMinutes: 0, fridayMinutes: 0, holidayMinutes: 0, nightMinutes: 0, annualLeaveMinutes: 0, sickLeaveMinutes: 0, unpaidLeaveMinutes: 0, otherLeaveMinutes: 0, shortMinutes: 0, rewardToman: 0, taxableRewardToman: 0, insurableRewardToman: 0, penaltyToman: 0, warnings: [] };
      result.set(id, value);
    }
    return value;
  };
  const completed = new Map<number, number>();
  const scheduledCount = new Map<number, number>();
  for (const row of attendance) {
    const value = forStaff(row.staffId);
    if (!row.checkInAt || !row.checkOutAt || row.checkOutAt <= row.checkInAt) {
      value.warnings?.push("برای یکی از شیفت‌های ماه ورود یا خروج کامل ثبت نشده است.");
      continue;
    }
    const interval = classifyAttendanceInterval(row.checkInAt, row.checkOutAt);
    value.workMinutes += interval.totalMinutes;
    value.fridayMinutes += interval.fridayMinutes;
    value.nightMinutes += interval.nightMinutes;
    completed.set(row.staffId, (completed.get(row.staffId) ?? 0) + 1);
  }
  for (const item of scheduled) {
    if (item.status === "absent") {
      const plannedMinutes = Math.max(0, Math.round((item.endsAt.getTime() - item.startsAt.getTime()) / 60_000));
      const value = forStaff(item.staffId);
      value.shortMinutes += plannedMinutes;
      value.warnings?.push("غیبت ثبت‌شده از برنامه شیفت به‌عنوان کسر ساعت وارد شده است؛ پیش از قطعی‌کردن بررسی کنید.");
    } else scheduledCount.set(item.staffId, (scheduledCount.get(item.staffId) ?? 0) + 1);
  }
  for (const [staffId, count] of scheduledCount) {
    if ((completed.get(staffId) ?? 0) < count) forStaff(staffId).warnings?.push("برای بعضی شیفت‌های برنامه‌ریزی‌شده حضور کامل ثبت نشده است؛ کارکرد را بررسی کنید.");
  }
  const leaveKey: Record<string, keyof PayrollMetrics> = { annual: "annualLeaveMinutes", sick: "sickLeaveMinutes", unpaid: "unpaidLeaveMinutes", other: "otherLeaveMinutes" };
  for (const leave of leaves) {
    const metric = leaveKey[leave.kind];
    if (metric) (forStaff(leave.staffId)[metric] as number) += Math.round(leave.hours * 60);
  }
  for (const entry of adjustments) {
    if (entry.status !== "approved") continue;
    const value = forStaff(entry.staffId);
    if (entry.kind === "reward") {
      value.rewardToman += entry.amountToman;
      if (entry.taxable) value.taxableRewardToman += entry.amountToman;
      if (entry.insurable) value.insurableRewardToman += entry.amountToman;
    } else value.penaltyToman += entry.amountToman;
  }
  for (const employee of employees) {
    const value = forStaff(employee.id);
    value.overtimeMinutes = employee.overtimeEligible ? Math.max(0, value.workMinutes - value.fridayMinutes - policy.standardMonthlyHours * 60) : 0;
    if (adjustments.some((entry) => entry.staffId === employee.id && entry.status === "pending")) value.warnings?.push("تشویقی یا جریمهٔ در انتظار تأیید در این محاسبه لحاظ نشده است.");
  }
  return result;
}

async function getRun(auth: AuthContext, runId: number) {
  const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.businessId, auth.business.id))).limit(1);
  if (!run) throw new HttpError(404, "لیست حقوق پیدا نشد");
  const [items, settlements, events] = await Promise.all([
    db.select().from(payrollItems).where(and(eq(payrollItems.runId, run.id), eq(payrollItems.businessId, auth.business.id))).orderBy(asc(payrollItems.id)),
    db.select({ settlement: payrollSettlements, bank: bankAccounts }).from(payrollSettlements).leftJoin(bankAccounts, eq(bankAccounts.id, payrollSettlements.bankAccountId)).where(and(eq(payrollSettlements.runId, run.id), eq(payrollSettlements.businessId, auth.business.id))).orderBy(asc(payrollSettlements.id)),
    db.select({ event: payrollItemEvents, actorName: users.name }).from(payrollItemEvents).innerJoin(users, eq(users.id, payrollItemEvents.actorId)).where(and(eq(payrollItemEvents.runId, run.id), eq(payrollItemEvents.businessId, auth.business.id))).orderBy(desc(payrollItemEvents.createdAt)),
  ]);
  const total = items.reduce((sum, item) => ({
    grossToman: sum.grossToman + item.grossToman, netToman: sum.netToman + item.netToman,
    employeeInsuranceToman: sum.employeeInsuranceToman + item.employeeInsuranceToman,
    employerInsuranceToman: sum.employerInsuranceToman + item.employerInsuranceToman,
    incomeTaxToman: sum.incomeTaxToman + item.incomeTaxToman,
  }), { grossToman: 0, netToman: 0, employeeInsuranceToman: 0, employerInsuranceToman: 0, incomeTaxToman: 0 });
  return { run, items, settlements: settlements.map((item) => ({ ...item.settlement, bankName: item.bank?.name ?? "صندوق" })), events: events.map((item) => ({ ...item.event, actorName: item.actorName })), total };
}

async function getRunResponse(auth: AuthContext, runId: number) {
  return flattenPayrollRun(await getRun(auth, runId));
}

function csvDownload(name: string, rows: (string | number | boolean | null)[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`\uFEFF${csv}`, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "no-store",
  } });
}

async function exportRun(auth: AuthContext, runId: number, type: string) {
  const data = await getRun(auth, runId);
  if (data.run.status !== "approved") throw new HttpError(409, "ابتدا لیست حقوق را تأیید و قطعی کنید");
  if (type !== "insurance" && type !== "tax") throw new HttpError(400, "نوع خروجی بیمه یا مالیات را انتخاب کنید");
  const monthLabel = `${data.run.jalaliYear}-${String(data.run.jalaliMonth).padStart(2, "0")}`;
  if (type === "insurance") {
    const rows: (string | number | boolean | null)[][] = [["شماره بیمه", "کد ملی", "نام و نام خانوادگی", "نام پدر", "عنوان شغلی", "کد شغل", "روز کارکرد برآوردی", "دستمزد مشمول بیمه (تومان)", "سهم بیمه‌شده (تومان)", "سهم کارفرما و بیکاری (تومان)", "جمع حق بیمه (تومان)"]];
    for (const item of data.items) {
      const snapshot = item.staffSnapshot as any;
      rows.push([snapshot.insuranceNumber ?? "", snapshot.nationalId ?? "", snapshot.name ?? "", snapshot.fatherName ?? "", snapshot.jobTitle ?? "", snapshot.jobCode ?? "", Math.min(jMonthLength(data.run.jalaliYear, data.run.jalaliMonth), Math.round(item.workMinutes / (44 / 6 / 60))), Number(snapshot.insuranceBaseToman ?? 0),
        item.employeeInsuranceToman, item.employerInsuranceToman, item.employeeInsuranceToman + item.employerInsuranceToman]);
    }
    rows.push(["توجه", "", "گزارش کمکی برای کنترل و ورود اطلاعات؛ قالب نهایی سامانه تأمین اجتماعی را با آخرین راهنمای سازمان تطبیق دهید.", "", "", "", "", "", "", ""]);
    return csvDownload(`insurance-${monthLabel}.csv`, rows);
  }
  const rows: (string | number | boolean | null)[][] = [["ماه", "کد ملی", "نام و نام خانوادگی", "عنوان شغلی", "درآمد مشمول مالیات (تومان)", "معافیت ماهانه (تومان)", "مالیات کسرشده (تومان)", "خالص حقوق (تومان)"]];
  const snapshot = data.run.policySnapshot as any;
  for (const item of data.items) {
    const employee = item.staffSnapshot as any;
    rows.push([monthLabel, employee.nationalId ?? "", employee.name ?? "", employee.jobTitle ?? "", Number(employee.taxableToman ?? 0), Number(snapshot.monthlyTaxExemptionToman ?? 0), item.incomeTaxToman, item.netToman]);
  }
  return csvDownload(`payroll-tax-${monthLabel}.csv`, rows);
}

async function handle(req: Request, auth: AuthContext, { path }: Ctx) {
  const [resource, id, action] = path;
  const method = req.method;
  const url = new URL(req.url);
  const query = url.searchParams;
  if (resource === "policy" && method === "GET") {
    const year = int(query.get("year"), "سال شمسی", 1380, 1500);
    const [items, banks] = await Promise.all([
      db.select({ id: staff.id, name: staff.name, role: staff.role, isActive: staff.isActive }).from(staff).where(eq(staff.businessId, auth.business.id)).orderBy(asc(staff.name)),
      db.select({ id: bankAccounts.id, name: bankAccounts.name, bank: bankAccounts.bank }).from(bankAccounts).where(eq(bankAccounts.businessId, auth.business.id)).orderBy(asc(bankAccounts.id)),
    ]);
    return JSON({ item: await getPolicy(auth.business.id, year), staff: items, banks });
  }
  if (resource === "policy" && method === "PUT") {
    const body = await readJson(req) as Record<string, unknown>;
    const year = int(body.jalaliYear, "سال شمسی", 1380, 1500);
    const value = cleanPolicy(body, year);
    const [item] = await db.insert(payrollPolicies).values({ ...value, businessId: auth.business.id, updatedBy: auth.user.id })
      .onConflictDoUpdate({ target: [payrollPolicies.businessId, payrollPolicies.jalaliYear], set: { ...value, updatedBy: auth.user.id, updatedAt: new Date() } }).returning();
    return JSON({ item });
  }
  if (resource === "runs" && !id && method === "GET") {
    const year = query.get("year") ? int(query.get("year"), "سال شمسی", 1380, 1500) : undefined;
    const conditions = [eq(payrollRuns.businessId, auth.business.id)];
    if (year) conditions.push(eq(payrollRuns.jalaliYear, year));
    const runs = await db.select().from(payrollRuns).where(and(...conditions)).orderBy(desc(payrollRuns.jalaliYear), desc(payrollRuns.jalaliMonth)).limit(36);
    if (!runs.length) return JSON({ items: [] });
    const items = await db.select().from(payrollItems).where(and(eq(payrollItems.businessId, auth.business.id), inArray(payrollItems.runId, runs.map((run) => run.id))));
    const settlements = await db.select().from(payrollSettlements).where(and(eq(payrollSettlements.businessId, auth.business.id), inArray(payrollSettlements.runId, runs.map((run) => run.id))));
    return JSON({ items: runs.map((run) => {
      const rows = items.filter((item) => item.runId === run.id);
      return { ...run, staffCount: rows.length, grossToman: rows.reduce((sum, item) => sum + item.grossToman, 0), netToman: rows.reduce((sum, item) => sum + item.netToman, 0), paidSalary: settlements.some((settlement) => settlement.runId === run.id && settlement.kind === "salary"), paidInsurance: settlements.some((settlement) => settlement.runId === run.id && settlement.kind === "insurance") };
    }) });
  }
  if (resource === "runs" && !id && method === "POST") {
    const body = await readJson(req) as Record<string, unknown>;
    const { year, month } = parsePeriod(body.period);
    const policy = await getPolicy(auth.business.id, year);
    const employees = await db.select().from(staff).where(and(eq(staff.businessId, auth.business.id), eq(staff.isActive, true))).orderBy(asc(staff.id));
    if (!employees.length) throw new HttpError(400, "برای این دوره کارمند فعالی ثبت نشده است");
    const metrics = await workMetrics(auth.business.id, year, month, employees, policy);
    const days = jMonthLength(year, month);
    const policySnapshot = { ...policy };
    try {
      const run = await db.transaction(async (tx) => {
        const [created] = await tx.insert(payrollRuns).values({ businessId: auth.business.id, jalaliYear: year, jalaliMonth: month, status: "draft", policySnapshot, createdBy: auth.user.id }).returning();
        const rows = employees.map((employee) => {
          const profile = profileOf(employee);
          const work = metrics.get(employee.id) ?? { workMinutes: 0, overtimeMinutes: 0, fridayMinutes: 0, holidayMinutes: 0, nightMinutes: 0, annualLeaveMinutes: 0, sickLeaveMinutes: 0, unpaidLeaveMinutes: 0, otherLeaveMinutes: 0, shortMinutes: 0, rewardToman: 0, taxableRewardToman: 0, insurableRewardToman: 0, penaltyToman: 0, warnings: [] };
          const calc = calculatePayroll({ profile, policy, year, month, monthDays: days, metrics: work });
          const staffSnapshot = { ...profile, taxableToman: calc.taxableToman, insuranceBaseToman: calc.insuranceBaseToman, warnings: calc.warnings, manualWarnings: work.warnings ?? [], rewardToman: work.rewardToman, taxableRewardToman: work.taxableRewardToman, insurableRewardToman: work.insurableRewardToman };
          return {
            businessId: auth.business.id, runId: created.id, staffId: employee.id, staffSnapshot,
            workMinutes: calc.workMinutes, overtimeMinutes: calc.overtimeMinutes, fridayMinutes: calc.fridayMinutes,
            holidayMinutes: calc.holidayMinutes, nightMinutes: calc.nightMinutes, leaveMinutes: calc.leaveMinutes,
            unpaidLeaveMinutes: calc.unpaidLeaveMinutes, shortMinutes: calc.shortMinutes,
            earnings: calc.earnings, deductions: calc.deductions, grossToman: calc.grossToman,
            employeeInsuranceToman: calc.employeeInsuranceToman, employerInsuranceToman: calc.employerInsuranceToman,
            incomeTaxToman: calc.incomeTaxToman, penaltyToman: calc.penaltyToman, netToman: calc.netToman,
            approvedTaxableAdjustmentsToman: work.taxableRewardToman, approvedInsurableAdjustmentsToman: work.insurableRewardToman,
          };
        });
        await tx.insert(payrollItems).values(rows);
        return created;
      });
      return JSON(await getRunResponse(auth, run.id), 201);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new HttpError(409, "برای این ماه قبلاً لیست حقوق ساخته شده است");
      throw error;
    }
  }
  if (resource === "runs" && id && action === "export" && method === "GET") return exportRun(auth, int(id, "شناسه لیست", 1), String(query.get("type") ?? ""));
  if (resource === "runs" && id && !action && method === "GET") return JSON(await getRunResponse(auth, int(id, "شناسه لیست", 1)));
  if (resource === "runs" && id && action === "recalculate" && method === "POST") {
    const runId = int(id, "شناسه لیست", 1);
    const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.businessId, auth.business.id))).limit(1);
    if (!run) throw new HttpError(404, "لیست حقوق پیدا نشد");
    if (run.status !== "draft") throw new HttpError(409, "لیست قطعی قفل است و بازسازی نمی‌شود");
    const currentItems = await db.select().from(payrollItems).where(and(eq(payrollItems.runId, run.id), eq(payrollItems.businessId, auth.business.id)));
    const employeeIds = currentItems.map((item) => item.staffId);
    const employees = await db.select().from(staff).where(and(eq(staff.businessId, auth.business.id), inArray(staff.id, employeeIds.length ? employeeIds : [0])));
    const workEdits = await db.select({ itemId: payrollItemEvents.itemId }).from(payrollItemEvents).where(and(eq(payrollItemEvents.runId, run.id), eq(payrollItemEvents.businessId, auth.business.id), eq(payrollItemEvents.action, "adjust_work_minutes")));
    const manuallyAdjustedItems = new Set(workEdits.map((event) => event.itemId));
    const byId = new Map(employees.map((employee) => [employee.id, employee]));
    const policy = await getPolicy(auth.business.id, run.jalaliYear);
    const freshMetrics = await workMetrics(auth.business.id, run.jalaliYear, run.jalaliMonth, employees, policy);
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(payrollRuns).where(and(eq(payrollRuns.id, run.id), eq(payrollRuns.businessId, auth.business.id))).for("update").limit(1);
      if (!locked || locked.status !== "draft") throw new HttpError(409, "لیست در همین زمان قطعی شده است");
      await tx.update(payrollRuns).set({ policySnapshot: { ...policy }, updatedAt: new Date() }).where(eq(payrollRuns.id, run.id));
      for (const item of currentItems) {
        const employee = byId.get(item.staffId);
        if (!employee) continue;
        const latest = freshMetrics.get(item.staffId) ?? { workMinutes: 0, overtimeMinutes: 0, fridayMinutes: 0, holidayMinutes: 0, nightMinutes: 0, annualLeaveMinutes: 0, sickLeaveMinutes: 0, unpaidLeaveMinutes: 0, otherLeaveMinutes: 0, shortMinutes: 0, rewardToman: 0, taxableRewardToman: 0, insurableRewardToman: 0, penaltyToman: 0, warnings: [] };
        const metrics: PayrollMetrics = manuallyAdjustedItems.has(item.id) ? {
          ...latest, workMinutes: item.workMinutes, overtimeMinutes: item.overtimeMinutes, fridayMinutes: item.fridayMinutes,
          holidayMinutes: item.holidayMinutes, nightMinutes: item.nightMinutes, unpaidLeaveMinutes: item.unpaidLeaveMinutes, shortMinutes: item.shortMinutes,
        } : latest;
        const profile = profileOf(employee);
        const calc = calculatePayroll({ profile, policy, year: run.jalaliYear, month: run.jalaliMonth, monthDays: jMonthLength(run.jalaliYear, run.jalaliMonth), metrics });
        const staffSnapshot = { ...profile, taxableToman: calc.taxableToman, insuranceBaseToman: calc.insuranceBaseToman, warnings: calc.warnings, manualWarnings: latest.warnings ?? [], rewardToman: latest.rewardToman, taxableRewardToman: latest.taxableRewardToman, insurableRewardToman: latest.insurableRewardToman };
        await tx.update(payrollItems).set({
          staffSnapshot, leaveMinutes: calc.leaveMinutes, unpaidLeaveMinutes: calc.unpaidLeaveMinutes,
          earnings: calc.earnings, deductions: calc.deductions, grossToman: calc.grossToman,
          employeeInsuranceToman: calc.employeeInsuranceToman, employerInsuranceToman: calc.employerInsuranceToman,
          incomeTaxToman: calc.incomeTaxToman, penaltyToman: calc.penaltyToman, netToman: calc.netToman,
          approvedTaxableAdjustmentsToman: latest.taxableRewardToman, approvedInsurableAdjustmentsToman: latest.insurableRewardToman, updatedAt: new Date(),
        }).where(eq(payrollItems.id, item.id));
      }
    });
    return JSON(await getRunResponse(auth, run.id));
  }
  if (resource === "runs" && id && !action && method === "PATCH") {
    const body = await readJson(req) as Record<string, unknown>;
    const runId = int(id, "شناسه لیست", 1);
    const itemId = int(body.itemId, "ردیف", 1);
    const reason = String(body.reason ?? "").trim().slice(0, 300);
    if (reason.length < 10) throw new HttpError(400, "برای اصلاح دستی کارکرد، دلیل حداقل ۱۰ حرفی ثبت کنید");
    const hours = ["workMinutes", "overtimeMinutes", "fridayMinutes", "holidayMinutes", "nightMinutes", "unpaidLeaveMinutes", "shortMinutes"];
    const set: Record<string, number> = {};
    for (const key of hours) if (key in body) set[key] = int(body[key], "ساعت کارکرد", 0, 100_000);
    if (!Object.keys(set).length) throw new HttpError(400, "ساعت یا کارکردی برای اصلاح ارسال نشده است");
    const updated = await db.transaction(async (tx) => {
      const [run] = await tx.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.businessId, auth.business.id))).for("update").limit(1);
      if (!run) throw new HttpError(404, "لیست حقوق پیدا نشد");
      if (run.status !== "draft") throw new HttpError(409, "لیست تأییدشده قفل است و تغییر نمی‌کند");
      const [item] = await tx.select().from(payrollItems).where(and(eq(payrollItems.id, itemId), eq(payrollItems.runId, run.id), eq(payrollItems.businessId, auth.business.id))).for("update").limit(1);
      if (!item) throw new HttpError(404, "ردیف حقوق پیدا نشد");
      const snapshot = item.staffSnapshot as any;
      const profile = snapshot as PayrollProfileCore;
      const oldPolicy = run.policySnapshot as PayrollPolicyCore;
      const metrics: PayrollMetrics = {
        workMinutes: set.workMinutes ?? item.workMinutes, overtimeMinutes: set.overtimeMinutes ?? item.overtimeMinutes,
        fridayMinutes: set.fridayMinutes ?? item.fridayMinutes, holidayMinutes: set.holidayMinutes ?? item.holidayMinutes,
        nightMinutes: set.nightMinutes ?? item.nightMinutes, annualLeaveMinutes: Math.max(0, item.leaveMinutes - item.unpaidLeaveMinutes),
        sickLeaveMinutes: 0, unpaidLeaveMinutes: set.unpaidLeaveMinutes ?? item.unpaidLeaveMinutes, otherLeaveMinutes: 0,
        shortMinutes: set.shortMinutes ?? item.shortMinutes, rewardToman: Number(snapshot.rewardToman ?? 0),
        taxableRewardToman: Number(snapshot.taxableRewardToman ?? 0), insurableRewardToman: Number(snapshot.insurableRewardToman ?? 0),
        penaltyToman: item.penaltyToman, warnings: Array.isArray(snapshot.manualWarnings) ? snapshot.manualWarnings : [],
      };
      const calc = calculatePayroll({ profile, policy: oldPolicy, year: run.jalaliYear, month: run.jalaliMonth, monthDays: jMonthLength(run.jalaliYear, run.jalaliMonth), metrics });
      const nextSnapshot = { ...snapshot, taxableToman: calc.taxableToman, insuranceBaseToman: calc.insuranceBaseToman, warnings: calc.warnings };
      const [saved] = await tx.update(payrollItems).set({ ...set, staffSnapshot: nextSnapshot, leaveMinutes: calc.leaveMinutes, earnings: calc.earnings, deductions: calc.deductions, grossToman: calc.grossToman, employeeInsuranceToman: calc.employeeInsuranceToman, employerInsuranceToman: calc.employerInsuranceToman, incomeTaxToman: calc.incomeTaxToman, penaltyToman: calc.penaltyToman, netToman: calc.netToman, updatedAt: new Date() }).where(eq(payrollItems.id, item.id)).returning();
      const beforeData = Object.fromEntries(Object.keys(set).map((key) => [key, item[key as keyof typeof item]]));
      const afterData = Object.fromEntries(Object.keys(set).map((key) => [key, set[key]]));
      await tx.insert(payrollItemEvents).values({ businessId: auth.business.id, runId: run.id, itemId: item.id, staffId: item.staffId, action: "adjust_work_minutes", beforeData, afterData, reason, actorId: auth.user.id });
      return saved;
    });
    return JSON({ item: updated });
  }
  if (resource === "runs" && id && action === "approve" && method === "POST") {
    const body = await readJson(req).catch(() => ({})) as Record<string, unknown>;
    const runId = int(id, "شناسه لیست", 1);
    const accountIds = await ensurePayrollAccountingAccounts(auth.business);
    const document = await db.transaction(async (tx) => {
      const [run] = await tx.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.businessId, auth.business.id))).for("update").limit(1);
      if (!run) throw new HttpError(404, "لیست حقوق پیدا نشد");
      if (run.status !== "draft") throw new HttpError(409, "این لیست قبلاً تأیید شده است");
      const items = await tx.select().from(payrollItems).where(and(eq(payrollItems.runId, run.id), eq(payrollItems.businessId, auth.business.id)));
      if (!items.length) throw new HttpError(400, "لیست خالی است");
      const warnings = items.flatMap((item) => (item.staffSnapshot as any).warnings ?? []);
      const approvalNote = String(body.approvalNote ?? "").trim().slice(0, 500);
      if (warnings.length && approvalNote.length < 10) throw new HttpError(409, "هشدارهای حقوق باید بررسی شوند؛ برای تأیید با وجود هشدار، دلیل حداقل ۱۰ حرفی ثبت کنید.");
      const totals = items.reduce((sum, item) => ({
        gross: sum.gross + item.grossToman, employeeInsurance: sum.employeeInsurance + item.employeeInsuranceToman,
        employerInsurance: sum.employerInsurance + item.employerInsuranceToman, tax: sum.tax + item.incomeTaxToman,
        penalty: sum.penalty + item.penaltyToman, net: sum.net + item.netToman,
      }), { gross: 0, employeeInsurance: 0, employerInsurance: 0, tax: 0, penalty: 0, net: 0 });
      const lines: LineIn[] = [];
      if (totals.gross > 0) lines.push({ accountId: accountIds.payrollExpenseId, debit: totals.gross, description: "هزینه حقوق ناخالص" });
      if (totals.employerInsurance > 0) lines.push({ accountId: accountIds.insuranceExpenseId, debit: totals.employerInsurance, description: "هزینه سهم کارفرما و بیمه بیکاری" });
      if (totals.net > 0) lines.push({ accountId: accountIds.salaryPayableId, credit: totals.net, description: "خالص حقوق پرداختنی کارکنان" });
      if (totals.tax > 0) lines.push({ accountId: accountIds.taxPayableId, credit: totals.tax, description: "مالیات حقوق کسرشده" });
      if (totals.employeeInsurance + totals.employerInsurance > 0) lines.push({ accountId: accountIds.insurancePayableId, credit: totals.employeeInsurance + totals.employerInsurance, description: "حق بیمه سهم کارکنان و کارفرما" });
      if (totals.penalty > 0) lines.push({ accountId: accountIds.deductionsPayableId, credit: totals.penalty, description: "کسورات ثبت‌شده در حقوق" });
      if (!lines.length) throw new HttpError(400, "مبلغ قابل ثبت در سند حقوق وجود ندارد");
      const posted = await postDocumentInTransaction(tx as unknown as typeof db, auth.business, {
        date: fromJ(run.jalaliYear, run.jalaliMonth, jMonthLength(run.jalaliYear, run.jalaliMonth)), source: "payroll", sourceRef: `payroll-run:${run.id}`,
        description: `سند حقوق و دستمزد ${run.jalaliYear}/${String(run.jalaliMonth).padStart(2, "0")}`, createdBy: auth.user.name, lines,
      });
      await tx.update(payrollRuns).set({ status: "approved", salaryDocumentId: posted.id, approvedBy: auth.user.id, approvedAt: new Date(), approvalNote, updatedAt: new Date() }).where(eq(payrollRuns.id, run.id));
      return posted;
    });
    return JSON({ ok: true, documentId: document.id, data: await getRunResponse(auth, runId) });
  }
  if (resource === "runs" && id && action === "settle" && method === "POST") {
    const body = await readJson(req) as Record<string, unknown>;
    const runId = int(id, "شناسه لیست", 1);
    const kind = String(body.kind ?? "");
    if (!["salary", "insurance", "tax"].includes(kind)) throw new HttpError(400, "نوع پرداخت حقوق، بیمه یا مالیات را انتخاب کنید");
    const from = String(body.from ?? "cash");
    if (!["cash", "bank"].includes(from)) throw new HttpError(400, "محل پرداخت معتبر نیست");
    const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.businessId, auth.business.id))).limit(1);
    if (!run || run.status !== "approved") throw new HttpError(409, "فقط لیست تأییدشده قابل پرداخت است");
    const items = await db.select().from(payrollItems).where(and(eq(payrollItems.runId, run.id), eq(payrollItems.businessId, auth.business.id)));
    const amount = kind === "salary" ? items.reduce((sum, item) => sum + item.netToman, 0)
      : kind === "insurance" ? items.reduce((sum, item) => sum + item.employeeInsuranceToman + item.employerInsuranceToman, 0)
        : items.reduce((sum, item) => sum + item.incomeTaxToman, 0);
    if (amount <= 0) throw new HttpError(400, "برای این نوع پرداخت مبلغی وجود ندارد");
    const accountIds = await ensurePayrollAccountingAccounts(auth.business);
    let bankId: number | null = null;
    let cashOrBankAccountId: number;
    if (from === "bank") {
      bankId = int(body.bankAccountId, "حساب بانکی", 1);
      const [bank] = await db.select({ id: bankAccounts.id }).from(bankAccounts).where(and(eq(bankAccounts.id, bankId), eq(bankAccounts.businessId, auth.business.id))).limit(1);
      if (!bank) throw new HttpError(400, "حساب بانکی متعلق به این کسب‌وکار نیست");
      cashOrBankAccountId = await bankDetailId(auth.business, bankId);
    } else {
      const [cash] = await db.select({ id: accAccounts.id }).from(accAccounts).where(and(eq(accAccounts.businessId, auth.business.id), eq(accAccounts.code, "1101"), eq(accAccounts.isActive, true))).limit(1);
      if (!cash) throw new HttpError(409, "حساب صندوق در کدینگ فعال نیست");
      cashOrBankAccountId = cash.id;
    }
    const payableId = kind === "salary" ? accountIds.salaryPayableId : kind === "insurance" ? accountIds.insurancePayableId : accountIds.taxPayableId;
    const title = kind === "salary" ? "پرداخت خالص حقوق" : kind === "insurance" ? "پرداخت حق بیمه تأمین اجتماعی" : "پرداخت مالیات حقوق";
    const settled = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(payrollRuns).where(and(eq(payrollRuns.id, run.id), eq(payrollRuns.businessId, auth.business.id))).for("update").limit(1);
      if (!locked || locked.status !== "approved") throw new HttpError(409, "لیست حقوق دیگر قابل پرداخت نیست");
      const [existing] = await tx.select().from(payrollSettlements).where(and(eq(payrollSettlements.runId, run.id), eq(payrollSettlements.kind, kind))).limit(1);
      if (existing) throw new HttpError(409, "این نوع پرداخت قبلاً برای این لیست ثبت شده است");
      const doc = await postDocumentInTransaction(tx as unknown as typeof db, auth.business, {
        date: new Date(), source: "payroll", sourceRef: `payroll-settlement:${run.id}:${kind}`,
        description: `${title} ${run.jalaliYear}/${String(run.jalaliMonth).padStart(2, "0")}`,
        createdBy: auth.user.name,
        lines: [
          { accountId: payableId, debit: amount, description: title },
          { accountId: cashOrBankAccountId, credit: amount, description: from === "bank" ? `پرداخت از حساب بانکی #${bankId}` : "پرداخت نقدی از صندوق" },
        ],
      });
      const [row] = await tx.insert(payrollSettlements).values({ businessId: auth.business.id, runId: run.id, kind, amountToman: amount, bankAccountId: bankId, accountingDocumentId: doc.id, createdBy: auth.user.id }).returning();
      return row;
    });
    return JSON({ item: settled, data: await getRunResponse(auth, run.id) }, 201);
  }
  if (resource === "leaves" && !id && method === "GET") {
    const { year, month } = parsePeriod(query.get("period"));
    const items = await db.select({ leave: staffPayrollLeaves, name: staff.name }).from(staffPayrollLeaves).innerJoin(staff, eq(staff.id, staffPayrollLeaves.staffId)).where(and(eq(staffPayrollLeaves.businessId, auth.business.id), eq(staffPayrollLeaves.jalaliYear, year), eq(staffPayrollLeaves.jalaliMonth, month))).orderBy(desc(staffPayrollLeaves.createdAt));
    return JSON({ items: items.map((entry) => ({ ...entry.leave, staffName: entry.name })) });
  }
  if (resource === "leaves" && !id && method === "POST") {
    const body = await readJson(req) as Record<string, unknown>;
    const { year, month } = parsePeriod(body.period);
    const staffId = int(body.staffId, "کارمند", 1);
    const [employee] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.id, staffId), eq(staff.businessId, auth.business.id), eq(staff.isActive, true))).limit(1);
    if (!employee) throw new HttpError(404, "کارمند فعال پیدا نشد");
    const kind = String(body.kind ?? "");
    if (!["annual", "sick", "unpaid", "other"].includes(kind)) throw new HttpError(400, "نوع مرخصی معتبر نیست");
    const hours = Number(digits(body.hours));
    if (!Number.isFinite(hours) || hours <= 0 || hours > 744) throw new HttpError(400, "ساعات مرخصی باید بین صفر و ۷۴۴ باشد");
    const [item] = await db.insert(staffPayrollLeaves).values({ businessId: auth.business.id, staffId, jalaliYear: year, jalaliMonth: month, kind, hours, note: String(body.note ?? "").trim().slice(0, 300), createdBy: auth.user.id, status: "approved", decidedBy: auth.user.id, decidedAt: new Date() }).returning();
    return JSON({ item }, 201);
  }
  if (resource === "adjustments" && !id && method === "GET") {
    const { year, month } = parsePeriod(query.get("period"));
    const items = await db.select({ adjustment: staffPayrollAdjustments, name: staff.name }).from(staffPayrollAdjustments).innerJoin(staff, eq(staff.id, staffPayrollAdjustments.staffId)).where(and(eq(staffPayrollAdjustments.businessId, auth.business.id), eq(staffPayrollAdjustments.jalaliYear, year), eq(staffPayrollAdjustments.jalaliMonth, month))).orderBy(desc(staffPayrollAdjustments.createdAt));
    return JSON({ items: items.map((entry) => ({ ...entry.adjustment, staffName: entry.name })) });
  }
  if (resource === "adjustments" && !id && method === "POST") {
    const body = await readJson(req) as Record<string, unknown>;
    const { year, month } = parsePeriod(body.period);
    const staffId = int(body.staffId, "کارمند", 1);
    const [employee] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.id, staffId), eq(staff.businessId, auth.business.id), eq(staff.isActive, true))).limit(1);
    if (!employee) throw new HttpError(404, "کارمند فعال پیدا نشد");
    const kind = String(body.kind ?? "");
    if (kind !== "reward" && kind !== "penalty") throw new HttpError(400, "نوع تشویقی یا جریمه معتبر نیست");
    const amountToman = int(body.amountToman, "مبلغ", 1);
    const description = String(body.description ?? "").trim().slice(0, 300);
    const legalBasis = String(body.legalBasis ?? "").trim().slice(0, 300);
    if (!description) throw new HttpError(400, "شرح تشویقی یا جریمه را وارد کنید");
    if (kind === "penalty" && legalBasis.length < 10) throw new HttpError(400, "برای ثبت جریمه، مبنای قانونی/مستند قابل بررسی را بنویسید");
    const [item] = await db.insert(staffPayrollAdjustments).values({
      businessId: auth.business.id, staffId, jalaliYear: year, jalaliMonth: month, kind, amountToman, description, legalBasis,
      taxable: body.taxable !== false, insurable: body.insurable !== false,
      status: "pending", createdBy: auth.user.id,
    }).returning();
    return JSON({ item }, 201);
  }
  if (resource === "adjustments" && id && method === "PATCH") {
    const body = await readJson(req) as Record<string, unknown>;
    const status = String(body.status ?? "");
    if (!(["approved", "rejected"] as string[]).includes(status)) throw new HttpError(400, "تصمیم معتبر نیست");
    const [item] = await db.update(staffPayrollAdjustments).set({ status, approvedBy: auth.user.id, approvedAt: new Date() }).where(and(eq(staffPayrollAdjustments.id, int(id, "شناسه", 1)), eq(staffPayrollAdjustments.businessId, auth.business.id), eq(staffPayrollAdjustments.status, "pending"))).returning();
    if (!item) throw new HttpError(404, "درخواست باز پیدا نشد");
    return JSON({ item });
  }
  throw new HttpError(404, "مسیر حقوق و دستمزد پیدا نشد");
}

const access = { feature: "payroll", manager: true, roles: ["accountant"] };
const reader = withAuth<Ctx>(handle, { feature: "payroll", roles: ["accountant"] });
const writer = withAuth<Ctx>(handle, access);
export const GET = reader;
export const POST = writer;
export const PATCH = writer;
export const PUT = writer;
