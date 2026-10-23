const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function source(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function loadPolicy() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/printer-policy.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Array, Number, Object, Set, String, Math });
  return box.exports;
}

test('default print workflow routes creation, no-table, settlement and completion separately', () => {
  const { DEFAULT_PRINTER_SETTINGS, printOutputs } = loadPolicy();
  assert.deepEqual(JSON.parse(JSON.stringify(printOutputs(DEFAULT_PRINTER_SETTINGS, 'created_with_table'))), [
    { kind: 'customer', copies: 1, printerId: null },
    { kind: 'kitchen', copies: 1, printerIds: [] },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(printOutputs(DEFAULT_PRINTER_SETTINGS, 'created_without_table'))), [
    { kind: 'kitchen', copies: 1, printerIds: [] },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(printOutputs(DEFAULT_PRINTER_SETTINGS, 'settled'))).map((row) => row.kind), ['customer', 'cafe']);
  assert.deepEqual(JSON.parse(JSON.stringify(printOutputs(DEFAULT_PRINTER_SETTINGS, 'completed'))).map((row) => row.kind), ['customer']);
});

test('printer settings are bounded and selections can be checked against tenant-owned devices', () => {
  const { normalizePrinterSettings, validatePrinterSelection } = loadPolicy();
  const value = normalizePrinterSettings({
    receiptHeader: `  ${'س'.repeat(510)}  `,
    rules: { created_with_table: { customerCopies: 12, kitchenCopies: -2, cafeCopies: 1.7, customerPrinterId: 8, kitchenPrinterIds: [4, 4, 0, -1], cafePrinterId: 9 } },
  });
  assert.equal(value.receiptHeader.length, 500);
  assert.equal(value.rules.created_with_table.customerCopies, 5);
  assert.equal(value.rules.created_with_table.kitchenCopies, 0);
  assert.equal(value.rules.created_with_table.cafeCopies, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(value.rules.created_with_table.kitchenPrinterIds)), [4]);
  assert.equal(validatePrinterSelection(value, new Set([4, 8, 9])), true);
  assert.equal(validatePrinterSelection(value, new Set([4, 8])), false);
});

test('explicit printer routes stay in the custom layout after saving, even when copy counts match a preset', () => {
  const { DEFAULT_PRINTER_SETTINGS, applyPrintCopyPreset, printerRulePresetKey } = loadPolicy();
  const presets = [
    { key: 'kitchen', customer: 0, kitchen: 1, cafe: 0 },
    { key: 'both', customer: 1, kitchen: 1, cafe: 0 },
  ];
  const withKitchenPrinter = {
    ...DEFAULT_PRINTER_SETTINGS.rules.created_with_table,
    kitchenPrinterIds: [21],
  };
  assert.equal(printerRulePresetKey(withKitchenPrinter, presets), 'custom');
  assert.equal(printerRulePresetKey({ ...withKitchenPrinter, kitchenPrinterIds: [] }, presets), 'both');
  assert.equal(printerRulePresetKey({ ...withKitchenPrinter, kitchenPrinterIds: [], customerPrinterId: 22 }, presets), 'custom');
  assert.equal(printerRulePresetKey({ ...withKitchenPrinter, kitchenCopies: 2, kitchenPrinterIds: [] }, presets), 'custom');
  const selectedPreset = applyPrintCopyPreset(withKitchenPrinter, presets[1]);
  assert.equal(printerRulePresetKey(selectedPreset, presets), 'both');
  assert.deepEqual(JSON.parse(JSON.stringify(selectedPreset.kitchenPrinterIds)), []);
  assert.equal(selectedPreset.customerPrinterId, null);
});

test('cashier credit checkout and receipt workflows are wired through the server services', () => {
  const cashierRoute = source('src/app/api/orders/route.ts');
  const orderService = source('src/lib/orders.ts');
  const businessRoute = source('src/app/api/business/route.ts');
  const orderStatusRoute = source('src/app/api/orders/[id]/route.ts');
  assert.match(cashierRoute, /input\.payNow === "credit"/);
  assert.match(cashierRoute, /settleOrder\(auth\.business, auth\.features, created\.id, input\.payNow!/);
  assert.match(cashierRoute, /return db\.transaction\(async \(rawTx\) => \{[\s\S]*createOrder\([\s\S]*settleOrder\([\s\S]*executor/);
  assert.match(orderService, /if \(input\.payNow === "credit"\)[\s\S]*ثبت فروش نسیه فقط از صندوق/);
  assert.match(orderService, /can\("loyalty"\) \|\| source === "cashier"/);
  assert.match(orderService, /receivableEvents/);
  assert.match(orderService, /postOrderSaleInTransaction\(tx, biz/);
  assert.match(orderService, /printOutputs\(settings, selectedMoment\)/);
  assert.match(businessRoute, /printerSettings: "cloud_printer"/);
  assert.match(businessRoute, /validatePrinterSelection/);
  assert.match(orderStatusRoute, /set\.status === "ready"[\s\S]*queuePrintJobs\(business, oid, auth\.features, false, undefined, tx, "completed"\)/);
});

test('order receipt and kitchen actions queue directly to their configured printer routes without opening preview', () => {
  const ordersUi = source('src/modules/orders.tsx');
  const cashierUi = source('src/components/cashier-order-desk.tsx');
  const printButton = source('src/components/manual-order-print-button.tsx');
  const printRoute = source('src/app/api/orders/[id]/print/route.ts');
  const orderService = source('src/lib/orders.ts');

  assert.match(ordersUi, /ManualOrderPrintButton orderId=\{selected\.id\} kind="customer" label="رسید"/);
  assert.match(ordersUi, /ManualOrderPrintButton orderId=\{item\.id\} kind="customer" label="چاپ مجدد"/);
  assert.match(cashierUi, /kind="customer" label="فیش"/);
  assert.match(cashierUi, /kind="kitchen" label="آشپزخانه"/);
  assert.match(cashierUi, /\['customer','فیش مشتری'\],\['kitchen','فیش آشپزخانه'\]/);
  assert.doesNotMatch(ordersUi, /print\/receipt/);
  assert.doesNotMatch(cashierUi, /print\/receipt|پیش‌نمایش و چاپ مرورگر/);
  assert.match(printButton, /`\/api\/orders\/\$\{orderId\}\/print`/);
  assert.match(printButton, /method: "POST", body: \{ kind \}/);
  assert.doesNotMatch(printButton, /window\.open|window\.print|location\.href/);
  assert.match(printRoute, /body\.kind as "customer" \| "kitchen" \| "cafe"/);
  assert.match(orderService, /settings\.rules\.settled\.customerPrinterId/);
  assert.match(orderService, /settings\.rules\.created_with_table\.kitchenPrinterIds/);
  assert.match(orderService, /manualKind === "kitchen" \? \[\] : firstPrinter/);
});
