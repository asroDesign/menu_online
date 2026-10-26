const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync(new URL('../src/lib/offline-customer-core.ts', `file://${__filename}`), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', compiled)(loaded.exports, require, loaded);
const { parseOfflineCustomerCommand } = loaded.exports;

const base = {
  schemaVersion: 1,
  id: '9a752768-22df-4cd5-ae77-6c7965e78842',
  businessId: 7,
  module: 'customers',
  baseDataset: 'customers',
  baseSnapshotId: '43db874b-22a4-4a68-b0bb-0ab93650e3e7',
  baseRevision: 3,
};

test('offline customer creation canonicalizes Iranian digits and stores only identity fields', () => {
  const command = parseOfflineCustomerCommand({
    ...base,
    action: 'create',
    payload: { customer: { name: '  نسترن  ', phone: '+۹۸ ۹۱۲ ۳۴۵ ۶۷۸۹' } },
  });

  assert.deepEqual(command.payload, { customer: { name: 'نسترن', phone: '09123456789' } });
  assert.equal(command.module, 'customers');
});

test('offline customer changes cannot change phone, points, wallet or SMS consent', () => {
  assert.throws(() => parseOfflineCustomerCommand({
    ...base,
    action: 'update',
    payload: { customerId: 41, patch: { name: 'نام تازه', phone: '09123456789' } },
  }), /فقط نام مشتری/);

  assert.throws(() => parseOfflineCustomerCommand({
    ...base,
    action: 'create',
    payload: { customer: { name: 'مشتری', phone: '09123456789', smsOptIn: true } },
  }), /فقط نام و شماره/);
});

test('offline customer command rejects invalid mobile, incomplete revision and unexpected payload', () => {
  assert.throws(() => parseOfflineCustomerCommand({
    ...base,
    action: 'create',
    payload: { customer: { name: 'مشتری', phone: '123' } },
  }), /شمارهٔ موبایل/);

  assert.throws(() => parseOfflineCustomerCommand({ ...base, baseRevision: 0, action: 'create', payload: { customer: { name: 'مشتری', phone: '09123456789' } } }));
  assert.throws(() => parseOfflineCustomerCommand({ ...base, action: 'create', payload: { customer: { name: 'مشتری', phone: '09123456789' }, walletBalance: 1 } }));
});
