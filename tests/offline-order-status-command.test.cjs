const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync(new URL('../src/lib/offline-order-status-core.ts', `file://${__filename}`), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', compiled)(loaded.exports, require, loaded);
const { nextOfflineOrderStatus, parseOfflineOrderStatusCommand } = loaded.exports;

const base = {
  schemaVersion: 1,
  id: 'f9546383-b6ec-43d7-9483-85a1df53fdec',
  businessId: 17,
  module: 'orders',
  action: 'change_status',
  baseDataset: 'orders',
  baseSnapshotId: '5d319f5c-90fd-4d6d-9a31-e9c7b02024b1',
  baseRevision: 2,
  payload: {
    orderId: 531,
    expectedStatus: 'pending',
    expectedUpdatedAt: '2026-10-26T10:20:30.123456Z',
    status: 'preparing',
  },
};

test('offline order status accepts only one forward kitchen transition', () => {
  assert.equal(nextOfflineOrderStatus('pending'), 'preparing');
  assert.equal(nextOfflineOrderStatus('preparing'), 'ready');
  assert.equal(nextOfflineOrderStatus('ready'), 'served');
  assert.equal(nextOfflineOrderStatus('paid'), null);
  assert.equal(nextOfflineOrderStatus('canceled'), null);
  assert.deepEqual(parseOfflineOrderStatusCommand(base), base);
});

test('offline order status rejects skipped, financial, stale-shaped and extra-field commands', () => {
  assert.throws(() => parseOfflineOrderStatusCommand({ ...base, payload: { ...base.payload, status: 'served' } }), /یک مرحلهٔ مجاز/);
  assert.throws(() => parseOfflineOrderStatusCommand({ ...base, payload: { ...base.payload, status: 'paid' } }), /یک مرحلهٔ مجاز/);
  assert.throws(() => parseOfflineOrderStatusCommand({ ...base, payload: { ...base.payload, expectedUpdatedAt: '2026-10-26T10:20:30.123Z' } }), /زمان نسخه/);
  assert.throws(() => parseOfflineOrderStatusCommand({ ...base, payload: { ...base.payload, paymentStatus: 'paid' } }));
});

test('cashier confirmation uses a separate pending-only command', () => {
  const confirmation = {
    ...base,
    action: 'confirm_cashier',
    payload: { orderId: 531, expectedStatus: 'pending', expectedUpdatedAt: base.payload.expectedUpdatedAt },
  };
  assert.deepEqual(parseOfflineOrderStatusCommand(confirmation), confirmation);
  assert.throws(() => parseOfflineOrderStatusCommand({ ...confirmation, payload: { ...confirmation.payload, expectedStatus: 'preparing' } }));
  assert.throws(() => parseOfflineOrderStatusCommand({ ...confirmation, payload: { ...confirmation.payload, status: 'preparing' } }));
});
