const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadCore() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/customer-analytics-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Intl, Date, Number, String, RegExp, Array, Error });
  return box.exports;
}

test('customer analytics uses full Tehran calendar months and bounded period choices', () => {
  const { customerAnalyticsWindow } = loadCore();
  const window = customerAnalyticsWindow(new Date('2026-10-23T09:00:00Z'), 6);
  assert.deepEqual(Array.from(window.monthKeys), ['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
  assert.equal(window.startAt.toISOString(), '2026-04-30T20:30:00.000Z');
  assert.equal(window.endAt.toISOString(), '2026-10-31T20:30:00.000Z');
  assert.throws(() => customerAnalyticsWindow(new Date(), 5), /بازهٔ تحلیل/);
});

test('customer referral codes normalize safely and attribution cannot be self-assigned, overwritten, or attached after purchases', () => {
  const { normalizeReferralCode, canAttachReferral } = loadCore();
  assert.equal(normalizeReferralCode(' ab-c123 '), 'AB-C123');
  assert.equal(normalizeReferralCode(''), '');
  assert.equal(normalizeReferralCode('bad/code'), null);
  assert.equal(canAttachReferral({ customerId: 9, referrerId: 4, currentReferrerId: null, hasPaidOrders: false }), true);
  assert.equal(canAttachReferral({ customerId: 4, referrerId: 4, currentReferrerId: null, hasPaidOrders: false }), false);
  assert.equal(canAttachReferral({ customerId: 9, referrerId: 4, currentReferrerId: 7, hasPaidOrders: false }), false);
  assert.equal(canAttachReferral({ customerId: 9, referrerId: 4, currentReferrerId: null, hasPaidOrders: true }), false);
});

test('customer analytics is tenant-scoped, manager-only, and counts only completed paid orders', () => {
  const route = source('src/app/api/r/customer-analytics/route.ts');
  assert.match(route, /feature: "loyalty", manager: true/);
  assert.match(route, /o\.business_id = \$\{businessId\}/);
  assert.match(route, /c\.business_id = o\.business_id/);
  assert.match(route, /o\.status = 'paid' AND o\.payment_status = 'paid' AND o\.deleted_at IS NULL/);
  assert.match(route, /row_number\(\) OVER \(PARTITION BY o\.customer_id ORDER BY o\.created_at, o\.id\)/);
  assert.match(route, /referred_by_customer_id IS NOT NULL/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.doesNotMatch(route, /customerPhone|email|select \* from customers/i);
});

test('referrals are applied only after OTP, within the same business, and once before the first paid order', () => {
  const verify = source('src/app/api/public/[slug]/customer/otp/verify/route.ts');
  const profile = source('src/lib/public-customer-data.ts');
  const auth = source('src/lib/auth.ts');
  const migration = source('src/db/migrations/0043_customer_referrals.sql');
  const rollback = source('src/db/migrations/0043_customer_referrals.down.sql');
  assert.match(verify, /await verifyOtp\(challengeId, code\)/);
  assert.match(verify, /eq\(customers\.businessId, business\.id\), eq\(customers\.referralCode, referralCode\)/);
  assert.match(verify, /eq\(orders\.businessId, business\.id\)/);
  assert.match(verify, /eq\(orders\.status, "paid"\), eq\(orders\.paymentStatus, "paid"\)/);
  assert.match(verify, /canAttachReferral\(/);
  assert.match(verify, /isNull\(customers\.referredByCustomerId\)/);
  assert.match(profile, /referralCode: customers\.referralCode/);
  assert.match(auth, /api\.customer_referrals_migration_required/);
  assert.match(migration, /UNIQUE INDEX customers_business_referral_code_idx/);
  assert.match(migration, /orders_customer_paid_analytics_idx/);
  assert.match(rollback, /Refusing to remove customer referral attribution/);
});

test('the customer page shares invite links and SMS selection for referred users honors marketing consent', () => {
  const navigation = source('src/components/public-menu-navigation.tsx');
  const page = source('src/modules/growth-a.tsx');
  const sms = source('src/lib/sms.ts');
  assert.match(navigation, /\?ref=\$\{encodeURIComponent\(profile\.referralCode\)\}/);
  assert.match(navigation, /challengeId, code, name, referralCode \}/);
  assert.match(page, /<CustomerAnalytics \/>/);
  assert.match(page, /seg === "referred"/);
  assert.match(sms, /key === "referred"/);
  assert.match(sms, /eq\(customers\.smsOptIn, true\)/);
  assert.match(sms, /eq\(customers\.businessId, biz\.id\)/);
});
