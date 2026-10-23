const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadRewards() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/customer-rewards-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports });
  return box.exports;
}

test('restaurant reward settings calculate fixed and purchase-scaled referral points safely', () => {
  const { normalizeCustomerRewards, referralRewardPoints, pointValueToman } = loadRewards();
  const fixed = normalizeCustomerRewards({ pointValueToman: 250, reviewPoints: 40, referralMode: 'fixed', referralFixedPoints: 100 });
  assert.equal(referralRewardPoints(1_000_000, fixed), 100);
  assert.equal(pointValueToman(20, fixed), 5_000);
  const scaled = normalizeCustomerRewards({ referralMode: 'purchase_based', referralStepToman: 500_000, referralPointsPerStep: 7 });
  assert.equal(referralRewardPoints(1_250_000, scaled), 14);
  assert.equal(referralRewardPoints(499_999, scaled), 0);
  assert.equal(referralRewardPoints(-1, scaled), 0);
  assert.equal(normalizeCustomerRewards({ pointValueToman: -5 }).pointValueToman, 0);
});

test('product video uploads are bounded, tenant-validated, and streamable by byte range', () => {
  const schema = source('src/db/schema.ts');
  const products = source('src/lib/resources.ts');
  const upload = source('src/app/api/upload/route.ts');
  const files = source('src/app/api/files/[id]/route.ts');
  const form = source('src/app/dashboard/products/create/page.tsx');
  assert.match(schema, /videoUrl: text\("video_url"\)\.notNull\(\)\.default\(""\)/);
  assert.match(products, /videoUrl: \{ type: "string", max: 500 \}/);
  assert.match(products, /eq\(uploads\.businessId, biz\.id\)/);
  assert.match(products, /'video\/mp4', 'video\/webm'/);
  assert.match(upload, /MAX_VIDEO = 20_000_000/);
  assert.match(upload, /video\/webm/);
  assert.match(files, /Content-Range/);
  assert.match(files, /status: 206/);
  assert.match(form, /<VideoUpload value=\{videoUrl\} onChange=\{setVideoUrl\}/);
});

test('customer reviews stay pending until a tenant manager approves them and awards ledgered points', () => {
  const publicRoute = source('src/app/api/public/[slug]/products/[id]/reviews/route.ts');
  const detail = source('src/components/public-product-details.tsx');
  const managerRoute = source('src/app/api/product-reviews/[id]/route.ts');
  const managerList = source('src/app/api/product-reviews/route.ts');
  const schema = source('src/db/schema.ts');
  assert.match(publicRoute, /publicCustomerId\(slug, business\.id\)/);
  assert.match(publicRoute, /eq\(productReviews\.status, "approved"\)/);
  assert.match(publicRoute, /status: "pending"/);
  assert.match(schema, /product_reviews_business_product_customer_uq/);
  assert.match(detail, /ویدیو، توضیحات، ترکیبات و دیدگاه مشتریان/);
  assert.match(detail, /نظر پس از تأیید مدیر نمایش داده می‌شود/);
  assert.match(managerRoute, /feature: "loyalty", manager: true/);
  assert.match(managerRoute, /review\.status !== "pending"/);
  assert.match(managerRoute, /addCustomerPoints/);
  assert.match(managerList, /eq\(productReviews\.businessId, auth\.business\.id\)/);
  assert.match(schema, /export const productReviews = pgTable/);
  assert.match(schema, /export const customerPointEntries = pgTable/);
});

test('points redeem only from an OTP profile, commits points and wallet together, and retries idempotently', () => {
  const redeem = source('src/app/api/public/[slug]/customer/points/redeem/route.ts');
  const points = source('src/lib/customer-points.ts');
  const nav = source('src/components/public-menu-navigation.tsx');
  const orders = source('src/lib/orders.ts');
  const publicOrders = source('src/app/api/public/[slug]/orders/route.ts');
  assert.match(redeem, /publicCustomerId\(slug, business\.id\)/);
  assert.match(redeem, /db\.transaction\(async \(tx\)/);
  assert.match(redeem, /points-redeem:\$\{business\.id\}:\$\{customerId\}:\$\{requestKey\}/);
  assert.match(redeem, /addCustomerPoints\(tx/);
  assert.match(redeem, /addWalletEntry\(business\.id, customerId, amountToman/);
  assert.match(points, /onConflictDoNothing\(\)\.returning/);
  assert.match(points, /customers\.points\} >= \$\{-input\.amount\}/);
  assert.match(nav, /تبدیل امتیاز به اعتبار/);
  assert.match(orders, /source !== "customer" \|\| !opts\.verifiedCustomerId/);
  assert.match(publicOrders, /if \(input\.useCashback && !verifiedCustomerId\)/);
});

test('referral rewards are granted once at paid settlement using the configured fixed or purchase formula', () => {
  const orders = source('src/lib/orders.ts');
  const migration = source('src/db/migrations/0044_product_media_reviews_points.sql');
  assert.match(orders, /const referralPoints = referralRewardPoints\(o\.total, normalizeCustomerRewards\(settings\.customerRewards\)\)/);
  assert.match(orders, /idempotencyKey: `order:\$\{o\.id\}:referral:/);
  assert.match(orders, /idempotencyKey: `order:\$\{o\.id\}:purchase-points`/);
  assert.match(migration, /'opening', points, 'opening:' \|\| id::text/);
});
