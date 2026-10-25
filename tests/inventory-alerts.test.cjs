const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/inventory-alerts.ts'), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const inventoryModule = { exports: {} };
new Function('exports', compiled)(inventoryModule.exports);
const { buildInventoryAlerts, inventoryExpiryCutoff, tehranDateKey } = inventoryModule.exports;

test('creates stock, expired and seven-day expiry warnings but ignores non-tracked and empty expiry stock', () => {
  const now = new Date('2026-10-25T08:00:00.000Z');
  const alerts = buildInventoryAlerts([
    { id: 1, name: 'آرد', stock: 0, minStock: 2, unit: 'کیلوگرم', trackStock: true, expiryDate: null },
    { id: 2, name: 'پنیر', stock: 1, minStock: 3, unit: 'کیلوگرم', trackStock: true, expiryDate: '2026-10-31' },
    { id: 3, name: 'شیر', stock: 4, minStock: 1, unit: 'لیتر', trackStock: true, expiryDate: '2026-10-24' },
    { id: 4, name: 'قهوه', stock: 0, minStock: 0, unit: 'عدد', trackStock: false, expiryDate: '2026-10-25' },
    { id: 5, name: 'شکر', stock: 1, minStock: 3, unit: 'کیلوگرم', trackStock: false, expiryDate: null },
    { id: 6, name: 'روغن', stock: 2, minStock: 1, unit: 'لیتر', trackStock: true, expiryDate: '2026-11-02' },
  ], now);

  assert.deepEqual(alerts.map((alert) => [alert.kind, alert.itemId]), [
    ['expired', 3],
    ['stock_out', 1],
    ['stock_low', 2],
    ['expiring', 2],
  ]);
  assert.equal(alerts.find((alert) => alert.kind === 'expiring').daysUntilExpiry, 6);
});

test('uses Tehran calendar date and includes expiry exactly seven days ahead', () => {
  const now = new Date('2026-10-24T21:00:00.000Z'); // 00:30 in Tehran on 25 October
  assert.equal(tehranDateKey(now), '2026-10-25');
  assert.equal(inventoryExpiryCutoff(now, 7), '2026-11-01');
  const alerts = buildInventoryAlerts([
    { id: 1, name: 'مواد', stock: 1, minStock: 0, unit: 'عدد', trackStock: true, expiryDate: '2026-11-01' },
  ], now);
  assert.equal(alerts[0].kind, 'expiring');
  assert.equal(alerts[0].daysUntilExpiry, 7);
});
