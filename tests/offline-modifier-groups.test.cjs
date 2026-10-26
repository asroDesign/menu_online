const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync(new URL('../src/lib/product-options.ts', `file://${__filename}`), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', compiled)(loaded.exports, require, loaded);
const { normalizeProductOptionGroups } = loaded.exports;

test('offline product option contract accepts valid bounds and negative price deltas', () => {
  const groups = normalizeProductOptionGroups([{
    id: 'size', name: 'اندازه', required: true, min: 1, max: 1, active: true,
    options: [
      { id: 'small', name: 'کوچک', priceDelta: 0, active: true },
      { id: 'large', name: 'بزرگ', priceDelta: 25_000, active: true },
      { id: 'less-sugar', name: 'شکر کمتر', priceDelta: -1_000, active: true },
    ],
  }]);

  assert.equal(groups[0].min, 1);
  assert.equal(groups[0].options[2].priceDelta, -1_000);
});

test('offline product option contract rejects duplicate IDs and impossible selection bounds', () => {
  assert.throws(() => normalizeProductOptionGroups([
    { id: 'first', name: 'اول', required: false, min: 0, max: 1, active: true, options: [{ id: 'same', name: 'یک', priceDelta: 0, active: true }] },
    { id: 'second', name: 'دوم', required: false, min: 0, max: 1, active: true, options: [{ id: 'same', name: 'دو', priceDelta: 0, active: true }] },
  ]));

  assert.throws(() => normalizeProductOptionGroups([{
    id: 'required', name: 'اجباری', required: true, min: 2, max: 2, active: true,
    options: [{ id: 'only', name: 'تنها گزینه', priceDelta: 0, active: true }],
  }]));
});
