const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

test('each POS stores a tenant-owned settlement account and opt-in cashier/kiosk channels', () => {
  const schema = source('src/db/schema.ts');
  const up = source('src/db/migrations/0047_pos_routing_settings.sql');
  const down = source('src/db/migrations/0047_pos_routing_settings.down.sql');
  const registry = source('src/lib/registry-a.ts');
  assert.match(schema, /settlementBankAccountId: integer\("settlement_bank_account_id"\).*bankAccounts\.id/);
  assert.match(schema, /cashierEnabled: boolean\("cashier_enabled"\)\.notNull\(\)\.default\(false\)/);
  assert.match(schema, /kioskEnabled: boolean\("kiosk_enabled"\)\.notNull\(\)\.default\(false\)/);
  assert.match(up, /REFERENCES bank_accounts\(id\) ON DELETE SET NULL/);
  assert.match(down, /IF EXISTS[\s\S]*settlement_bank_account_id IS NOT NULL OR cashier_enabled OR kiosk_enabled/);
  assert.match(registry, /if \(\(cashierEnabled \|\| kioskEnabled\) && !bankId\)/);
  assert.match(registry, /owns\(bankAccounts, bankId, biz\.id/);
});

test('settlement gets POS bank from its configured device and restricts it by channel', () => {
  const pos = source('src/lib/pos.ts');
  const cashier = source('src/app/api/orders/[id]/cashier/route.ts');
  const options = source('src/app/api/orders/settlement-options/route.ts');
  const ui = source('src/modules/orders.tsx');
  assert.match(pos, /eq\(enabled, true\)/);
  assert.match(pos, /settlementPlan\.posBankAccountId !== device\.settlementBankAccountId/);
  assert.match(pos, /settlementPlan = normalizeSettlementInput\([\s\S]*posBankAccountId: device\.settlementBankAccountId/);
  assert.match(cashier, /submitted\.posBankAccountId = device\.settlementBankAccountId/);
  assert.match(cashier, /createPosRequest\(auth\.business, orderId, plan\.posDeviceId, plan, "cashier"\)/);
  assert.match(options, /requireFeature\(auth, \["cashier_pos", "tablet_pos"\]\)/);
  assert.doesNotMatch(options, /code: devices\.code/);
  assert.match(ui, /cashierPosDevices\.find\(\(device\) => device\.online\)/);
  assert.doesNotMatch(ui, /حساب بانکی تسویهٔ این پوز/);
});

test('kiosk payment, status and retry only use POS devices enabled for kiosk', () => {
  const order = source('src/app/api/public/[slug]/orders/route.ts');
  const status = source('src/app/api/public/[slug]/pos/route.ts');
  const retry = source('src/app/api/public/[slug]/pos/[id]/route.ts');
  const settings = source('src/modules/kiosk.tsx');
  assert.match(order, /posDeviceForChannel\(biz\.id, "kiosk", st\.kiosk\.posDeviceId\)/);
  assert.match(order, /createPosRequest\(biz, order\.id, kioskPosDeviceId, undefined, "kiosk"\)/);
  assert.match(status, /posDeviceForChannel\(biz\.id, "kiosk", st\?\.posDeviceId\)/);
  assert.match(retry, /posDeviceForChannel\(biz\.id, "kiosk", kst\?\.posDeviceId\)/);
  assert.match(settings, /d\.kioskEnabled && d\.settlementBankAccountId/);
  assert.doesNotMatch(settings, /\(\{ id: number; name: string; code: string; kind: string/);
});
