const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadWheelCore() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/loyalty-wheel-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports });
  return box.exports;
}

test('weighted prize selection respects exact weighted boundaries and rejects invalid random rolls', () => {
  const { weightedWheelPrizeIndex } = loadWheelCore();
  const prizes = [{ weight: 2 }, { weight: 3 }, { weight: 5 }];
  assert.equal(weightedWheelPrizeIndex(prizes, 0), 0);
  assert.equal(weightedWheelPrizeIndex(prizes, 1), 0);
  assert.equal(weightedWheelPrizeIndex(prizes, 2), 1);
  assert.equal(weightedWheelPrizeIndex(prizes, 4), 1);
  assert.equal(weightedWheelPrizeIndex(prizes, 5), 2);
  assert.equal(weightedWheelPrizeIndex(prizes, 9), 2);
  assert.throws(() => weightedWheelPrizeIndex([], 0), /جایزهٔ فعالی/);
  assert.throws(() => weightedWheelPrizeIndex(prizes, 10), { name: 'RangeError' });
});

test('wheel schema persists tenant-scoped settings, prize snapshots, spin idempotency, and rollback guard', () => {
  const schema = source('src/db/schema.ts');
  const migration = source('src/db/migrations/0048_loyalty_wheel.sql');
  const rollback = source('src/db/migrations/0048_loyalty_wheel.down.sql');
  for (const table of ['loyalty_wheel_settings', 'loyalty_wheel_prizes', 'loyalty_wheel_spins']) {
    assert.match(schema, new RegExp(`pgTable\\(\\"${table}\\"`));
    assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
    assert.match(rollback, new RegExp(`DROP TABLE ${table}`));
  }
  assert.match(migration, /loyalty_wheel_spins_request_uq/);
  assert.match(migration, /loyalty_wheel_spins_one_active_customer_uq/);
  assert.match(migration, /loyalty_wheel_prize_shape_ck/);
  assert.match(migration, /cooldown_hours BETWEEN 1 AND 720/);
  assert.match(rollback, /Cannot roll back the loyalty wheel while its settings, prizes, or spin history exist/);
});

test('public spins require same-tenant OTP identity, server randomness, per-customer serialization, cooldown, and replay key', () => {
  const route = source('src/app/api/public/[slug]/loyalty-wheel/route.ts');
  assert.match(route, /publicCustomerId\(slug, business\.id\)/);
  assert.match(route, /public-wheel-spin-customer/);
  assert.match(route, /randomInt\(totalWeight\)/);
  assert.match(route, /customers\.businessId, business\.id/);
  assert.match(route, /\.for\("update"\)/);
  assert.match(route, /loyaltyWheelSpins\.requestKey, requestKey/);
  assert.match(route, /settings\.cooldownHours/);
  assert.match(route, /status, "active"/);
  assert.match(route, /getPublicMenu\(slug\)/);
  assert.match(route, /Cache-Control/);
  assert.doesNotMatch(route, /body\.phone|body\.customerId/);
});

test('orders accept a wheel reward only for the verified same-tenant customer and consume it in the order transaction', () => {
  const orders = source('src/lib/orders.ts');
  assert.match(orders, /wheelSpinId\?: number \| null/);
  assert.match(orders, /wheelSpinId: num\(body\.wheelSpinId\)/);
  assert.match(orders, /source !== "customer" \|\| !opts\.verifiedCustomerId/);
  assert.match(orders, /eq\(loyaltyWheelSpins\.businessId, biz\.id\)/);
  assert.match(orders, /eq\(loyaltyWheelSpins\.customerId, customerId\)/);
  assert.match(orders, /eq\(loyaltyWheelSpins\.status, "active"\)/);
  assert.match(orders, /discountCodeId\)/);
  assert.match(orders, /note: "جایزهٔ گردونه"/);
  assert.match(orders, /status: "redeemed", consumedOrderId: created\.id/);
  assert.match(orders, /expiredWheelSpinId/);
  assert.match(orders, /const couponToConsume = discountId \?\? wheelDiscountId/);
  assert.match(orders, /if \(input\.wheelSpinId && input\.appendTo\)/);
});

test('restaurant controls are manager-only and public navigation/checkout only expose configured, usable wheel rewards', () => {
  const admin = source('src/app/api/loyalty-wheel/route.ts');
  const prizeValidation = source('src/lib/loyalty-wheel-admin.ts');
  const core = source('src/lib/loyalty-wheel-core.ts');
  const prizeApi = source('src/app/api/loyalty-wheel/prizes/route.ts');
  const registry = source('src/app/dashboard/[module]/page.tsx');
  const shell = source('src/components/dashboard-shell.tsx');
  const publicMenu = source('src/lib/public-menu.ts');
  const navigation = source('src/components/public-menu-navigation.tsx');
  const menu = source('src/components/menu-client.tsx');
  assert.match(admin, /feature: "loyalty", manager: true/);
  assert.match(prizeValidation, /fixed_amount/);
  assert.match(prizeValidation, /discount_code/);
  assert.match(prizeValidation, /free_items/);
  assert.match(core, /"no_prize"/);
  assert.match(prizeValidation, /message/);
  assert.match(prizeApi, /حداکثر ۱۶ جایزه/);
  assert.match(registry, /"loyalty-wheel": \{ feature: "loyalty", C: LoyaltyWheel \}/);
  assert.match(shell, /href: "\/dashboard\/loyalty-wheel"/);
  assert.match(publicMenu, /loyaltyWheelEnabled: can\("loyalty"\) && wheelSettings\?\.isEnabled === true/);
  assert.match(navigation, /wheelEnabled/);
  assert.match(navigation, /profileOpen.*شماره موبایل|شماره موبایل.*profileOpen/s);
  assert.match(navigation, /گردونه را بچرخان/);
  assert.match(navigation, /تبریک! برنده شدی/);
  assert.match(menu, /wheelSpinId: selectedWheelReward\?\.id/);
  assert.match(menu, /wheelEnabled=\{biz\.loyaltyWheelEnabled/);
});
