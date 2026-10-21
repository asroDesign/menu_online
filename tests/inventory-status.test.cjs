const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/inventory-status.ts'), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const moduleObject = { exports: {} };
new Function('exports', compiled)(moduleObject.exports);
const { inventoryStatus } = moduleObject.exports;

test('zero and negative stock are marked out even when no reorder threshold is configured', () => {
  assert.equal(inventoryStatus(0, 0), 'out');
  assert.equal(inventoryStatus(-0.5, 0), 'out');
  assert.equal(inventoryStatus(-2, 10), 'out');
});

test('positive stock at or below the threshold needs reorder; stock above it is available', () => {
  assert.equal(inventoryStatus(1, 5), 'low');
  assert.equal(inventoryStatus(5, 5), 'low');
  assert.equal(inventoryStatus(5.01, 5), 'available');
  assert.equal(inventoryStatus(0.1, 0), 'available');
});
