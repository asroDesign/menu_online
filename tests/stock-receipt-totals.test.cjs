const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const exportsObject = {};
new Function('exports', ts.transpile(fs.readFileSync(require('node:path').join(__dirname, '../src/lib/stock-receipt-totals.ts'), 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }))(exportsObject);
const { stockReceiptTotal, allocateStockValue } = exportsObject;
test('shipping and tax enter total and proportional stock valuation exactly once', () => {
  const total = stockReceiptTotal(3000, 100, 20, 200, 270);
  assert.equal(total, 3390);
  assert.deepEqual(allocateStockValue([1000, 2000], total), [1130, 2260]);
  assert.equal(total - 1000, 2390); // supplier debt after partial payment
});
test('old invoices retain their combined extra cost semantics', () => {
  assert.equal(stockReceiptTotal(1000, 50, 100), 1050);
});
test('rounding never loses charges across multiple invoice lines', () => {
  for (let total = 1; total < 500; total++) {
    const allocated = allocateStockValue([1, 7, 11], total);
    assert.equal(allocated.reduce((sum, value) => sum + value, 0), total);
    assert.ok(allocated.every((value) => Number.isInteger(value) && value >= 0));
  }
});
test('invalid amounts, excessive discounts and overflow are rejected', () => {
  for (const value of [-1, NaN, Infinity, 0.5, 1e12 + 1]) {
    assert.throws(() => stockReceiptTotal(1000, 0, 0, value));
    assert.throws(() => stockReceiptTotal(1000, 0, 0, 0, value));
  }
  assert.throws(() => stockReceiptTotal(1000, 1001));
  assert.throws(() => stockReceiptTotal(1e12, 0, 0, 1));
  assert.throws(() => allocateStockValue([0], 1));
});
