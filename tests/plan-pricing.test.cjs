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
const { pricePlan, BILLING_TERMS, isBillingTerm } = load('src/lib/plan-pricing.ts');
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
test('one, three, six and twelve month billing terms are priced independently', () => {
  const p = pricePlan(PLANS[0], { monthlyPrice: 100_001, monthlyDiscount: 10, threeMonthPrice: 300_000, threeMonthDiscount: 5, sixMonthPrice: 600_000, sixMonthDiscount: 10, oldPrice: 1_200_000, annualDiscount: 20 });
  assert.equal(p.terms[1].total, 90_001);
  assert.equal(p.terms[3].total, 285_000);
  assert.equal(p.terms[6].total, 540_000);
  assert.equal(p.terms[12].total, 960_000);
});
test('billing-term validation accepts only the four purchasable durations', () => {
  assert.deepEqual(Array.from(BILLING_TERMS), [1, 3, 6, 12]);
  for (const term of [1, 3, 6, 12]) assert.equal(isBillingTerm(term), true);
  for (const term of [0, 2, 4, 5, 24, "12", null, undefined]) assert.equal(isBillingTerm(term), false);
});
test('legacy plan settings derive monthly and quarterly amounts without changing the annual total', () => {
  const p = pricePlan(PLANS[0]);
  assert.equal(p.terms[1].total, Math.round(p.price / 12));
  assert.equal(p.terms[3].total, Math.round(p.price / 4));
  assert.equal(p.terms[12].total, PLANS[0].price);
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
test('the live pricing selector and both server invoice flows accept the same billing terms', () => {
  const publicSelector = fs.readFileSync(path.join(root, 'src/components/marketing/pricing.tsx'), 'utf8');
  const checkout = fs.readFileSync(path.join(root, 'src/components/subscription-checkout.tsx'), 'utf8');
  const quote = fs.readFileSync(path.join(root, 'src/lib/subscription-checkout.ts'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'src/lib/admin-api.ts'), 'utf8');
  const homepage = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');
  assert.match(publicSelector, /BILLING_TERMS\.map/);
  assert.match(checkout, /BILLING_TERMS\.map/);
  assert.match(quote, /isBillingTerm\(months\)/);
  assert.match(admin, /isBillingTerm\(months\)/);
  assert.match(homepage, /دوره یک، سه، شش یا دوازده‌ماهه را انتخاب کنید/);
  assert.doesNotMatch(homepage, /دوره شش‌ماهه یا سالانه را انتخاب کنید/);
});
