const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/menu-recommendations.ts'), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const recommendationsModule = { exports: {} };
new Function('exports', compiled)(recommendationsModule.exports);
const { classifyMenuProduct, foodDrinkPairingReason } = recommendationsModule.exports;

test('classifies Persian menu products using category first or product name', () => {
  assert.equal(classifyMenuProduct({ id: 1, name: 'لاته', categoryName: 'نوشیدنی گرم' }), 'drink');
  assert.equal(classifyMenuProduct({ id: 2, name: 'چیزبرگر دوبل', categoryName: 'غذای اصلی' }), 'food');
  assert.equal(classifyMenuProduct({ id: 3, name: 'آیس تی', categoryName: null }), 'drink');
  assert.equal(classifyMenuProduct({ id: 4, name: 'محصول ویژه', categoryName: 'سایر' }), null);
});

test('suggests a missing beverage for food and a missing food for a drink', () => {
  const burger = { id: 1, name: 'چیزبرگر', categoryName: 'غذای اصلی' };
  const coffee = { id: 2, name: 'قهوه', categoryName: 'نوشیدنی گرم' };
  const salad = { id: 3, name: 'سالاد فصل', categoryName: 'غذای سبک' };
  assert.equal(foodDrinkPairingReason([burger], coffee), 'drink_pairing');
  assert.equal(foodDrinkPairingReason([coffee], salad), 'food_pairing');
  assert.equal(foodDrinkPairingReason([burger, coffee], salad), null);
  assert.equal(foodDrinkPairingReason([burger], salad), null);
});
