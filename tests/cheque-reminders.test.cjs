const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const box = { exports: {} };
const js = ts.transpileModule(source('src/lib/cheque-reminders-core.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(js, { module: box, exports: box.exports, Date, Intl, String, Number, Math, RegExp });
const { chequeReminderSendDate, isChequeReminderDueToday, normalizeChequeReminderSettings, normalizeIranianDigits, normalizeIranianMobile, tehranDayKey } = box.exports;

test('cheque reminders use Tehran calendar days and honor 0–30 day settings', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeChequeReminderSettings(undefined))), { enabled: true, daysBefore: 2, smsEnabled: true, managerPhone: '' });
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeChequeReminderSettings({ enabled: false, daysBefore: 45, smsEnabled: false, managerPhone: '۰۹۳۰۷۸۵۸۷۲۴' }))), { enabled: false, daysBefore: 30, smsEnabled: false, managerPhone: '09307858724' });
  assert.equal(chequeReminderSendDate('2026-10-27T13:00:00.000Z', 2), '2026-10-25');
  assert.equal(isChequeReminderDueToday('2026-10-27T13:00:00.000Z', 2, '2026-10-25T10:00:00.000Z'), true);
  assert.equal(isChequeReminderDueToday('2026-10-27T13:00:00.000Z', 2, '2026-10-24T10:00:00.000Z'), false);
  assert.equal(tehranDayKey('2026-10-25T21:00:00.000Z'), '2026-10-26');
  assert.equal(chequeReminderSendDate('2026-10-26T21:00:00.000Z', 0), '2026-10-27');
});

test('beneficiary endpoints validate contact data and scope both reads and writes to the active business', () => {
  const route = source('src/app/api/cheques/beneficiaries/route.ts');
  assert.match(route, /eq\(chequeBeneficiaries\.businessId, auth\.business\.id\)/);
  assert.match(route, /validNationalId\(nationalId\)/);
  assert.match(route, /normalizeIranianMobile\(body\.phone\)/);
  assert.match(route, /businessId: auth\.business\.id/);
  assert.match(route, /onConflictDoNothing/);
  assert.equal(normalizeIranianDigits('۰۹۳۰۷۸۵۸۷۲۴'), '09307858724');
  assert.equal(normalizeIranianMobile('۰۹۳۰۷۸۵۸۷۲۴'), '09307858724');
  assert.equal(normalizeIranianMobile('۱۲۳'), '');
});

test('cheque entry stores issue, serial, branch, beneficiary and purpose fields with tenant uniqueness', () => {
  const route = source('src/app/api/cheques/route.ts');
  const schema = source('src/db/schema.ts');
  const migration = source('src/db/migrations/0051_cheque_beneficiaries_reminders.sql');
  for (const field of ['beneficiaryId', 'issueDate', 'chequeNumber', 'serialNumber', 'bank', 'branch', 'expensePurpose']) {
    assert.match(route, new RegExp(`\\b${field}\\b`));
    assert.match(schema, new RegExp(`\\b${field}\\b`));
  }
  assert.match(route, /eq\(chequeBeneficiaries\.businessId, auth\.business\.id\)/);
  assert.match(route, /issueDate\.getTime\(\) > dueDate\.getTime\(\)/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS cheques_business_serial_number_idx/);
  assert.match(migration, /cheque_reminders_once_idx/);
});

test('scheduled SMS requires a configured template and SMS entitlement, logs outcome, and de-duplicates per cheque/day', () => {
  const sms = source('src/lib/sms.ts');
  const cron = source('src/app/api/cron/sms/route.ts');
  const registry = source('src/lib/registry-sms.ts');
  const templateUi = source('src/modules/sms.tsx');
  assert.match(sms, /eq\(chequeReminders\.businessId, biz\.id\)/);
  assert.match(sms, /onConflictDoNothing\(\)/);
  assert.match(sms, /eq\(chequeReminders\.status, "failed"\)/);
  assert.match(sms, /eq\(smsTemplates\.purpose, "cheque_due_reminder"\)/);
  assert.match(sms, /hasAny\(await featuresOf\(biz\), "sms"\)/);
  assert.match(sms, /kind: "cheque_due_reminder"/);
  assert.match(cron, /runChequeReminders\(\)/);
  assert.match(registry, /"cheque_due_reminder"/);
  assert.match(templateUi, /یادآوری سررسید چک/);
});

test('dashboard notification feed includes only tenant-owned open cheques inside the configured reminder window', () => {
  const route = source('src/app/api/r/dashboard-notifications/route.ts');
  const component = source('src/components/dashboard-notification-center.tsx');
  const core = source('src/lib/dashboard-notifications.ts');
  assert.match(route, /hasAny\(auth\.features, "cheque_register"\)/);
  assert.match(route, /eq\(cheques\.businessId, auth\.business\.id\)/);
  assert.match(route, /eq\(cheques\.status, "registered"\)/);
  assert.match(route, /cheques: chequeDue/);
  assert.match(component, /یادآوری سررسید چک/);
  assert.match(component, /menupeak:cheque-reminders:/);
  assert.match(core, /groups\.cheques\?\.length/);
});
