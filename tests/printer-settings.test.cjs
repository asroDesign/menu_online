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
