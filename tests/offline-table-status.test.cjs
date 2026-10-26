const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const source = fs.readFileSync(new URL(`../${file}`, `file://${__filename}`), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  new Function('exports', 'require', 'module', compiled)(loaded.exports, name => dependencies[name] || require(name), loaded);
  return loaded.exports;
}

const lifecycle = load('src/lib/table-lifecycle-core.ts');
const { parseOfflineTableStatusCommand } = load('src/lib/offline-table-status-core.ts', {
  '@/lib/table-lifecycle-core': lifecycle,
});

const base = {
  schemaVersion: 1,
  id: 'd2e559d6-688e-43d0-ae0c-46d2f6aeb0f1',
  businessId: 17,
  module: 'tables',
  action: 'set_status',
  baseDataset: 'menu',
  baseSnapshotId: '5d319f5c-90fd-4d6d-9a31-e9c7b02024b1',
  baseRevision: 4,
  payload: { tableId: 23, expectedStatus: 'available', status: 'cleaning', reason: '' },
};

test('offline table command accepts a supported operational transition', () => {
  assert.deepEqual(parseOfflineTableStatusCommand(base), base);
});

test('offline table command rejects stale-shaped, unsupported, and unsafe requests', () => {
  assert.throws(() => parseOfflineTableStatusCommand({ ...base, payload: { ...base.payload, status: 'occupied' } }), /وضعیت/);
  assert.throws(() => parseOfflineTableStatusCommand({ ...base, payload: { ...base.payload, expectedStatus: 'out_of_service', status: 'cleaning' } }), /انتقال/);
  assert.throws(() => parseOfflineTableStatusCommand({ ...base, payload: { ...base.payload, status: 'out_of_service' } }), /علت/);
  assert.throws(() => parseOfflineTableStatusCommand({ ...base, payload: { ...base.payload, injected: true } }));
});
