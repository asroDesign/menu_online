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
  const js = ts.transpileModule(source('src/lib/loyalty-rewards-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports });
  return box.exports;
}

test('loyalty reward expiry and percentage discount use bounded integer Toman values', () => {
  const { rewardExpiresAt, rewardIsExpired, rewardDiscountAmount } = loadCore();
  const now = new Date('2026-10-23T10:00:00.000Z');
  assert.equal(rewardExpiresAt(now, 7).toISOString(), '2026-10-30T10:00:00.000Z');
  assert.equal(rewardExpiresAt(now, 999).toISOString(), '2027-10-23T10:00:00.000Z');
  assert.equal(rewardDiscountAmount(33_333, 15), 5_000);
  assert.equal(rewardDiscountAmount(10_000, 100), 10_000);
  assert.equal(rewardDiscountAmount(-10, 20), 0);
  assert.equal(rewardDiscountAmount(10_000, 0), 0);
  assert.equal(rewardIsExpired('2026-10-23T10:00:00.000Z', now), true);
  assert.equal(rewardIsExpired('not-a-date', now), true);
});

test('printed QR campaigns are tenant-scoped, manager-only, bounded, and use unguessable claim tokens', () => {
  const manager = source('src/app/api/loyalty-reward-campaigns/route.ts');
  const toggle = source('src/app/api/loyalty-reward-campaigns/[id]/route.ts');
  const migration = source('src/db/migrations/0045_customer_reward_barcodes.sql');
  const rollback = source('src/db/migrations/0045_customer_reward_barcodes.down.sql');
  assert.match(manager, /feature: "loyalty", manager: true/);
  assert.match(manager, /eq\(customerRewardCampaigns\.businessId, auth\.business\.id\)/);
  assert.match(manager, /randomBytes\(24\)\.toString\("base64url"\)/);
  assert.match(manager, /expiresAfterDays < 1 \|\| expiresAfterDays > 365/);
  assert.match(manager, /discountPercent < 1 \|\| discountPercent > 100/);
  assert.match(manager, /products\.businessId, auth\.business\.id/);
  assert.match(toggle, /customerRewardCampaigns\.businessId, auth\.business\.id/);
  assert.match(migration, /customer_reward_claims_one_active_customer_uq/);
  assert.match(migration, /customer_reward_claims_campaign_customer_uq/);
  assert.match(rollback, /Cannot roll back customer reward barcodes while campaigns or customer claims exist/);
});

test('QR claim needs this tenant OTP session, can activate once, expires per campaign, and observes claim caps', () => {
  const claim = source('src/app/api/public/[slug]/customer/rewards/claim/route.ts');
  assert.match(claim, /publicCustomerId\(slug, business\.id\)/);
  assert.match(claim, /customer-reward-claim-customer/);
  assert.match(claim, /customerRewardCampaigns\.businessId, business\.id/);
  assert.match(claim, /for\("update"\)/);
  assert.match(claim, /customerRewardClaims\.campaignId, campaign\.id/);
  assert.match(claim, /customerRewardClaims\.customerId, customer\.id/);
  assert.match(claim, /campaign\.maxClaims > 0/);
  assert.match(claim, /rewardExpiresAt\(new Date\(\), campaign\.expiresAfterDays\)/);
  assert.match(claim, /previous\.status === "active" && previous\.expiresAt\.getTime\(\) > Date\.now\(\)/);
});

test('the signed-in customer sees scanned reward animation and applies server-validated rewards to the next order only', () => {
  const menuPage = source('src/app/m/[slug]/page.tsx');
  const menu = source('src/components/menu-client.tsx');
  const profile = source('src/lib/public-customer-data.ts');
  const orders = source('src/lib/orders.ts');
  assert.match(menuPage, /initialRewardToken=\{rewardToken\}/);
  assert.match(menu, /customer\/rewards\/claim/);
  assert.match(menu, /شما برنده شدید/);
  assert.match(menu, /فقط برای همین سفارش بعدی/);
  assert.match(menu, /rewardClaimId: selectedReward\?\.id/);
  assert.match(profile, /customerRewardClaims\.status, "active"/);
  assert.match(orders, /source !== "customer" \|\| !opts\.verifiedCustomerId/);
  assert.match(orders, /rewardDiscountAmount\(orderSubtotal, selectedRewardClaim\.discountPercent\)/);
  assert.match(orders, /status: "redeemed", consumedOrderId: created\.id/);
  assert.match(orders, /expiredRewardClaimId/);
  assert.match(orders, /lineTotal: freeProduct\.price, note: "جایزه وفاداری"/);
  assert.match(orders, /برای استفاده از جایزه، کد تخفیف یا مزیت عضویت را از این سفارش بردارید/);
});

test('manager interface prints a dedicated QR card and customer profile displays the active reward and expiry', () => {
  const manager = source('src/modules/growth-a.tsx');
  const profile = source('src/components/public-menu-navigation.tsx');
  assert.match(manager, /api<\{ items: RewardProduct\[\] \}>\("\/api\/products"\)/);
  assert.doesNotMatch(manager, /"\/api\/r\/products"/);
  assert.match(manager, /QRCodeSVG value=\{url\}/);
  assert.match(manager, /popup\.document\.write/);
  assert.match(manager, /جایزه‌های بارکدی/);
  assert.match(manager, /چاپ QR/);
  assert.match(profile, /جایزهٔ فعال شما/);
  assert.match(profile, /فقط برای سفارش بعدی/);
});
