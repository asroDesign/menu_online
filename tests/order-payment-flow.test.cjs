const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadWorkflow() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/order-workflow-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports });
  return box.exports;
}

test('the first successful payment sends unpaid orders into preparation without marking them completed', () => {
  const { orderStatusAfterPayment } = loadWorkflow();
  assert.equal(orderStatusAfterPayment('awaiting_payment'), 'preparing');
  assert.equal(orderStatusAfterPayment('pending'), 'preparing');
  assert.equal(orderStatusAfterPayment('preparing'), 'preparing');
  assert.equal(orderStatusAfterPayment('ready'), 'ready');
  assert.equal(orderStatusAfterPayment('served', { markCompleted: true }), 'paid');
  assert.equal(orderStatusAfterPayment('pending', { creditSale: true }), 'pending');
  assert.equal(orderStatusAfterPayment('canceled', { reopen: true }), 'preparing');
});

test('orders collect an explicit payment split and cannot confirm a card transfer as an implicit full-total payment', () => {
  const module = source('src/modules/orders.tsx');
  const route = source('src/app/api/orders/[id]/route.ts');
  const cashier = source('src/app/api/orders/[id]/cashier/route.ts');
  assert.match(module, /function PaymentStatusBadge/);
  assert.match(module, /key: "unpaid", label: "پرداخت‌نشده"/);
  assert.match(module, /سفارش‌های پرداخت‌نشده/);
  assert.match(module, /selected\.paymentStatus !== "paid"/);
  assert.match(module, /AmountInput value=\{cashAmount\}/);
  assert.match(module, /AmountInput value=\{bankAmount\}/);
  assert.match(module, /AmountInput value=\{posAmount\}/);
  assert.match(module, /ثبت باقیمانده در دفتر بدهکاران/);
  assert.match(cashier, /action === "settle"/);
  assert.match(cashier, /createPosRequest\(auth\.business, orderId, plan\.posDeviceId, plan\)/);
  assert.match(route, /برای ثبت پرداخت، مبلغ نقدی، بانکی، کارتخوان/);
  assert.match(route, /b\.status === "paid" && existing\.paymentStatus !== "paid"/);
});
