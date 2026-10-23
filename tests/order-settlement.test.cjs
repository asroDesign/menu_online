const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadSettlement() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/order-settlement-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports });
  return box.exports;
}

test('settlement divides one invoice between cash, a selected bank, POS, and an explicit receivable remainder', () => {
  const { normalizeSettlementInput, settlementMethod } = loadSettlement();
  const plan = normalizeSettlementInput({
    cashAmount: 200, bankAmount: 150, bankAccountId: 4,
    posAmount: 500, posDeviceId: 8, posBankAccountId: 9, allowDebt: true, idempotencyKey: 'settlement-123',
  }, 1000);
  assert.equal(plan.creditAmount, 150);
  assert.equal(settlementMethod(plan), 'mixed');
  assert.equal(normalizeSettlementInput({ cashAmount: 1000, bankAmount: 0, posAmount: 0, allowDebt: false, idempotencyKey: 'settlement-456' }, 1000).creditAmount, 0);
});

test('settlement rejects overpayment, omitted debt consent, incomplete bank or POS choices, and malformed money', () => {
  const { normalizeSettlementInput } = loadSettlement();
  const validKey = 'settlement-123';
  assert.throws(() => normalizeSettlementInput({ cashAmount: 501, bankAmount: 500, posAmount: 0, allowDebt: false, idempotencyKey: validKey }, 1000), /بیشتر/);
  assert.throws(() => normalizeSettlementInput({ cashAmount: 500, bankAmount: 0, posAmount: 0, allowDebt: false, idempotencyKey: validKey }, 1000), /بدهکاران/);
  assert.throws(() => normalizeSettlementInput({ cashAmount: 0, bankAmount: 1000, bankAccountId: null, posAmount: 0, allowDebt: false, idempotencyKey: validKey }, 1000), /حساب بانکی/);
  assert.throws(() => normalizeSettlementInput({ cashAmount: 0, bankAmount: 0, posAmount: 1000, posDeviceId: null, posBankAccountId: 2, allowDebt: false, idempotencyKey: validKey }, 1000), /کارتخوان/);
  assert.throws(() => normalizeSettlementInput({ cashAmount: 0, bankAmount: 0, posAmount: 1000, posDeviceId: 2, posBankAccountId: null, allowDebt: false, idempotencyKey: validKey }, 1000), /حساب بانکی واریز کارتخوان/);
  assert.throws(() => normalizeSettlementInput({ cashAmount: -1, bankAmount: 0, posAmount: 0, allowDebt: false, idempotencyKey: validKey }, 1000), /عدد صحیح/);
});

test('orders page records tender breakdown and ordinary status API cannot mark unpaid orders paid', () => {
  const page = source('src/modules/orders.tsx');
  const route = source('src/app/api/orders/[id]/route.ts');
  const cashier = source('src/app/api/orders/[id]/cashier/route.ts');
  const accounting = source('src/lib/accounting.ts');
  const report = source('src/lib/registry-a.ts');
  assert.match(page, /ثبت پرداخت/);
  assert.match(page, /action: "settle"/);
  assert.match(page, /ثبت باقیمانده در دفتر بدهکاران/);
  assert.match(cashier, /createPosRequest\(auth\.business, orderId, plan\.posDeviceId, plan\)/);
  assert.match(route, /b\.status === "paid" && existing\.paymentStatus !== "paid"/);
  assert.match(accounting, /refType: "pos"/);
  assert.match(accounting, /مانده در دفتر بدهکاران سفارش/);
  assert.match(accounting, /posBankAccountId/);
  assert.match(report, /کارتخوان — \$\{terminal\.name\}/);
});

test('cashier POS choices and accounting use the terminal number without exposing the device token', () => {
  const options = source('src/app/api/orders/settlement-options/route.ts');
  const hardware = source('src/modules/hardware.tsx');
  const accounting = source('src/lib/accounting.ts');
  const ledger = source('src/lib/registry-a.ts');
  const migration = source('src/db/migrations/0046_order_tender_settlement.sql');
  assert.match(hardware, /label="شماره ترمینال پوز"/);
  assert.match(hardware, /saveTerminalNumber/);
  assert.match(hardware, /method: "PATCH", body: \{ terminalNumber: value \}/);
  assert.match(options, /terminalNumber: devices\.terminalNumber/);
  assert.doesNotMatch(options, /code: devices\.code/);
  assert.match(accounting, /شماره \$\{device\.terminalNumber\}/);
  assert.match(ledger, /شماره \$\{terminal\.terminalNumber\}/);
  assert.match(migration, /ADD COLUMN terminal_number text NOT NULL DEFAULT ''/);
});
