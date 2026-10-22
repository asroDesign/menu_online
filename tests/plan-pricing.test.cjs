// Run with: node --test tests/plan-pricing.test.cjs (no database required).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: name => name === '@/lib/plans' ? load('src/lib/plans.ts') : require(name) });
  return mod.exports;
}
const { pricePlan } = load('src/lib/plan-pricing.ts');
const { PLANS } = load('src/lib/plans.ts');
test('existing annual sale prices are preserved exactly for all plans', () => {
  for (const p of PLANS) assert.equal(pricePlan(p).terms[12].total, p.price);
  assert.equal(pricePlan(PLANS[0], { price: 1234567, oldPrice: 1800000 }).terms[12].total, 1234567);
});
test('independent six-month and annual discounts apply to the full period', () => {
  const p = pricePlan(PLANS[0], { oldPrice: 1000000, annualDiscount: 20, sixMonthPrice: 600000, sixMonthDiscount: 10 });
  assert.equal(p.terms[12].total, 800000);
  assert.equal(p.terms[6].total, 540000);
});
test('lowering the annual base below the previous sale price is respected', () => {
  assert.equal(pricePlan(PLANS[0], { price: 2990000, oldPrice: 1000000, annualDiscount: 0 }).price, 1000000);
});
test('zero and 100 percent discounts work; integer Toman rounding is deterministic', () => {
  assert.equal(pricePlan(PLANS[0], { oldPrice: 101, annualDiscount: 50 }).price, 51);
  assert.equal(pricePlan(PLANS[0], { oldPrice: 100, annualDiscount: 100 }).price, 0);
  assert.equal(pricePlan(PLANS[0], { oldPrice: 0, annualDiscount: 0 }).price, 0);
  assert.equal(pricePlan(PLANS[0], { sixMonthPrice: 100, sixMonthDiscount: 100 }).terms[6].total, 0);
});
test('saving a migrated legacy price does not alter its total', () => {
  for (const p of PLANS) { const read = pricePlan(p); assert.equal(pricePlan(p, read).price, p.price); }
});
