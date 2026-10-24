const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const box = { exports: {} };
const js = ts.transpileModule(source('src/lib/public-menu-notifications.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(js, { module: box, exports: box.exports, Date, Map, Array });
const { publicMenuNotificationChanges } = box.exports;

test('menu notification changes stay silent for the initial baseline and unchanged profile', () => {
  const snapshot = {
    walletBalance: 2500,
    recentOrders: [{ number: 12, status: 'preparing', paymentStatus: 'paid', deliveryStatus: '', createdAt: '2026-10-24T10:00:00.000Z' }],
    recentReservations: [{ id: 3, status: 'requested', depositStatus: 'pending', startsAt: '2026-10-26T10:00:00.000Z' }],
  };
  assert.equal(publicMenuNotificationChanges(snapshot, structuredClone(snapshot)).length, 0);
});

test('menu notification changes report wallet, order payment/status, and reservation changes', () => {
  const previous = {
    walletBalance: 2500,
    recentOrders: [{ number: 12, status: 'preparing', paymentStatus: 'unpaid', deliveryStatus: '', createdAt: '2026-10-24T10:00:00.000Z' }],
    recentReservations: [{ id: 3, status: 'requested', depositStatus: 'pending', startsAt: '2026-10-26T10:00:00.000Z' }],
  };
  const current = {
    walletBalance: 5000,
    recentOrders: [{ number: 12, status: 'ready', paymentStatus: 'paid', deliveryStatus: '', createdAt: '2026-10-24T10:00:00.000Z' }],
    recentReservations: [{ id: 3, status: 'confirmed', depositStatus: 'paid', startsAt: '2026-10-26T10:00:00.000Z' }],
  };
  const changes = publicMenuNotificationChanges(previous, current);
  assert.deepEqual(Array.from(changes, change => change.kind), ['wallet', 'order', 'reservation']);
  assert.equal(changes[0].current, 5000);
  assert.equal(changes[1].status, 'ready');
  assert.equal(changes[1].paymentStatus, 'paid');
  assert.equal(changes[2].status, 'confirmed');
});

test('public profile reservations are scoped to the verified customer phone and current business', () => {
  const profile = source('src/lib/public-customer-data.ts');
  const navigation = source('src/components/public-menu-navigation.tsx');
  assert.match(profile, /eq\(reservations\.businessId, businessId\)/);
  assert.match(profile, /eq\(reservations\.customerPhone, customer\.phone\)/);
  assert.match(navigation, /window\.Notification\.requestPermission\(\)/);
  assert.match(navigation, /window\.setInterval\(\(\) => void checkChanges\(\), 45_000\)/);
  assert.match(navigation, /وقتی وضعیت سفارش، رزرو یا کیف پول تغییر کند خبرتان می‌کنیم/);
});
