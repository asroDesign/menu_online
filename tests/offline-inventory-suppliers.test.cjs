const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('offline supplier create and update are wired through route, Tauri, local queue and DB allowlists', () => {
  const route = source('src/app/api/offline-dashboard/inventory/route.ts');
  const api = source('src/lib/offline-inventory.ts');
  const local = source('windows-bridge/offline-core/src/lib.rs');
  const tauri = source('windows-bridge/src-tauri/src/offline.rs');
  const main = source('windows-bridge/src-tauri/src/main.rs');
  const migration = source('src/db/migrations/0080_offline_inventory_suppliers.sql');
  for (const action of ['supplier_create', 'supplier_update']) {
    assert.ok(route.includes(action), `API route must dispatch ${action}`);
    assert.ok(api.includes(action), `server must validate ${action}`);
    assert.ok(local.includes(action), `SQLite outbox must allow ${action}`);
    assert.ok(migration.includes(action), `PostgreSQL ledger must allow ${action}`);
  }
  assert.match(tauri, /offline_workspace_create_supplier/);
  assert.match(tauri, /offline_workspace_update_supplier/);
  assert.match(main, /offline_workspace_create_supplier/);
  assert.match(main, /offline_workspace_update_supplier/);
});

test('supplier create keeps its payable account, supplier row and idempotency ledger in one server transaction', () => {
  const api = source('src/lib/offline-inventory.ts');
  const helper = source('src/lib/accounting.ts');
  const start = api.indexOf('export async function syncOfflineInventorySupplier');
  assert.notEqual(start, -1);
  const command = api.slice(start);
  assert.match(command, /db\.transaction\(/);
  assert.match(command, /pg_advisory_xact_lock\(\$\{business\.id\}\)/);
  assert.match(command, /isolationLevel: "read committed"/);
  assert.match(command, /Object\.entries\(fields\).*value\.trim\(\)/s);
  assert.match(command, /insertSupplierAccountInTransaction\(tx, business/);
  assert.match(command, /tx\.insert\(suppliers\)/);
  assert.match(command, /tx\.insert\(offlineWorkspaceCommands\)/);
  assert.match(helper, /pg_advisory_xact_lock\(\$\{biz\.id \+ 778001\}\)/);
});

test('local supplier errors remain visible until applied and represented by a fresh snapshot', () => {
  const ui = source('windows-bridge/ui/pos.js');
  assert.match(ui, /applied:'در سرور ثبت شد'/);
  assert.match(ui, /change\.state==='applied'&&rows\.some/);
});

test('supplier rollback refuses to remove the action constraint while command history exists', () => {
  const rollback = source('src/db/migrations/0080_offline_inventory_suppliers.down.sql');
  assert.match(rollback, /supplier_create','supplier_update/);
  assert.match(rollback, /Cannot roll back offline supplier commands/);
});
