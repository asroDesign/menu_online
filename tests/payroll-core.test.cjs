const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function load(file) {
  const moduleBox = { exports: {} };
  const js = ts.transpileModule(source(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, { module: moduleBox, exports: moduleBox.exports, require, Date, Math, Number, String, Set, Array, Object, RegExp });
  return moduleBox.exports;
}

const { calculatePayroll, defaultPayrollPolicy, progressivePayrollTax, classifyAttendanceInterval } = load('src/lib/payroll-core.ts');
const { staffPayrollPatch } = load('src/lib/staff-payroll-profile.ts');
const { flattenPayrollRun } = load('src/lib/payroll-run-response.ts');

function profile(overrides = {}) {
  return {
    id: 1, name: 'کارمند آزمایشی', maritalStatus: 'single', childrenCount: 0, childAllowanceEligible: false,
    insuredHistoryDays: 0, salaryMode: 'statutory', monthlyBaseSalaryToman: 60_000_000, fixedAgreedSalaryToman: 0,
    managementAllowanceToman: 0, annualServiceBaseToman: 0, overtimeEligible: true, insuranceEnabled: true,
    incomeTaxEnabled: true, includeHousing: false, includeFood: false, includeMaritalAllowance: false,
    includeChildAllowance: false, includeSeniority: false, ...overrides,
  };
}

const noWork = { workMinutes: 0, overtimeMinutes: 0, fridayMinutes: 0, holidayMinutes: 0, nightMinutes: 0, annualLeaveMinutes: 0, sickLeaveMinutes: 0, unpaidLeaveMinutes: 0, otherLeaveMinutes: 0, shortMinutes: 0, rewardToman: 0, taxableRewardToman: 0, insurableRewardToman: 0, penaltyToman: 0 };

test('progressive tax uses incremental bands above the monthly exemption', () => {
  const bands = [
    { upToToman: 40_000_000, ratePercent: 10 },
    { upToToman: 60_000_000, ratePercent: 15 },
    { upToToman: 80_000_000, ratePercent: 20 },
    { upToToman: 100_000_000, ratePercent: 25 },
    { upToToman: null, ratePercent: 30 },
  ];
  assert.equal(progressivePayrollTax(40_000_000, 40_000_000, bands), 0);
  assert.equal(progressivePayrollTax(100_000_000, 40_000_000, bands), 7_000_000);
  assert.equal(progressivePayrollTax(160_000_000, 40_000_000, bands), 22_000_000);
});

test('fixed agreed salary can be paid without optional benefits while statutory deductions remain separately calculated', () => {
  const policy = defaultPayrollPolicy(1405);
  const result = calculatePayroll({
    profile: profile({ salaryMode: 'fixed', monthlyBaseSalaryToman: 0, fixedAgreedSalaryToman: 60_000_000 }),
    policy, year: 1405, month: 7, monthDays: 30, metrics: noWork,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.earnings.map((entry) => entry.key))), ['base']);
  assert.equal(result.grossToman, 60_000_000);
  assert.equal(result.employeeInsuranceToman, 4_200_000);
  assert.equal(result.incomeTaxToman, 2_000_000);
  assert.equal(result.netToman, 53_800_000);
});

test('tenure allowance starts after a year but is not multiplied by years of service', () => {
  const policy = { ...defaultPayrollPolicy(1405), monthlyTaxExemptionToman: 999_000_000 };
  const result = calculatePayroll({
    profile: profile({ monthlyBaseSalaryToman: 30_000_000, employmentStartDate: '2018-01-01', includeSeniority: true }),
    policy, year: 1405, month: 7, monthDays: 30, metrics: noWork,
  });
  const seniority = result.earnings.find((entry) => entry.key === 'seniority');
  assert.equal(seniority.amountToman, 500_000);
});

test('daily minimum wage and monthly base are prorated on a 30-day wage basis', () => {
  const policy = { ...defaultPayrollPolicy(1405), monthlyTaxExemptionToman: 999_000_000 };
  const result = calculatePayroll({
    profile: profile({ monthlyBaseSalaryToman: policy.minimumDailyWageToman * 30 }),
    policy, year: 1405, month: 1, monthDays: 31, metrics: noWork,
  });
  assert.equal(result.grossToman, policy.minimumDailyWageToman * 31);
  assert.equal(result.warnings.some((warning) => warning.includes('کمتر از کف مزد')), false);
});

test('attendance splitting counts Tehran Friday and the 22:00–06:00 night interval', () => {
  const result = classifyAttendanceInterval(new Date('2026-10-23T18:00:00Z'), new Date('2026-10-23T20:00:00Z'));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { totalMinutes: 120, fridayMinutes: 120, nightMinutes: 90 });
});

test('staff payroll profile rejects impossible dates and accepts a real leap day', () => {
  assert.throws(() => staffPayrollPatch({ birthDate: '2025-02-29' }), /تاریخ استخدام یا تولد معتبر نیست/);
  assert.equal(staffPayrollPatch({ birthDate: '2024-02-29' }).birthDate, '2024-02-29');
  assert.equal(staffPayrollPatch({ nationalId: '۱۲۳۴۵۶۷۸۹۰' }).nationalId, '1234567890');
  assert.equal(staffPayrollPatch({ nationalId: '١٢٣٤٥٦٧٨٩٠' }).nationalId, '1234567890');
  assert.equal(staffPayrollPatch({ iban: 'ir123456789012345678901234' }).iban, 'IR123456789012345678901234');
  assert.throws(() => staffPayrollPatch({ iban: 'IR123' }), /شماره شبا/);
  assert.throws(() => staffPayrollPatch({ employmentStartDate: '2025-02-01', employmentEndDate: '2025-01-01' }), /تاریخ پایان/);
});

test('payroll API keeps settlement and approval in accounting transactions and exports the insured wage base', () => {
  const route = source('src/app/api/payroll/[...path]/route.ts');
  assert.match(route, /eq\(payrollRuns\.businessId, auth\.business\.id\)/);
  assert.match(route, /sourceRef: `payroll-run:\$\{run\.id\}`/);
  assert.match(route, /sourceRef: `payroll-settlement:\$\{run\.id\}:\$\{kind\}`/);
  assert.match(route, /tx\.insert\(payrollSettlements\)/);
  assert.match(route, /snapshot\.insuranceBaseToman/);
  assert.match(route, /payrollItemEvents/);
  assert.match(route, /manuallyAdjustedItems\.has\(item\.id\)/);
  assert.doesNotMatch(route, /businessId: 0/);
  assert.match(route, /item\.status === "absent"/);
  assert.match(route, /withAuth<Ctx>\(handle, access\)/);
});

test('payroll run detail response exposes its id at the root for the payslip link', () => {
  const response = flattenPayrollRun({
    run: { id: 42, jalaliYear: 1405, jalaliMonth: 7, status: 'draft' },
    items: [{ id: 15, staffId: 15 }], total: { netToman: 100 }, settlements: [], events: [],
  });
  assert.equal(response.id, 42);
  assert.equal(response.items[0].staffId, 15);
  assert.match(source('src/modules/payroll.tsx'), /payslip\/\$\{run\.id\}\/\$\{item\.staffId\}/);
  const route = source('src/app/api/payroll/[...path]/route.ts');
  assert.match(route, /return flattenPayrollRun\(await getRun\(auth, runId\)\)/);
  assert.doesNotMatch(route, /JSON\(await getRun\(auth,/);
});

test('payroll migration has a rollback for employee fields and all payroll ledgers', () => {
  const up = source('src/db/migrations/0053_payroll.sql');
  const down = source('src/db/migrations/0053_payroll.down.sql');
  for (const table of ['payroll_policies', 'payroll_runs', 'payroll_items', 'payroll_item_events', 'staff_payroll_adjustments', 'staff_payroll_leaves', 'payroll_settlements']) {
    assert.match(up, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(down, new RegExp(`DROP TABLE IF EXISTS ${table}`));
  }
  assert.match(down, /DROP COLUMN IF EXISTS national_id/);
  assert.match(down, /DROP COLUMN IF EXISTS iban/);
});
