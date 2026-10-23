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

test('orders show payment state, separate the unpaid queue, and confirm card transfers without hiding the order status', () => {
  const module = source('src/modules/orders.tsx');
  const route = source('src/app/api/orders/[id]/route.ts');
  assert.match(module, /function PaymentStatusBadge/);
  assert.match(module, /key: "unpaid", label: "پرداخت‌نشده"/);
  assert.match(module, /سفارش‌های پرداخت‌نشده/);
  assert.match(module, /selected\.paymentStatus !== "paid"/);
  assert.match(module, /body: \{ confirmPayment: true \}/);
  assert.match(module, /feat\.has\("tablet_pos"\) && selected\.paymentStatus !== "paid"/);
  assert.match(route, /if \(b\.confirmPayment === true\)/);
  assert.match(route, /auth\.role !== "cashier"/);
  assert.match(route, /settleOrder\(business, auth\.features, oid, "card_to_card", false/);
});
