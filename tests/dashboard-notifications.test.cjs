const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const box = { exports: {} };
const js = ts.transpileModule(source('src/lib/dashboard-notifications.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(js, { module: box, exports: box.exports, Date, Set, Array });
const { dashboardNotificationCount, isVisibleOnlineOrder } = box.exports;

test('global feed includes only actionable online orders and recent orders entering preparation', () => {
  const now = Date.parse('2026-10-25T12:00:00.000Z');
  const visible = [
    { source: 'customer', status: 'awaiting_payment', createdAt: '2026-10-20T12:00:00.000Z' },
    { source: 'customer', status: 'pending', createdAt: '2026-10-20T12:00:00.000Z' },
    { source: 'customer', status: 'preparing', createdAt: '2026-10-25T11:00:00.000Z' },
  ];
  assert.ok(visible.every(order => isVisibleOnlineOrder(order, now)));
  assert.equal(isVisibleOnlineOrder({ source: 'customer', status: 'preparing', createdAt: '2026-10-24T11:59:59.999Z' }, now), false);
  assert.equal(isVisibleOnlineOrder({ source: 'cashier', status: 'pending', createdAt: '2026-10-25T11:00:00.000Z' }, now), false);
  assert.equal(isVisibleOnlineOrder({ source: 'customer', status: 'pending', deletedAt: '2026-10-25T11:00:00.000Z', createdAt: '2026-10-25T11:00:00.000Z' }, now), false);
  assert.equal(isVisibleOnlineOrder({ source: 'customer', status: 'served', createdAt: '2026-10-25T11:00:00.000Z' }, now), false);
});

test('notification badge totals all active categories without losing inventory alerts', () => {
  assert.equal(dashboardNotificationCount({ orders: [{}, {}], reservations: [{}], waiterCalls: [{}, {}, {}], inventory: [{}, {}] }), 8);
  assert.equal(dashboardNotificationCount({ orders: [], reservations: [], waiterCalls: [], inventory: [] }), 0);
});

test('dashboard feed is authenticated, tenant-scoped, feature-filtered, and omits reservation phone data', () => {
  const route = source('src/app/api/r/dashboard-notifications/route.ts');
  const component = source('src/components/dashboard-notification-center.tsx');
  const waiterNotifier = source('src/components/waiter-service-request-notifications.tsx');
  const ui = source('src/components/ui.tsx');
  const shell = source('src/components/dashboard-shell.tsx');
  assert.match(route, /withAuth\(async/);
  assert.match(route, /eq\(orders\.businessId, auth\.business\.id\)/);
  assert.match(route, /eq\(reservations\.businessId, auth\.business\.id\)/);
  assert.match(route, /eq\(waiterServiceRequests\.businessId, auth\.business\.id\)/);
  assert.match(route, /hasAny\(auth\.features, "cashier_pos"\)/);
  assert.match(route, /hasAny\(auth\.features, "reservations"\)/);
  assert.match(route, /hasAny\(auth\.features, "waiter_call"\)/);
  assert.doesNotMatch(route, /reservations\.customerPhone|reservations\.note/);
  assert.match(route, /Cache-Control/);
  assert.match(component, /درخواست‌های گارسون/);
  assert.match(component, /سفارش‌های آنلاین/);
  assert.match(component, /درخواست‌های رزرو/);
  assert.match(component, /setInterval\([\s\S]*15_000/);
  assert.match(component, /toast\(`میز/);
  assert.match(component, /toast\(`سفارش آنلاین/);
  assert.match(component, /toast\(`درخواست رزرو تازه/);
  assert.match(component, /playAlertSound\(\)/);
  assert.match(component, /menupeak:dashboard-notifications:/);
  assert.match(component, /localServiceNotifierActive/);
  assert.match(ui, /fixed bottom-\[max\(1rem,env\(safe-area-inset-bottom\)\)\] left-4/);
  assert.match(ui, /aura aura-sm pointer-events-auto w-full/);
  assert.match(ui, /\}, 5000\)/);
  assert.match(waiterNotifier, /fixed bottom-\[calc\(7rem_\+_env\(safe-area-inset-bottom\)\)\] left-4/);
  assert.match(waiterNotifier, /addEventListener\("pointerdown", unlockSound/);
  assert.match(shell, /DashboardNotificationCenter/);
});
