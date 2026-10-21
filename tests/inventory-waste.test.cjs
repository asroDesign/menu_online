const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadWasteRules() {
  const moduleBox = { exports: {} };
  const js = ts.transpileModule(source('src/lib/stock-waste.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: moduleBox, exports: moduleBox.exports, Array, String });
  return moduleBox.exports;
}

test('waste reasons accept only the operationally defined categories and keep readable legacy fallback', () => {
  const { WASTE_REASONS, isWasteReason, wasteReasonLabel } = loadWasteRules();
  assert.deepEqual(JSON.parse(JSON.stringify(WASTE_REASONS.map((reason) => reason.key))), ["spoilage", "expired", "prep_loss", "quality", "damaged", "other"]);
  for (const { key } of WASTE_REASONS) assert.equal(isWasteReason(key), true);
  for (const invalid of ["", "missing", "sale", null, 1]) assert.equal(isWasteReason(invalid), false);
  assert.equal(wasteReasonLabel("expired"), "انقضا یا پایان مهلت مصرف");
  assert.equal(wasteReasonLabel(""), "سایر / ثبت قدیمی");
});

test('waste API is tenant scoped, bounded, paginated, rate limited and writes through atomic stock receipt service', () => {
  const route = source('src/app/api/r/waste/route.ts');
  assert.match(route, /withAuth/);
  assert.match(route, /eq\(stockMovements\.businessId, auth\.business\.id\)/);
  assert.match(route, /eq\(stockMovements\.type, "waste"\)/);
  assert.match(route, /rangeMs > 367 \* DAY_MS/);
  assert.match(route, /rawPageSize > 100/);
  assert.match(route, /exporting \? 5000/);
  assert.match(route, /quantityByUnit/);
  assert.match(route, /groupBy\(inventoryItems\.unit\)/);
  assert.match(route, /enforceRateLimit\(req, "inventory-waste-create"/);
  assert.match(route, /if \(!isWasteReason\(body\.wasteReason\)\)/);
  assert.match(route, /saveStockReceipt\(auth\.business, \{ \.\.\.body, type: "waste" \}/);
  assert.match(route, /csvCell/);
  const receiptService = source('src/lib/stock-receipts.ts');
  assert.match(receiptService, /C\.WASTE/);
  assert.match(receiptService, /type === "waste"/);
  assert.match(receiptService, /tx\.insert\(stockMovements\)/);
});

test('dedicated waste page requires stock movement entitlement and submits a reasoned waste receipt', () => {
  const page = source('src/app/dashboard/inventory/waste/page.tsx');
  const ui = source('src/modules/inventory-waste.tsx');
  const editor = source('src/components/stock-receipt-editor.tsx');
  assert.match(page, /can\(auth, "stock_movements"\)/);
  assert.match(page, /isManagerRole\(auth\.role\)/);
  assert.match(ui, /PersianDateInput/);
  assert.match(ui, /خروجی CSV/);
  assert.match(ui, /window\.print\(\)/);
  assert.match(ui, /مقدارها به تفکیک واحد کالا نمایش داده می‌شوند/);
  assert.match(ui, /receipt\.date/);
  assert.match(ui, /تاریخ شروع باید پیش از تاریخ پایان باشد/);
  assert.match(ui, /روند روزانه هزینه/);
  assert.match(ui, /مواد با بیشترین هزینهٔ ضایعات/);
  assert.match(ui, /دسته‌بندی دلیل‌ها/);
  assert.match(ui, /StockReceiptEditor fixedType="waste"/);
  assert.match(editor, /fixedType === "waste" \? "\/api\/r\/waste"/);
  assert.match(source('src/modules/inventory-waste.module.css'), /@page \{ size: A4 landscape/);
});

test('waste reason migration has a safe legacy default and a reversible rollback', () => {
  const up = source('src/db/migrations/0038_inventory_waste_reason.sql');
  const down = source('src/db/migrations/0038_inventory_waste_reason.down.sql');
  assert.match(up, /waste_reason text NOT NULL DEFAULT ''/);
  assert.match(up, /CHECK \(waste_reason IN/);
  assert.match(down, /DROP COLUMN waste_reason/);
});
