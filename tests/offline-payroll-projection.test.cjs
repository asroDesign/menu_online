const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync(new URL('../src/lib/offline-payroll-core.ts', `file://${__filename}`), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', compiled)(loaded.exports, require, loaded);
const { projectOfflinePayslipLines, projectOfflinePayslipStaff } = loaded.exports;

test('offline payslip projection keeps only fields needed by printable slips', () => {
  const person = projectOfflinePayslipStaff({
    name: ' کارمند ', fatherName: 'پدر', nationalId: '۰۰۱۲۳۴۵۶۷۸', insuranceNumber: '123',
    jobTitle: 'صندوقدار', jobCode: 'S-1', employmentStartDate: '1402/01/01', bankAccountNumber: '111', iban: 'IR12',
    maritalStatus: 'married', salaryMode: 'fixed', monthlyBaseSalaryToman: 100000, phone: '0912',
    warnings: [' بررسی شود ', 9], unexpected: 'secret',
  });
  assert.deepEqual(person, {
    name: 'کارمند', fatherName: 'پدر', nationalId: '۰۰۱۲۳۴۵۶۷۸', insuranceNumber: '123',
    jobTitle: 'صندوقدار', jobCode: 'S-1', employmentStartDate: '1402/01/01', bankAccountNumber: '111', iban: 'IR12',
    warnings: [' بررسی شود '],
  });
  assert.equal('salaryMode' in person, false);
  assert.equal('phone' in person, false);
});

test('offline payslip lines are bounded and reject malformed or unsafe amounts', () => {
  const lines = projectOfflinePayslipLines(
    [{ key: 'base', label: 'حقوق پایه', amountToman: 1000, taxable: true, insurable: true, hidden: 'discard' }, { key: 'bad', label: 'عدد خراب', amountToman: Number.MAX_SAFE_INTEGER + 1 }],
    [{ key: 'tax', label: 'مالیات', amountToman: 100, accounting: true, bankAccountNumber: 'discard' }],
  );
  assert.deepEqual(lines, {
    earnings: [{ key: 'base', label: 'حقوق پایه', amountToman: 1000, taxable: true, insurable: true }],
    deductions: [{ key: 'tax', label: 'مالیات', amountToman: 100, accounting: true }],
  });
});
