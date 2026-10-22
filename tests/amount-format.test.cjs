const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/amount-format.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const box = { exports: {} };
vm.runInNewContext(js, { module: box, exports: box.exports, String, Number });

test('amount entry groups Persian numerals while preserving a plain integer value', () => {
  assert.equal(box.exports.formatAmountInput('1234567'), '۱٬۲۳۴٬۵۶۷');
  assert.equal(box.exports.normalizeAmountInput('۱٬۲۳۴٬۵۶۷'), '1234567');
});

test('amount entry accepts English, Persian, and Arabic digits and ignores separators', () => {
  assert.equal(box.exports.normalizeAmountInput('1,234٬٥٦٧'), '1234567');
  assert.equal(box.exports.formatAmountInput('12 345'), '۱۲٬۳۴۵');
  assert.equal(box.exports.formatAmountInput(''), '');
});

test('signed option price adjustments keep a leading minus sign and grouped digits', () => {
  assert.equal(box.exports.normalizeAmountInput('-1234567', true), '-1234567');
  assert.equal(box.exports.formatAmountInput('-1234567', true), '-۱٬۲۳۴٬۵۶۷');
  assert.equal(box.exports.normalizeAmountInput('-1234567'), '1234567');
});
