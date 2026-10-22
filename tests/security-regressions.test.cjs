// Fast source-contract and pure-helper checks. PostgreSQL concurrency coverage is in
// security-postgres.integration.test.cjs and requires an explicitly named test URL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadSiteUrl() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/site-url.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, process: { env: {} }, URL });
  return box.exports;
}

function loadProductOptions() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/product-options.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Math, Set, Number, String, Array, Error });
  return box.exports;
}

function loadCsv() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/csv.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, String });
  return box.exports;
}

function loadMenuImport() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/menu-import.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, String, Set, Number, Math, Error, Array, Object });
  return box.exports;
}

function loadTehranTime() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/tehran-time.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Date, String });
  return box.exports;
}

function loadStaffCalendar() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/staff-calendar.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, require, Date, Intl, String, Number, Math, Array });
  return box.exports;
}

function loadChequeRules() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/cheques.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports });
  return box.exports;
}

function loadTrialWindow() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/trial-window.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Date });
  return box.exports;
}

function loadTrialPolicy() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/trial-policy.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Number });
  return box.exports;
}

function loadRegistrationFlow() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/registration-flow.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, require, Buffer, Number, JSON, Date });
  return box.exports;
}

function loadWeightedSales() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/weighted-sales.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Math, Number, Error });
  return box.exports;
}

function loadReceivableRules() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/receivables-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Math, Number, Date, RangeError });
  return box.exports;
}

function loadPriceTargetRules() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/price-target-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Number, Math, RangeError });
  return box.exports;
}

function loadRetentionRules() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/sms-retention-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Number, Date, String, RegExp });
  return box.exports;
}

function loadSmsProvider(fetchImpl) {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/sms-provider.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, fetch: fetchImpl, URLSearchParams, AbortSignal, encodeURIComponent, String, Number, Error });
  return box.exports;
}

function loadSalesReportRange() {
  const jalaliBox = { exports: {} };
  const jalaliJs = ts.transpileModule(source('src/lib/jalali.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(jalaliJs, { module: jalaliBox, exports: jalaliBox.exports, require, Intl, Date, String, Number, Math });
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/sales-report-range.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, require: id => id === '@/lib/jalali' ? jalaliBox.exports : require(id), URLSearchParams, Date, RangeError, Math, Array });
  return box.exports;
}

function loadTableRules() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/table-lifecycle-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Array });
  return box.exports;
}

function loadOrderCart() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/order-cart.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const weightedSales = loadWeightedSales();
  const productOptions = loadProductOptions();
  vm.runInNewContext(js, {
    module: box,
    exports: box.exports,
    require: id => id === '@/lib/weighted-sales' ? weightedSales : productOptions,
    Math,
    Number,
    Object,
    String,
  });
  return box.exports;
}

test('SEO URLs share the configured origin and MenuPeak fallback', () => {
  const { getSiteUrl } = loadSiteUrl();
  assert.equal(getSiteUrl(''), 'https://menupeak.ir');
  assert.equal(getSiteUrl('https://example.test/path/'), 'https://example.test');
  assert.equal(getSiteUrl('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(getSiteUrl('not a URL'), 'https://menupeak.ir');
});

test('receivables reject invalid and over-balance payments and derive partial/overdue/settled state', () => {
  const { validMoneyAmount, paymentFitsBalance, outstandingAmount, receivableState } = loadReceivableRules();
  assert.equal(validMoneyAmount(1), true);
  assert.equal(validMoneyAmount(0), false);
  assert.equal(validMoneyAmount(1.25), false);
  assert.equal(paymentFitsBalance(100, 30, 70), true);
  assert.equal(paymentFitsBalance(100, 30, 71), false);
  assert.equal(paymentFitsBalance(70, 40, 30), true);
  assert.equal(paymentFitsBalance(70, 40, 31), false);
  assert.equal(outstandingAmount(100, 130), 0);
  assert.equal(receivableState(100, 30, null), 'partial');
  assert.equal(receivableState(100, 0, new Date('2020-01-01T00:00:00Z'), new Date('2021-01-01T00:00:00Z')), 'overdue');
  assert.equal(receivableState(100, 100, null), 'settled');
});

test('Drizzle binds receivable ID lists as scalar IN parameters', () => {
  const { PgDialect, pgTable, integer } = require('drizzle-orm/pg-core');
  const { inArray } = require('drizzle-orm');
  const payments = pgTable('receivable_payments', { receivableId: integer('receivable_id') });
  const query = new PgDialect().sqlToQuery(inArray(payments.receivableId, [3, 8]));
  assert.match(query.sql, / in \(\$1, \$2\)$/);
  assert.deepEqual(query.params, [3, 8]);
});

test('receivable APIs scope tenants and receipt effects share a locked idempotent transaction', () => {
  const service = source('src/lib/receivables.ts');
  const routes = source('src/app/api/receivables/[id]/payments/route.ts');
  const orderRoute = source('src/app/api/receivables/orders/[id]/route.ts');
  const reversal = source('src/app/api/receivables/[id]/payments/[paymentId]/reverse/route.ts');
  assert.match(service, /eq\(receivables\.businessId, businessId\)/);
  assert.match(service, /eq\(receivableAccounts\.businessId, receivables\.businessId\)/);
  assert.match(service, /inArray\(receivablePayments\.receivableId, ids\)/);
  assert.match(service, /inArray\(receivablePaymentReversals\.paymentId, payments\.map\(\(p\) => p\.id\)\)/);
  assert.doesNotMatch(service, /any\(\$\{(?:ids|payments\.map)/);
  assert.match(service, /\.for\("update"\)/);
  assert.match(service, /eq\(receivablePayments\.idempotencyKey, input\.idempotencyKey\)/);
  assert.match(service, /paymentFitsBalance\(Number\(locked\.amount\), alreadyReceived, input\.amount\)/);
  assert.match(service, /postDocumentInTransaction\(tx, biz/);
  assert.match(service, /source: "receivable"/);
  assert.match(service, /reverseReceivablePayment/);
  assert.match(service, /paymentFitsBalance\(Number\(payment\.amount\), Number\(prior\.total\), input\.amount\)/);
  assert.match(service, /source: "receivable_reversal"/);
  assert.match(reversal, /feature: "accounting", manager: true, roles: \["accountant"\]/);
  assert.match(routes, /feature: "accounting", manager: true, roles: \["accountant"\]/);
  assert.match(orderRoute, /creditSale: true/);
  assert.match(source('src/lib/orders.ts'), /if \(method === "credit" && !opts\.creditSale\)/);
});

test('table lifecycle keeps occupied/reserved derived and validates operational transitions', () => {
  const { canTransitionTable, effectiveTableState, isOperationalTableState } = loadTableRules();
  assert.equal(isOperationalTableState('cleaning'), true);
  assert.equal(isOperationalTableState('occupied'), false);
  assert.equal(canTransitionTable('available', 'cleaning'), true);
  assert.equal(canTransitionTable('out_of_service', 'cleaning'), false);
  assert.equal(effectiveTableState('available', true, true), 'occupied');
  assert.equal(effectiveTableState('available', false, true), 'reserved');
  assert.equal(effectiveTableState('cleaning', false, false), 'cleaning');
  const service = source('src/lib/table-lifecycle.ts');
  const orders = source('src/lib/orders.ts');
  const reservations = source('src/lib/reservations.ts');
  assert.match(service, /\.for\("update"\)/);
  assert.match(service, /tableStatusEvents/);
  assert.match(service, /رزرو فعال/);
  assert.match(orders, /operationalStatus === "out_of_service"/);
  assert.match(orders, /\.for\("update"\)\.limit\(1\)/);
  assert.match(reservations, /table\.operationalStatus === "available"/);
});

test('public customer lookup reveals no membership or wallet facts', () => {
  const route = source('src/app/api/public/[slug]/customer/route.ts');
  assert.doesNotMatch(route, /customers|walletBalance|normPhone/);
  assert.match(route, /exists: false, balance: 0, verificationRequired: true/);
});

test('order creation rejects every cashback spend until a verified customer flow exists', () => {
  const orders = source('src/lib/orders.ts');
  assert.match(orders, /if \(input\.useCashback\)\s*throw new HttpError\(403/);
  assert.doesNotMatch(orders, /greatest\(0/);
});

test('wallet changes are journaled idempotently and negative changes are conditional', () => {
  const orders = source('src/lib/orders.ts');
  const schema = source('src/db/schema.ts');
  const migration = source('src/db/migrations/0009_wallet_idempotency.sql');
  assert.match(orders, /db\.transaction\(\(tx\) => addWalletEntry/);
  assert.match(orders, /onConflictDoNothing\(\)\.returning/);
  assert.match(orders, /walletBalance\} >= \$\{\-amount\}/);
  assert.match(schema, /wallet_entries_biz_idempotency_idx/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS wallet_entries_biz_idempotency_idx/);
});

test('order creation and settlement use transaction-scoped locks and durable print jobs', () => {
  const orders = source('src/lib/orders.ts');
  assert.match(orders, /const saveOrder = async \(tx: QueryDb\) =>/);
  assert.match(orders, /const orderId = opts\.executor[\s\S]*await db\.transaction\(\(rawTx\) => saveOrder/);
  assert.match(orders, /const settle = async \(tx: QueryDb\) =>/);
  assert.match(orders, /if \(opts\.executor\) await settle\(opts\.executor\);[\s\S]*await db\.transaction\(\(rawTx\) => settle/);
  assert.match(orders, /pg_advisory_xact_lock\(\$\{biz\.id \+ 777000\}\)/);
  assert.match(orders, /await tx\.insert\(orderItems\)/);
  assert.match(orders, /await queuePrintJobs\(biz, created\.id, features, false, undefined, tx\)/);
  assert.match(orders, /\.where\(and\(eq\(orders\.id, orderId\), eq\(orders\.businessId, biz\.id\)\)\)\.for\("update"\)/);
  assert.match(orders, /postOrderSaleInTransaction\(tx, biz/);
});

test('callback verifies outside the transaction and persists payment with settlement', () => {
  const callback = source('src/app/api/public/pay/callback/route.ts');
  assert.ok(callback.indexOf('await verifyOnlinePayment') < callback.indexOf('await settleOrder'));
  assert.match(callback, /paymentId: p\.id, paymentRef: v\.ref/);
  assert.doesNotMatch(callback, /set\(\{ status: "paid", refId:/);
  assert.match(callback, /settlementError:/);
  assert.match(source('src/db/schema.ts'), /settlementAttempts: integer\("settlement_attempts"\)/);
});

test('login rate limits both account and address, bounds inputs, and uses a uniform failure', () => {
  const login = source('src/app/api/auth/login/route.ts');
  assert.match(login, /readJson\(req, 16 \* 1024\)/);
  assert.match(login, /auth-login-account/);
  assert.match(login, /auth-login-address/);
  assert.match(login, /ایمیل یا رمز عبور اشتباه است/);
  assert.doesNotMatch(login, /حساب کاربری غیرفعال شده|حساب‌های آزمایشی غیرفعال/);
});

test('lead phone validation rejects short or malformed values and bounds the request body', () => {
  const lead = source('src/app/api/public/lead/route.ts');
  assert.match(lead, /readJson\(req, 16 \* 1024\)/);
  assert.match(lead, /\^\\\+\?\\d\{10,15\}\$/);
  assert.match(lead, /phoneDigits\.length < 10/);
});

test('session cookies set Secure in production and remain non-Secure in development', () => {
  const auth = source('src/lib/auth.ts');
  assert.match(auth, /const secureCookie = process\.env\.NODE_ENV === "production"/);
  assert.match(auth, /sameSite: "lax", secure: secureCookie/);
});

test('interactive preview is local-only, uses fabricated data, and never submits orders', () => {
  const preview = source('src/components/marketing/demo-preview.tsx');
  const page = source('src/app/preview/page.tsx');
  assert.match(preview, /Local-only sample UI/);
  assert.match(preview, /disabled className="btn btn-disabled/);
  assert.match(preview, /هیچ سفارش، پرداخت، پیامک یا تغییر داده‌ای انجام نمی‌شود/);
  assert.doesNotMatch(preview, /\/api\/|\bfetch\s*\(|\bapi\s*\(/);
  assert.match(page, /<DemoPreview\s*\/>/);
});

test('shared demo identities cannot sign in and public demo writes are rejected', () => {
  const auth = source('src/app/api/auth/demo/route.ts');
  const login = source('src/app/api/auth/login/route.ts');
  const form = source('src/components/auth-form.tsx');
  assert.match(auth, /status: 404/);
  assert.match(login, /const demoBlocked = DEMO_LOGIN_EMAILS\.has\(email\)/);
  assert.doesNotMatch(form, /api\/auth\/demo|ورود آزمایشی|demoEnabled/);
  assert.match(source('src/app/api/public/[slug]/orders/route.ts'), /isReadOnlyDemoSlug\(slug\)/);
  assert.match(source('src/app/api/public/[slug]/reservations/route.ts'), /isReadOnlyDemoSlug\(slug\)/);
  assert.match(source('src/app/api/public/[slug]/pos/[id]/route.ts'), /isReadOnlyDemoSlug\(slug\)/);
});

test('product option selections are validated and unit prices come from server catalog data', () => {
  const { normalizeProductOptionGroups, resolveProductOptionSelection, productUnitPrice } = loadProductOptions();
  const groups = normalizeProductOptionGroups([{ id: 'size', name: 'اندازه', required: true, min: 1, max: 1, active: true, options: [
    { id: 'large', name: 'بزرگ', priceDelta: 25000, active: true },
    { id: 'old', name: 'قدیمی', priceDelta: 0, active: false },
  ] }]);
  const choice = resolveProductOptionSelection(groups, ['large']);
  assert.equal(productUnitPrice(80000, choice.priceDelta), 105000);
  assert.throws(() => resolveProductOptionSelection(groups, []), /تعداد انتخاب/);
  assert.throws(() => resolveProductOptionSelection(groups, ['old']), /غیرفعال/);
  assert.throws(() => resolveProductOptionSelection(groups, ['another-business-option']), /تعلق ندارد/);
  assert.throws(() => normalizeProductOptionGroups([{ id: 'x', name: 'اجباری', required: true, min: 0, max: 1, options: [{ id: 'x1', name: 'الف', priceDelta: 0 }] }]), /حداقل یا حداکثر/);
  assert.throws(() => productUnitPrice(100, -150), /قیمت نهایی/);

  const priceVariants = normalizeProductOptionGroups([{ id: 'product-price-variants', name: 'تنوع قیمت', required: true, min: 1, max: 1, active: true, options: [
    { id: 'small-size', name: 'کوچک', priceDelta: 0, active: true },
    { id: 'large-size', name: 'بزرگ', priceDelta: 25000, active: true },
  ] }]);
  assert.equal(productUnitPrice(80000, resolveProductOptionSelection(priceVariants, ['large-size']).priceDelta), 105000);
  assert.throws(() => resolveProductOptionSelection(priceVariants, []), /تعداد انتخاب/);
  assert.match(source('src/app/dashboard/products/create/page.tsx'), /id: priceVariantGroupId, name: "تنوع قیمت", required: true/);

  const orders = source('src/lib/orders.ts');
  assert.match(orders, /resolveProductOptionSelection\(p\.modifierGroups \?\? \[\], it\.optionIds/);
  assert.match(orders, /productUnitPrice\(p\.price, selection\.priceDelta\)/);
  assert.match(orders, /optionSnapshot: selection\.snapshot/);
  assert.doesNotMatch(orders, /price:\s*it\.price/);
});

test('all order entry points submit option IDs and public tracking returns no customer identifiers', () => {
  for (const file of ['src/components/menu-client.tsx', 'src/modules/waiter.tsx', 'src/components/kiosk-client.tsx'])
    assert.match(source(file), /optionIds: l\.optionIds/);
  const track = source('src/app/api/public/[slug]/track/route.ts');
  assert.match(track, /trackingTokenHash, tokenHash/);
  assert.match(track, /public-order-track-token/);
  assert.match(track, /Authorization/);
  assert.match(track, /orders\.number/);
  assert.match(track, /trackingExpiresAt/);
  assert.match(track, /trackingRevokedAt/);
  assert.doesNotMatch(track, /customerPhone|customerName|address:|orderItems|total: order\.total/);
  assert.match(track, /orderStatusEvents/);
  assert.match(source('src/app/api/public/[slug]/orders/route.ts'), /trackingUrl: order\.trackingToken \?/);
  const orderList = source('src/lib/orders.ts');
  assert.match(orderList, /const \{ trackingTokenHash, \.\.\.safeOrder \} = r\.order/);
  assert.match(orderList, /trackingActive: !!trackingTokenHash/);
  assert.match(source('src/modules/orders.tsx'), /selected\.trackingActive/);
});

test('funnel events are anonymous, allowlisted, tenant-checked, and order conversion is server-created', () => {
  const events = source('src/app/api/public/[slug]/events/route.ts');
  const analytics = source('src/lib/menu-analytics.ts');
  const report = source('src/app/api/reports/menu-funnel/route.ts');
  const orders = source('src/lib/orders.ts');
  assert.match(events, /const allowed = new Set\(\["menu_view", "category_view", "product_view", "add_to_cart", "checkout_start"\]\)/);
  assert.match(events, /eq\(categories\.businessId, business\.id\)/);
  assert.match(events, /eq\(products\.businessId, business\.id\)/);
  assert.match(events, /enforceRateLimit\(req, "menu-funnel"/);
  assert.match(events, /readJson\(req, 12 \* 1024\)/);
  assert.doesNotMatch(analytics, /phone|email|customerName|customerId|navigator\.userAgent/);
  assert.match(report, /withAuth/);
  assert.match(report, /auth\.business\.id/);
  assert.match(orders, /eventName: "order_created"/);
  assert.match(orders, /await tx\.insert\(menuEvents\)/);
});

test('customer CSV export is tenant-scoped, permission-gated, bounded, and formula-safe', () => {
  const route = source('src/app/api/customers/export/route.ts');
  assert.match(route, /withAuth/);
  assert.match(route, /feature: "loyalty", manager: true/);
  assert.match(route, /eq\(customers\.businessId, auth\.business\.id\)/);
  assert.match(route, /limit\(10_001\)/);
  assert.match(route, /if \(rows\.length > 10_000\)/);
  assert.match(route, /import \{ csvCell \} from "@\/lib\/csv"/);
  assert.match(route, /customers\.smsOptIn/);
  assert.match(route, /"Cache-Control": "no-store"/);
  const { csvCell } = loadCsv();
  for (const formula of ["=1+1", "+SUM(A1:A2)", "@SUM(A1)", "-1+2", "\t=1+1", "  =1+1"])
    assert.equal(csvCell(formula).startsWith("\"'"), true, `CSV formula should be neutralized: ${JSON.stringify(formula)}`);
  assert.equal(csvCell('name "quoted"'), '"name ""quoted"""');
});

test('cashier shifts are tenant-scoped, serialized on close, and attach settled sales atomically', () => {
  const schema = source('src/db/schema.ts');
  const migration = source('src/db/migrations/0013_cashier_shifts.sql');
  const close = source('src/app/api/cash-shifts/[id]/route.ts');
  const orders = source('src/lib/orders.ts');
  assert.match(schema, /cash_shifts_business_open_idx/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS cash_shifts_business_open_idx/);
  assert.match(close, /eq\(cashShifts\.businessId, auth\.business\.id\)/);
  assert.match(close, /\.for\("update"\)/);
  assert.match(close, /cashDifference: closingCash - expectedCash/);
  assert.match(orders, /const \[shift\] = await tx\.select\(\{ id: cashShifts\.id \}\)/);
  assert.match(orders, /shiftId: activeShiftId/);
  assert.match(orders, /await tx\.insert\(transactions\)/);
});

test('menu templates are whitelisted and the real-menu preview cannot order or reserve', () => {
  const business = source('src/app/api/business/route.ts');
  const page = source('src/app/m/[slug]/page.tsx');
  const menu = source('src/components/menu-client.tsx');
  assert.match(business, /case "menuTemplate"/);
  assert.match(business, /classic.*editorial.*compact/);
  assert.match(page, /readOnlyPreview=\{!!validTemplate && slug !== DEMO_SLUG\}/);
  assert.match(menu, /!readOnlyPreview && biz\.acceptOrders/);
  assert.match(menu, /caps\.reservations && !readOnlyDemo && !readOnlyPreview/);
  assert.match(menu, /آلرژن ثبت نشده/);
});

test('platform funnel stores no identifying fields and separates observed from server-confirmed events', () => {
  const schema = source('src/db/schema.ts');
  const table = schema.slice(schema.indexOf('export const platformEvents'), schema.indexOf('const bizId'));
  const endpoint = source('src/app/api/public/funnel/route.ts');
  const recorder = source('src/lib/platform-events.ts');
  const report = source('src/app/api/admin/marketing-funnel/route.ts');
  assert.doesNotMatch(table, /businessId|phone|email|ipAddress|userAgent|customerId/);
  assert.match(endpoint, /enforceRateLimit\(req, "platform-funnel"/);
  assert.match(endpoint, /enforceRateLimit\(req, "platform-funnel-global"/);
  assert.match(endpoint, /readJson\(req, 2 \* 1024\)/);
  assert.match(endpoint, /demo_request_complete.*signup_complete.*checkout_start/s);
  assert.match(recorder, /90 \* 24 \* 60 \* 60_000/);
  assert.match(source('src/components/marketing/platform-event-beacon.tsx'), /trackPlatformEvent\(name\)/);
  assert.match(source('src/components/auth-form.tsx'), /trackPlatformEvent\("signup_start"\)/);
  assert.match(source('src/app/api/auth/register/complete/route.ts'), /recordPlatformEvent\("signup_complete"\)/);
  assert.match(source('src/app/api/public/lead/route.ts'), /recordPlatformEvent\("demo_request_complete"\)/);
  assert.match(source('src/app/api/subscription/payment/route.ts'), /recordPlatformEvent\("checkout_start"\)/);
  assert.match(report, /withAuth/);
  assert.match(report, /admin: true, perm: "overview"/);
  assert.match(report, /checkoutStarts/);
  assert.doesNotMatch(report, /homeToSignupPercent|conversionPercent/);
});

test('cashier shift close records notes and method totals, with tenant-scoped manager history', () => {
  const summary = source('src/lib/cash-shifts.ts');
  const opening = source('src/app/api/cash-shifts/route.ts');
  const closing = source('src/app/api/cash-shifts/[id]/route.ts');
  const history = source('src/app/api/cash-shifts/history/route.ts');
  const report = source('src/modules/finance.tsx');
  assert.match(summary, /byMethod/);
  assert.match(summary, /row\.method === "cash"/);
  assert.match(summary, /transactions\.shiftId/);
  assert.match(opening, /const note = typeof body\.note === "string"/);
  assert.match(closing, /note: \[shift\.note, note\]/);
  assert.match(closing, /cashDifference: closingCash - expectedCash/);
  assert.match(history, /eq\(cashShifts\.businessId, auth\.business\.id\)/);
  assert.match(history, /isNotNull\(cashShifts\.closedAt\)/);
  assert.match(history, /manager: true/);
  assert.match(history, /cashShiftTotalsByShift/);
  assert.match(report, /تسویه‌ی شیفت‌های صندوق/);
  assert.match(report, /shift\.byMethod/);
});

test('menu CSV import normalizes Persian values, catches duplicate identifiers and bounds the parser', () => {
  const { parseProductCsv } = loadMenuImport();
  const rows = parseProductCsv('کد,دسته بندی,نام,قیمت تومان,موجود\r\nA-1,نوشیدنی,چای,۱۲۳٬۴۰۰,موجود\r\nA-1,نوشیدنی,قهوه,۲۰۰۰۰,خیر\r\nA-2,غذا,سوپ,500,yes', new Set(['A-2']));
  assert.equal(rows[0].priceToman, 123400);
  assert.equal(rows[0].available, true);
  assert.match(rows[1].errors.join(' '), /تکراری/);
  assert.equal(rows[2].duplicate, true);
  assert.equal(rows[2].available, true);
  assert.throws(() => parseProductCsv('نام,قیمت\nالف,"100', new Set()), /نقل‌قول بسته‌نشده/);
  assert.throws(() => parseProductCsv('نام,دسته\nالف,غذا', new Set()), /ستون‌های/);
  const route = source('src/app/api/menu-import/[id]/commit/route.ts');
  assert.match(route, /eq\(menuImportJobs\.businessId, auth\.business\.id\)/);
  assert.match(route, /catalogSnapshot/);
  assert.match(route, /job\.status === "committed"/);
  assert.match(route, /db\.transaction/);
});

test('staff schedule blocks overlapping shifts and self-service requests reveal only the linked member', () => {
  const schedule = source('src/app/api/staff-schedule/route.ts');
  const leave = source('src/app/api/staff-schedule/leave/route.ts');
  assert.match(schedule, /eq\(staff\.userId, auth\.user\.id\)/);
  assert.match(schedule, /eq\(staffSchedules\.businessId, auth\.business\.id\)/);
  assert.match(schedule, /lt\(staffSchedules\.startsAt, endsAt\), gt\(staffSchedules\.endsAt, startsAt\)/);
  assert.match(schedule, /eq\(staffLeaveRequests\.status, "approved"\)/);
  assert.match(leave, /eq\(staffLeaveRequests\.businessId, auth\.business\.id\)/);
  assert.match(leave, /overlap/);
});

test('staff schedule planning bounds monthly ranges, applies repeat-safe templates and records absence with audit', () => {
  const { parseTehranDateTime } = loadTehranTime();
  assert.equal(parseTehranDateTime('2026-10-22T09:00').toISOString(), '2026-10-22T05:30:00.000Z');
  assert.equal(parseTehranDateTime('2026-10-22T09:00:00Z').toISOString(), '2026-10-22T09:00:00.000Z');
  const schedule = source('src/app/api/staff-schedule/route.ts');
  const templates = source('src/app/api/staff-schedule/templates/route.ts');
  const shifts = source('src/app/api/staff-schedule/[id]/route.ts');
  const migration = source('src/db/migrations/0040_staff_schedule_planning.sql');
  assert.match(schedule, /end\.getTime\(\) - start\.getTime\(\) > 32 \* 86_400_000/);
  assert.match(schedule, /inArray\(staffSchedules\.status, \["scheduled", "absent"\]\)/);
  assert.match(templates, /eq\(staffShiftTemplates\.businessId, auth\.business\.id\)/);
  assert.match(templates, /\.for\("update"\)/);
  assert.match(templates, /eq\(staffSchedules\.templateId, template\.id\)/);
  assert.match(templates, /eq\(staffLeaveRequests\.status, "approved"\)/);
  assert.match(templates, /هیچ تغییری ثبت نشد/);
  assert.match(shifts, /status === "absent" && current\.startsAt\.getTime\(\) > Date\.now\(\)/);
  assert.match(shifts, /absenceRecordedBy: status === "absent" \? auth\.user\.id/);
  assert.match(migration, /staff_schedules_template_instance_idx/);
  assert.match(migration, /staff_shift_swaps_one_pending_per_schedule_idx/);
});

test('staff schedule calendar aligns Jalali months Saturday-first and handles leap Esfand and year navigation', () => {
  const { buildStaffCalendarMonth, jalaliMonthStart, nextJalaliMonthStart, shiftJalaliMonth, tehranDateKey } = loadStaffCalendar();
  const Farvardin = buildStaffCalendarMonth('2026-03-21');
  assert.equal(Farvardin.label, 'فروردین ۱۴۰۵');
  assert.equal(Farvardin.monthDays, 31);
  assert.equal(Farvardin.rows[0][0].dateKey, '2026-03-21');
  assert.ok(Farvardin.rows.every((week) => week.length === 7));
  const Esfand = buildStaffCalendarMonth(jalaliMonthStart('2025-03-01'));
  assert.equal(Esfand.label, 'اسفند ۱۴۰۳');
  assert.equal(Esfand.monthDays, 30);
  assert.equal(nextJalaliMonthStart('2025-02-19'), '2025-03-21');
  assert.equal(shiftJalaliMonth('2026-03-21', -1), '2026-02-20');
  assert.equal(tehranDateKey(new Date('2026-10-21T21:00:00.000Z')), '2026-10-22');
  const moduleCode = source('src/modules/staff-schedule.tsx');
  assert.match(moduleCode, /setScheduleView\("calendar"\)/);
  assert.match(moduleCode, /setScheduleView\("table"\)/);
  assert.match(moduleCode, /تقویم شیفت \$\{rangeLabel\}/);
  assert.match(moduleCode, /day\.number\.toLocaleString\("fa-IR"\)/);
  assert.match(moduleCode, /divide-y divide-base-200 md:hidden/);
});

test('staff shift swaps require tenant membership, target acceptance and manager approval with conflict checks', () => {
  const swaps = source('src/app/api/staff-schedule/swaps/route.ts');
  assert.match(swaps, /eq\(staffShiftSwapRequests\.businessId, auth\.business\.id\)/);
  assert.match(swaps, /shift\.staffId !== ownId/);
  assert.match(swaps, /request\.toStaffId !== ownId/);
  assert.match(swaps, /request\.status !== "pending_manager"/);
  assert.match(swaps, /eq\(staffSchedules\.staffId, request\.toStaffId\)/);
  assert.match(swaps, /eq\(staffLeaveRequests\.status, "approved"\)/);
  assert.match(swaps, /status: "approved"/);
  assert.match(swaps, /version: sql`\$\{staffSchedules\.version\} \+ 1`/);
});

test('staff attendance is self-service, tenant-scoped, duplicate-safe, and manager corrections are auditable', () => {
  const route = source('src/app/api/staff-schedule/attendance/route.ts');
  const schema = source('src/db/schema.ts');
  const migration = source('src/db/migrations/0041_staff_attendance.sql');
  const moduleCode = source('src/modules/staff-schedule.tsx');
  assert.match(route, /eq\(staff\.userId, auth\.user\.id\)/);
  assert.match(route, /eq\(staffSchedules\.businessId, auth\.business\.id\)/);
  assert.match(route, /eq\(staffSchedules\.staffId, member\.id\)/);
  assert.match(route, /\.for\("update"\)/);
  assert.match(route, /ورود این شیفت قبلاً ثبت شده است/);
  assert.match(route, /ابتدا ورود خود را ثبت کنید/);
  assert.match(route, /اصلاح سوابق حضور فقط برای مدیر مجاز است/);
  assert.match(route, /previousAt, occurredAt, reason, recordedBy/);
  assert.match(schema, /staffAttendanceEvents = pgTable\("staff_attendance_events"/);
  assert.match(migration, /UNIQUE REFERENCES staff_schedules\(id\)/);
  assert.match(migration, /staff_attendance_events_record_idx/);
  assert.match(moduleCode, /حضور و غیاب · ۳۰ روز اخیر/);
  assert.match(moduleCode, /ثبت ورود/);
  assert.match(moduleCode, /اصلاح حضور با ثبت دلیل در سوابق انجام شد/);
});

test('staff schedule schema errors explain the required migrations and option rows keep stable React keys', () => {
  const auth = source('src/lib/auth.ts');
  const moduleCode = source('src/modules/staff-schedule.tsx');
  assert.match(auth, /\["42P01", "42703"\]/);
  assert.match(auth, /api\.staff_schedule_migration_required/);
  assert.match(auth, /migrationهای 0040 و 0041/);
  const options = [...moduleCode.matchAll(/<option\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(options.length, 'the schedule UI has selectable options');
  for (const option of options) assert.match(option, /\bkey=/, option);
});

test('editing a future shift uses optimistic versioning and repeats tenant conflict checks', () => {
  const route = source('src/app/api/staff-schedule/[id]/route.ts');
  const moduleCode = source('src/modules/staff-schedule.tsx');
  assert.match(route, /expectedVersion !== current\.version/);
  assert.match(route, /eq\(staffSchedules\.version, expectedVersion\)/);
  assert.match(route, /ne\(staffSchedules\.id, current\.id\)/);
  assert.match(route, /eq\(staffLeaveRequests\.status, "approved"\)/);
  assert.match(moduleCode, /status: "scheduled", version: editingSchedule\.version/);
  assert.match(moduleCode, /ویرایش شیفت/);
});

test('stock transfer requests are tenant-scoped, lock rows, reject insufficient stock and apply paired movements atomically', () => {
  const route = source('src/app/api/stock-transfers/route.ts');
  const migration = source('src/db/migrations/0017_stock_transfers.sql');
  assert.match(route, /eq\(inventoryItems\.businessId, auth\.business\.id\)/);
  assert.match(route, /eq\(stockTransfers\.businessId, auth\.business\.id\)/);
  assert.match(route, /\.for\("update"\)/);
  assert.match(route, /sourceBalance < line\.quantity/);
  assert.match(route, /type: "out"/);
  assert.match(route, /type: "in"/);
  assert.match(route, /eq\(stockTransfers\.status, "pending"\)/);
  assert.match(migration, /UNIQUE \(business_id, request_key\)/);
});

test('every new verified registration receives the configured Premium Plus trial atomically', () => {
  const { isTrialWindowActive } = loadTrialWindow();
  const start = Date.parse('2026-10-01T00:00:00.000Z');
  const end = Date.parse('2026-10-15T00:00:00.000Z');
  assert.equal(isTrialWindowActive(start, end, start - 1), false);
  assert.equal(isTrialWindowActive(start, end, start), true);
  assert.equal(isTrialWindowActive(start, end, end - 1), true);
  assert.equal(isTrialWindowActive(start, end, end), false);
  const { signRegistrationFlow, verifyRegistrationFlow, REGISTRATION_FLOW_TTL_MS } = loadRegistrationFlow();
  const secret = 'x'.repeat(40);
  const challengeId = 'd49eea0a-4c64-4b54-9a2d-bce90d5b2f7b';
  const token = signRegistrationFlow({ challengeId }, secret, start);
  assert.deepEqual(JSON.parse(JSON.stringify(verifyRegistrationFlow(token, secret, start + 1000))), { challengeId, issuedAt: start });
  assert.equal(verifyRegistrationFlow(token, secret, start + REGISTRATION_FLOW_TTL_MS + 1), null);
  assert.equal(verifyRegistrationFlow(`${token}x`, secret, start), null);
  assert.equal(verifyRegistrationFlow(token, 'y'.repeat(40), start), null);

  const { trialDurationDays } = loadTrialPolicy();
  assert.equal(trialDurationDays(14), 14);
  assert.equal(trialDurationDays('21'), 21);
  assert.equal(trialDurationDays(undefined), 14);
  assert.equal(trialDurationDays(0), 14);
  assert.equal(trialDurationDays(61), 14);

  const complete = source('src/app/api/auth/register/complete/route.ts');
  const otpRequest = source('src/app/api/auth/otp/request/route.ts');
  const otpVerify = source('src/app/api/auth/otp/verify/route.ts');
  const entitlements = source('src/lib/entitlements.ts');
  const auth = source('src/lib/auth.ts');
  assert.match(otpRequest, /signRegistrationFlow/);
  assert.match(otpVerify, /registrationRequired: true/);
  assert.match(otpVerify, /pending\.consumedAt/);
  assert.doesNotMatch(otpVerify, /tx\.insert\(businesses\)|tx\.insert\(users\)/);
  assert.match(otpVerify, /ensurePendingBusinessTrial\(ownedBusiness\.id\)/);
  const trialGrants = source('src/lib/trial-grants.ts');
  assert.match(trialGrants, /\.for\("update"\)/);
  assert.match(trialGrants, /business\.plan !== "pending"/);
  assert.match(trialGrants, /business\.isSuspended/);
  assert.match(trialGrants, /if \(priorGrant\) return \{ granted: false/);
  assert.match(trialGrants, /subscriptionInvoices\.status, "paid"/);
  assert.match(trialGrants, /tx\.insert\(trialGrants\)/);
  assert.match(complete, /verifyRegistrationFlow/);
  assert.match(complete, /isNotNull\(otpChallenges\.consumedAt\)/);
  assert.doesNotMatch(complete, /flow\.demoTrial|policy\.enabled/);
  assert.match(complete, /trialDurationDays\(policy\.durationDays\)/);
  assert.match(complete, /trialGranted: true, trialPlan, trialDays: durationDays/);
  assert.match(complete, /const trialPlan = "premium_plus"/);
  assert.match(complete, /await db\.transaction/);
  assert.match(complete, /tx\.insert\(trialGrants\)/);
  assert.match(complete, /\["cafe", "restaurant", "fastfood", "bakery", "shop"\]\.includes\(businessType\)/);
  assert.match(complete, /type: businessType/);
  assert.match(complete, /address,/);
  assert.match(complete, /durationDays \* 86_400_000/);
  assert.match(complete, /enforceRateLimit\(req, "auth-register-complete"/);
  assert.match(source('src/components/auth-form.tsx'), /phase === "details"/);
  assert.match(source('src/components/auth-form.tsx'), /businessType: form\.businessType, address: form\.address/);
  assert.match(source('src/components/auth-form.tsx'), /label="نوع کسب‌وکار"/);
  assert.match(source('src/components/auth-form.tsx'), /\/api\/auth\/register\/complete/);
  assert.match(source('src/components/auth-form.tsx'), /router\.push\("\/dashboard"\)/);
  assert.match(source('src/components/auth-form.tsx'), /if \(result\.trialGranted\)/);
  assert.match(source('src/components/auth-form.tsx'), /menudigital:post-setup-next/);
  assert.match(source('src/components/restaurant-setup-tour.tsx'), /router\.push\(target\)/);
  assert.match(source('src/app/dashboard/layout.tsx'), /ensurePendingBusinessTrial\(auth\.business\.id\)/);
  assert.match(source('src/app/register/page.tsx'), /query\.trial === "demo"/);
  assert.match(source('src/app/page.tsx'), /href="\/register\?trial=demo"/);
  assert.match(source('src/app/api/auth/register/route.ts'), /HttpError\(410/);
  assert.match(source('src/lib/admin-api.ts'), /\{ enabled: true, durationDays: 14, plan: "premium_plus" \}/);
  assert.match(source('src/lib/admin-api.ts'), /enabled: true, durationDays, plan: "premium_plus"/);
  assert.match(source('src/components/admin/misc.tsx'), /ورود از لینک دموی رایگان الزامی نیست/);
  assert.match(entitlements, /isTrialWindowActive/);
  assert.match(auth, /!auth\.trialActive/);
  assert.match(source('src/app/dashboard/layout.tsx'), /!auth\.business\.setupTourCompletedAt/);
  assert.match(source('src/app/api/subscription/checkout/route.ts'), /allowUnpaid: true/);
  assert.match(source('src/lib/admin-api.ts'), /status: "converted", convertedAt: now/);
});

test('cheque statuses are direction-aware and every automatic accounting entry balances', () => {
  const { buildChequeRegistrationLines, buildChequeStatusLines, chequeStatusesFor, isChequeTransitionAllowed } = loadChequeRules();
  assert.deepEqual(Array.from(chequeStatusesFor('receivable')), ['registered', 'passed', 'bounced', 'returned', 'assigned', 'voided']);
  assert.deepEqual(Array.from(chequeStatusesFor('payable')), ['registered', 'passed', 'bounced', 'returned', 'voided']);
  assert.equal(isChequeTransitionAllowed('registered', 'passed', 'receivable'), true);
  assert.equal(isChequeTransitionAllowed('passed', 'registered', 'payable'), true);
  assert.equal(isChequeTransitionAllowed('registered', 'assigned', 'payable'), false);
  const balanced = lines => lines.reduce((sum, line) => sum + line.debit, 0) === lines.reduce((sum, line) => sum + line.credit, 0);
  for (const direction of ['receivable', 'payable']) {
    assert.equal(balanced(buildChequeRegistrationLines(direction, 51, direction === 'receivable' ? '1202' : '2105', 125_000)), true);
    for (const status of ['passed', 'bounced', 'returned', 'voided', ...(direction === 'receivable' ? ['assigned'] : [])]) {
      assert.equal(balanced(buildChequeStatusLines(direction, status, 51, direction === 'receivable' ? '1202' : '2105', '1102', 125_000)), true, `${direction}/${status}`);
    }
  }
  assert.equal(buildChequeStatusLines('receivable', 'registered', 51, '1202', '1102', 125_000).length, 0);
});

test('cheque creation and status changes post tenant-owned accounting entries atomically', () => {
  const route = source('src/app/api/cheques/route.ts');
  const accountRoute = source('src/app/api/cheques/accounts/route.ts');
  const migration = source('src/db/migrations/0027_cheque_accounting.sql');
  assert.match(route, /eq\(cheques\.businessId, auth\.business\.id\)/);
  assert.match(route, /\.for\("update"\)/);
  assert.match(route, /requestKey/);
  assert.match(route, /A\.postDocumentInTransaction\(tx, auth\.business/);
  assert.match(route, /sourceRef: `cheque:\$\{created\.id\}:initial`/);
  assert.match(route, /reverseChequeDocument\(tx, auth, lastCurrentEvent\.accountingDocumentId/);
  assert.match(route, /requestedStatusAccountId/);
  assert.match(route, /committedReplay/);
  assert.match(route, /tx\.update\(accDocuments\)\.set\(\{ reversed: true \}\)/);
  assert.match(route, /await tx\.insert\(chequeEvents\)/);
  assert.match(accountRoute, /auth\.business\.id/);
  assert.match(migration, /accounting_document_id integer REFERENCES acc_documents\(id\)/);
  assert.match(migration, /'registered', 'passed', 'bounced', 'returned', 'assigned', 'voided'/);
  assert.doesNotMatch(route, /fetch\(|sms\(/);
});

test('courier location is opt-in, tenant-bound, fresh-only and limited to active assignments', () => {
  const route = source('src/app/api/courier/location/route.ts');
  const track = source('src/app/api/public/[slug]/track/route.ts');
  const app = source('src/components/courier-app.tsx');
  assert.match(route, /auth\.business\.id/);
  assert.match(route, /\["assigned", "picked_up"\]/);
  assert.match(route, /accuracyMeters > 10_000/);
  assert.match(route, /DELETE = withAuth/);
  assert.match(track, /courierLocations\.updatedAt, new Date\(Date\.now\(\) - 3 \* 60_000\)/);
  assert.match(app, /اشتراک موقعیت با مشتریان فعال/);
  assert.match(app, /clearWatch/);
});

test('purchase suggestions expose the formula and keep forecast reads separate from stock writes', () => {
  const route = source('src/app/api/reports/purchase-suggestions/route.ts');
  const moduleCode = source('src/modules/inventory.tsx');
  assert.match(route, /avgDailyConsumption \* \(leadTimeDays \+ safetyDays\) - item\.stock - incomingConfirmed/);
  assert.match(route, /incomingConfirmed = 0/);
  assert.doesNotMatch(route, /update\(inventoryItems\)|insert\(stockMovements\)/);
  assert.match(moduleCode, /پیشنهاد خرید بر اساس مصرف/);
});

test('weighted sales calculate net grams, price, and raw yield safely from server catalog data', () => {
  const { calculateWeightedSale, orderLineTotal } = loadWeightedSales();
  const sale = calculateWeightedSale({ sellingMode: 'weight', pricePerUnit: 100000, grossGrams: 500, tareGrams: 50, yieldRatio: 0.8 });
  assert.equal(sale.netGrams, 450);
  assert.equal(sale.lineTotal, 45000);
  assert.equal(sale.rawIngredientKg, 0.5625);
  assert.equal(calculateWeightedSale({ sellingMode: 'weight', pricePerUnit: 100000, grossGrams: 250, tareGrams: 0, yieldRatio: 1 }).lineTotal, 25000);
  assert.throws(() => calculateWeightedSale({ sellingMode: 'count', pricePerUnit: 100000, grossGrams: 250 }), /بر اساس وزن/);
  assert.throws(() => calculateWeightedSale({ sellingMode: 'weight', pricePerUnit: 100000, grossGrams: 200, tareGrams: 200 }), /ظرف/);
  assert.throws(() => calculateWeightedSale({ sellingMode: 'weight', pricePerUnit: 100000, grossGrams: 0.5 }), /وزن ناخالص/);
  assert.throws(() => calculateWeightedSale({ sellingMode: 'weight', pricePerUnit: 100000, grossGrams: 250, yieldRatio: 0 }), /بازده/);
  assert.equal(orderLineTotal({ lineTotal: 0, price: 10, quantity: 2 }), 0);
  assert.equal(orderLineTotal({ price: 10, quantity: 2 }), 20);
  const { cartLines, changeCartVariant } = loadOrderCart();
  const cart = changeCartVariant({}, 7, [], 1, 50, 500, 50);
  const [line] = cartLines([{ id: 7, name: 'خوراک', price: 100000, sellingMode: 'weight', yieldRatio: 0.8 }], cart);
  assert.equal(line.weightGrams, 500, 'cart API weight stays gross so the server subtracts tare exactly once');
  assert.equal(line.netWeightGrams, 450, 'cart display gets net weight');
  assert.equal(line.lineTotal, 45000);

  const orders = source('src/lib/orders.ts');
  const schema = source('src/db/schema.ts');
  const migration = source('src/db/migrations/0022_weighted_sales.sql');
  const scaleReadings = source('src/app/api/scales/route.ts');
  const bridgeAgent = source('public/bridge/agent.mjs');
  assert.match(orders, /calculateWeightedSale\(\{ sellingMode: "weight", pricePerUnit: p\.price/);
  assert.match(orders, /price:\s*p\.price, quantity: it\.quantity, weightGrams: weighed\.netGrams/);
  assert.match(orders, /yieldRatioSnapshot: weighed\.yieldRatio, lineTotal: weighed\.lineTotal/);
  assert.match(orders, /item\.weightGrams \/ 1000\) \/ item\.yieldRatioSnapshot/);
  assert.match(orders, /\.reduce\(\(s, i\) => s \+ orderLineTotal\(i\), 0\)/);
  assert.match(schema, /weightGrams: integer\("weight_grams"\)/);
  assert.match(schema, /lineTotal: integer\("line_total"\)/);
  assert.match(migration, /UPDATE order_items SET line_total = \(price::bigint \* quantity\)::integer WHERE line_total = 0/);
  assert.match(source('src/app/api/stats/route.ts'), /sum\(\$\{orderItems\.lineTotal\}\)/);
  assert.match(scaleReadings, /eq\(devices\.businessId, auth\.business\.id\)/);
  assert.match(scaleReadings, /gte\(devices\.lastSeenAt, freshSince\)/);
  assert.match(scaleReadings, /Cache-Control.*no-store/);
  assert.doesNotMatch(scaleReadings, /devices\.code/);
  assert.match(bridgeAgent, /if \(d\.weightUnit === "g"\) weight \/= 1000/);
});

test('zero-priced products and variants are rejected before adding to every order cart', () => {
  const { hasPositiveCartLinePrice } = loadOrderCart();
  assert.equal(hasPositiveCartLinePrice({ id: 11, name: 'رایگان', price: 0 }, []), false);
  assert.equal(hasPositiveCartLinePrice({ id: 12, name: 'عادی', price: 1000 }, []), true);
  const discountedToZero = {
    id: 13,
    name: 'محصول با گزینه',
    price: 1000,
    modifierGroups: [{ id: 'g', name: 'افزودنی', required: false, min: 0, max: 1, active: true, options: [{ id: 'free', name: 'رایگان', priceDelta: -1000, active: true }] }],
  };
  assert.equal(hasPositiveCartLinePrice(discountedToZero, ['free']), false);
  assert.equal(hasPositiveCartLinePrice({ id: 14, name: 'وزنی', price: 1, sellingMode: 'weight' }, [], 1, 0), false, 'a rounded zero-value weight line is not purchasable');

  const orders = source('src/lib/orders.ts');
  assert.match(orders, /p\.price <= 0/);
  assert.match(orders, /price <= 0/);
  assert.match(orders, /weighed\.lineTotal <= 0/);
  for (const file of ['src/modules/waiter.tsx', 'src/components/menu-client.tsx', 'src/components/kiosk-client.tsx']) {
    assert.match(source(file), /hasPositiveCartLinePrice/);
  }
});

test('target price math uses the documented food-cost and gross-margin formulas with integer Toman rounding', () => {
  const { calculateTargetPrice } = loadPriceTargetRules();
  assert.equal(calculateTargetPrice(30_000, 30, 'food_cost'), 100_000);
  assert.equal(calculateTargetPrice(30_000, 70, 'gross_margin'), 100_000);
  assert.equal(calculateTargetPrice(10_000, 33, 'food_cost'), 30_303);
  assert.throws(() => calculateTargetPrice(0, 30, 'food_cost'), /بیشتر از صفر/);
  assert.throws(() => calculateTargetPrice(10_000, 100, 'gross_margin'), /بین ۱ تا ۹۹/);
  assert.throws(() => calculateTargetPrice(10_000, 30, 'unknown'), /نوع هدف/);
  assert.throws(() => calculateTargetPrice(2_000_000_000, 1, 'food_cost'), /سقف مجاز/);
});

test('recipe price analysis includes waste, batch yield, and weighted-product yield in the server formula', () => {
  const { calculateRecipeCost, calculateTargetPrice, currentRecipeMaterialCost } = loadPriceTargetRules();
  const batch = calculateRecipeCost([{ quantity: 100, costPerUnit: 20, wastePercent: 5 }], 2, 1);
  assert.equal(batch.batchCost, 2_100);
  assert.equal(batch.unitCost, 1_050);
  assert.equal(batch.lines[0].quantityPerUnit, 50);
  assert.equal(batch.lines[0].extendedCost, 1_050);
  assert.equal(calculateTargetPrice(batch.unitCost, 30, 'gross_margin'), 1_500);
  assert.equal(calculateRecipeCost([{ quantity: 100, costPerUnit: 20, wastePercent: 5 }], 2, 0.8).unitCost, 1_313);
  assert.throws(() => calculateRecipeCost([{ quantity: 1, costPerUnit: 10, wastePercent: 100 }]), /ضایعات/);
  const rounding = calculateRecipeCost([{ quantity: 0.4, costPerUnit: 1 }, { quantity: 0.4, costPerUnit: 1 }]);
  assert.equal(rounding.lines.reduce((sum, line) => sum + line.extendedCost, 0), rounding.unitCost);
  assert.equal(currentRecipeMaterialCost(25_000, 20_000).costPerUnit, 25_000);
  assert.equal(currentRecipeMaterialCost(25_000, 20_000).costBasis, 'last_purchase');
  assert.equal(currentRecipeMaterialCost(0, 20_000).costPerUnit, 20_000);
  assert.equal(currentRecipeMaterialCost(0, 20_000).costBasis, 'stock_average');
  assert.equal(currentRecipeMaterialCost(undefined, 20_000).costBasis, 'stock_average');
});

test('unsaved recipe preview reads material costs from the tenant inventory and never trusts submitted unit costs', () => {
  const route = source('src/app/api/costing/preview/route.ts');
  const schema = source('src/db/schema.ts');
  const migration = source('src/db/migrations/0033_recipe_waste_percent.sql');
  assert.match(route, /eq\(inventoryItems\.businessId, auth\.business\.id\)/);
  assert.match(route, /calculateRecipeCost/);
  assert.doesNotMatch(route, /line\.costPerUnit/);
  assert.match(route, /new Set\(lines\.map/);
  assert.match(route, /feature: "costing"/);
  assert.match(route, /costPerUnit <= 0/);
  assert.match(schema, /wastePercent: doublePrecision\("waste_percent"\)\.notNull\(\)\.default\(0\)/);
  assert.match(migration, /CHECK \(waste_percent >= 0 AND waste_percent <= 99\.9\)/);
  assert.match(source('src/lib/orders.ts'), /recipe\.quantity \* \(1 \+ \(recipe\.wastePercent \?\? 0\) \/ 100\) \* productUnits/);
  assert.match(source('src/lib/accounting.ts'), /r\.quantity \* ii\.recipe_to_stock_factor \* \(1 \+ r\.waste_percent \/ 100\.0\) \* ii\.cost_per_unit/);
  assert.match(source('src/lib/registry-b.ts'), /calculateRecipeCost\(/);
  assert.match(source('src/lib/registry-b.ts'), /currentRecipeMaterialCost\(it\.lastPurchaseCost, it\.costPerUnit\)/);
  assert.match(source('src/modules/inventory.tsx'), /costBasis: "last_purchase" \| "stock_average"/);
});

test('target price apply is tenant-bound, recalculates the server snapshot, and audits before/after price', () => {
  const service = source('src/lib/price-target.ts');
  const route = source('src/app/api/costing/price-target/route.ts');
  const schema = source('src/db/schema.ts');
  const migration = source('src/db/migrations/0030_product_price_audits.sql');
  assert.match(service, /eq\(products\.businessId, businessId\)/);
  assert.match(service, /eq\(inventoryItems\.businessId, businessId\)/);
  assert.match(service, /costPerUnit <= 0/);
  assert.match(service, /snapshot\.snapshotHash !== input\.snapshotHash/);
  assert.match(service, /await tx\.update\(products\)\.set\(\{ price: newPrice \}\)/);
  assert.match(service, /await tx\.insert\(productPriceAudits\)\.values/);
  assert.match(service, /previousPrice, newPrice, unitCost: snapshot\.unitCost/);
  assert.match(route, /manager: true/);
  assert.match(route, /auth\.business\.id/);
  assert.doesNotMatch(route, /body\.price/);
  assert.match(schema, /export const productPriceAudits = pgTable\("product_price_audits"/);
  assert.match(migration, /CREATE TABLE product_price_audits/);
});

test('smart pricing route preserves dashboard access controls and product form shows the server cost basis', () => {
  const page = source('src/app/dashboard/pricing/page.tsx');
  const sidebar = source('src/components/dashboard-shell.tsx');
  const form = source('src/app/dashboard/products/create/page.tsx');
  assert.match(page, /if \(!auth\) redirect\("\/login"\)/);
  assert.match(page, /can\(auth, "costing"\)/);
  assert.match(page, /\["owner", "manager", "accountant", "warehouse"\]/);
  assert.match(sidebar, /href: "\/dashboard\/pricing", label: "قیمت‌گذاری هوشمند"/);
  assert.match(form, /currentRecipeMaterialCost\(material\.lastPurchaseCost, material\.costPerUnit\)/);
  assert.match(form, /line\.costBasis === "last_purchase"/);
  assert.match(source('src/lib/price-target.ts'), /lastPurchaseCost, costBasis/);
});

test('product create/edit shares the full recipe workflow and smart pricing can edit its materials', () => {
  const list = source('src/app/dashboard/products/page.tsx');
  const form = source('src/app/dashboard/products/create/page.tsx');
  const pricing = source('src/modules/inventory.tsx');
  const recipeEditor = source('src/components/product-recipe-editor.tsx');
  assert.match(list, /router\.push\(`\/dashboard\/products\/create\?edit=\$\{p\.id\}`\)/);
  assert.match(form, /searchParams\.get\("edit"\)/);
  assert.match(form, /setInitialRecipes\(rows\)/);
  assert.match(form, /method: "PATCH", body: payload/);
  assert.match(form, /api\(`\/api\/r\/recipes\/\$\{recipe\.recipeId\}`/);
  assert.match(pricing, /<ProductRecipeEditor productId=\{item\.id\}/);
  assert.match(recipeEditor, /recipes\.update\(line\.id/);
  assert.match(recipeEditor, /recipes\.create\(/);
  assert.match(recipeEditor, /recipes\.remove\(line\.id\)/);
  assert.match(recipeEditor, /selectedItem/);
  assert.match(recipeEditor, /ویرایش کامل محصول/);
});

test('category management follows the reference table and persists parent metadata safely', () => {
  const categories = source('src/app/dashboard/categories/page.tsx');
  assert.match(categories, /const \[query, setQuery\]/);
  assert.match(categories, /const productCounts = useMemo/);
  assert.match(categories, /افزودن گروهی/);
  assert.match(categories, /ایجاد دسته.?بندی/);
  assert.match(categories, /sm:w-64/);
  assert.match(categories, /لیست تمامی دسته‌بندی‌های منو/);
  assert.match(categories, /نمایش \{toFa\(visibleCategories\.length \? 1 : 0\)\} تا/);
  assert.match(categories, /<table/);
  for (const label of ['تصویر', 'عنوان دسته‌بندی', 'تعداد محصولات', 'ردیف نمایش', 'وضعیت', 'مدیریت']) assert.ok(categories.includes(label));
  assert.match(categories, /ImageUpload/);
  assert.match(categories, /دسته‌بندی والد/);
  assert.match(categories, /توضیحات دسته‌بندی/);
  assert.match(categories, /category\.sortOrder/);
  assert.doesNotMatch(categories, /selectedProducts|کارت‌های KPI/);
  assert.match(categories, /products\.error/);

  const resources = source('src/lib/resources.ts');
  const schema = source('src/db/schema.ts');
  const migration = source('src/db/migrations/0039_category_management_fields.sql');
  assert.match(resources, /parentCategoryId: \{ type: "nullableInt"/);
  assert.match(resources, /eq\(categories\.businessId, biz\.id\)/);
  assert.match(resources, /categoryParentError\(id, data\.parentCategoryId/);
  assert.match(schema, /parentCategoryId: integer\("parent_category_id"\)/);
  assert.match(schema, /description: text\("description"\)/);
  assert.match(schema, /imageUrl: text\("image_url"\)/);
  assert.match(migration, /REFERENCES categories\(id\) ON DELETE SET NULL/);

  const treeBox = { exports: {} };
  const treeJs = ts.transpileModule(source('src/lib/category-tree.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(treeJs, { module: treeBox, exports: treeBox.exports });
  const { categoryParentError } = treeBox.exports;
  const rows = [{ id: 1, parentCategoryId: null }, { id: 2, parentCategoryId: 1 }, { id: 3, parentCategoryId: 2 }];
  assert.equal(categoryParentError(undefined, 1, rows), null);
  assert.match(categoryParentError(2, 2, rows), /والد خودش/);
  assert.match(categoryParentError(1, 3, rows), /چرخه/);
  assert.match(categoryParentError(2, 99, rows), /پیدا نشد/);
  assert.equal(categoryParentError(2, null, rows), null);
});

test('SMS retention gates opt-in, phone, post-trigger purchase, segment changes, cooldown, and monthly frequency', () => {
  const { normalizeIranMobile, retentionEligibility, segmentTransitionMatches } = loadRetentionRules();
  assert.equal(normalizeIranMobile('۰۹۳۵۱۲۳۴۵۶۷'), '09351234567');
  assert.equal(normalizeIranMobile('+989351234567'), '09351234567');
  assert.equal(normalizeIranMobile('123'), null);
  assert.equal(segmentTransitionMatches('segment_enter', 'at_risk', 'regular', 'at_risk'), true);
  assert.equal(segmentTransitionMatches('segment_exit', 'at_risk', 'at_risk', 'lost'), true);
  assert.equal(segmentTransitionMatches('segment_exit', 'at_risk', 'regular', 'lost'), false);
  const base = { smsOptIn: true, phone: '09351234567', lastOrderAt: null, anchorOrderAt: null, currentSegment: 'at_risk', expectedSegment: 'at_risk', lastMarketingAt: null, marketingCount30Days: 0, cooldownDays: 30, maxMarketingSms30Days: 4, now: new Date('2026-10-19T12:00:00Z') };
  assert.equal(retentionEligibility(base).eligible, true);
  assert.equal(retentionEligibility({ ...base, smsOptIn: false }).reason, 'opt_out');
  assert.equal(retentionEligibility({ ...base, lastOrderAt: new Date('2026-10-19T11:00:00Z') }).reason, 'purchase_after_trigger');
  assert.equal(retentionEligibility({ ...base, currentSegment: 'regular' }).reason, 'segment_changed');
  assert.equal(retentionEligibility({ ...base, lastMarketingAt: new Date('2026-10-10T12:00:00Z') }).reason, 'cooldown');
  assert.equal(retentionEligibility({ ...base, marketingCount30Days: 4 }).reason, 'frequency_cap');
});

test('retention jobs are durable, tenant-scoped, consent-rechecked, and do not retry uncertain provider outcomes', () => {
  const service = source('src/lib/sms-retention.ts');
  const api = source('src/app/api/sms-retention/route.ts');
  const migration = source('src/db/migrations/0031_sms_retention.sql');
  assert.match(service, /eq\(customers\.businessId, biz\.id\)/);
  assert.match(service, /eq\(smsRetentionDeliveries\.status, "queued"\)/);
  assert.match(service, /retentionEligibility\(/);
  assert.match(service, /eq\(discountCodes\.businessId, biz\.id\)/);
  assert.match(service, /o\.status = 'paid' AND o\.payment_status = 'paid'/);
  assert.match(service, /row_number\(\) OVER \(PARTITION BY o\.id ORDER BY d\.sent_at DESC, d\.id DESC\)/);
  assert.match(service, /status: uncertain \? "uncertain" : retry \? "queued"/);
  assert.match(service, /onConflictDoNothing\(\)/);
  assert.match(service, /for\("update"\)/);
  assert.match(api, /feature: "sms", manager: true/);
  assert.match(migration, /UNIQUE \(business_id, rule_id, customer_id, trigger_key\)/);
  assert.match(migration, /CREATE TABLE sms_retention_deliveries/);
});

test('SMS provider tests use a mocked fetch and never send a real message', async () => {
  let calls = 0;
  const fakeFetch = async () => { calls++; return { json: async () => ({ status: 1, data: { messageId: 'mock' } }) }; };
  const { sendPattern } = loadSmsProvider(fakeFetch);
  const template = { templateId: '12', params: [{ name: 'NAME', var: 'customer_name' }] };
  assert.equal((await sendPattern({ provider: 'smsir', apiKey: '' }, template, '09351234567', {})).status, 'failed');
  assert.equal(calls, 0);
  assert.equal((await sendPattern({ provider: 'smsir', apiKey: 'fake-key' }, template, '09351234567', { customer_name: 'Demo' })).status, 'sent');
  assert.equal(calls, 1);
});

test('custom sales report range validates Tehran calendar boundaries and caps broad requests', () => {
  const { parseSalesReportRange, reportCalendarKeys } = loadSalesReportRange();
  const range = parseSalesReportRange(new URLSearchParams({ from: '2026-10-19', to: '2026-10-20' }));
  assert.equal(range.custom, true);
  assert.equal(range.days, 2);
  const localStart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(range.from);
  const localEnd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(range.to);
  assert.equal(localStart, '00:00');
  assert.equal(localEnd, '23:59');
  assert.equal(reportCalendarKeys(range, date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(date)).length, 2);
  assert.throws(() => parseSalesReportRange(new URLSearchParams({ from: '2026-02-30', to: '2026-03-01' })), /تاریخ بازه معتبر نیست/);
  assert.throws(() => parseSalesReportRange(new URLSearchParams({ from: '2026-10-20', to: '2026-10-19' })), /پایان باید/);
  assert.throws(() => parseSalesReportRange(new URLSearchParams({ from: '2025-10-01', to: '2026-10-02' })), /۳۶۶ روز/);
  assert.throws(() => parseSalesReportRange(new URLSearchParams({ from: '2026-10-19' })), /هر دو انتخاب/);
  assert.equal(parseSalesReportRange(new URLSearchParams({ days: '900' })).days, 365);
});

test('sales report dashboard and export share paid-order date filters and bounded tenant-scoped reads', () => {
  const registry = source('src/lib/registry-b.ts');
  const route = source('src/app/api/reports/sales/export/route.ts');
  const ui = source('src/modules/finance.tsx');
  assert.match(registry, /parseSalesReportRange\(new URL\(req\.url\)\.searchParams\)/);
  assert.match(registry, /eq\(orders\.paymentStatus, "paid"\)/);
  assert.match(registry, /rows\.length > 50_000/);
  assert.match(route, /eq\(orders\.businessId, auth\.business\.id\)/);
  assert.match(route, /eq\(orders\.paymentStatus, "paid"\)/);
  assert.match(route, /parseSalesReportRange/);
  assert.match(route, /csvCell/);
  assert.match(route, /rows\.length > 10_000/);
  assert.ok(ui.includes("/api/reports/sales/export?${salesQuery}"));
  assert.match(ui, /window\.print\(\)/);
});

test('receipt archive is tenant-scoped and paginated; reprint only reads the stored order snapshot', () => {
  const route = source('src/app/api/receipt-archive/route.ts');
  const ui = source('src/modules/orders.tsx');
  const printPage = source('src/app/print/receipt/[id]/page.tsx');
  const orderService = source('src/lib/orders.ts');
  assert.match(route, /eq\(orders\.businessId, auth\.business\.id\)/);
  assert.match(route, /manager: true/);
  assert.match(route, /PAGE_SIZE = 50/);
  assert.match(route, /lt\(orders\.id, cursor\)/);
  assert.match(route, /nextCursor/);
  assert.doesNotMatch(route, /\.update\(|\.insert\(|settleOrder/);
  assert.match(ui, /\/api\/receipt-archive/);
  assert.match(ui, /receipt\/\$\{item\.id\}\?reprint=1/);
  assert.match(printPage, /نسخهٔ چاپ مجدد/);
  assert.match(printPage, /listOrders\(auth\.business\.id, \{ id: chk\.id \}\)/);
  assert.match(orderService, /\.from\(orderItems\)/);
});

function loadMembershipCore() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/membership-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Math, Number, Set, String, Array, Error, Date });
  return box.exports;
}

function loadOrderWorkflow() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/order-workflow-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Array });
  return box.exports;
}

test('membership tiers validate thresholds, evaluate rolling eligibility, and cap discounts deterministically', () => {
  const { parseMembershipTierRules, membershipDiscountAmount, chooseMembershipTier } = loadMembershipCore();
  const tiers = parseMembershipTierRules([
    { id: 'gold', name: 'طلایی', minSpent: '۵۰۰۰۰۰۰', minOrders: '3', validityDays: '365', discountPercent: '15', maxDiscount: '100000', isActive: true },
    { id: 'silver', name: 'نقره‌ای', minSpent: 1_000_000, minOrders: 0, validityDays: 90, discountPercent: 10, maxDiscount: 0, isActive: true },
  ]);
  const now = new Date('2026-10-19T12:00:00Z');
  const metrics = {
    gold: { totalSpent: 6_000_000, ordersCount: 2, lastOrderAt: new Date('2026-10-18T12:00:00Z') },
    silver: { totalSpent: 2_000_000, ordersCount: 1, lastOrderAt: new Date('2026-10-18T12:00:00Z') },
  };
  assert.equal(chooseMembershipTier(tiers, metrics, now).tier.id, 'silver');
  metrics.gold.ordersCount = 3;
  assert.equal(chooseMembershipTier(tiers, metrics, now).tier.id, 'gold');
  assert.equal(membershipDiscountAmount(1_599, tiers[0]), 239);
  assert.equal(membershipDiscountAmount(1_000_000, tiers[0]), 100_000);
  assert.equal(membershipDiscountAmount(1_000, tiers[1]), 100);
  metrics.gold.lastOrderAt = new Date('2025-10-19T12:00:00Z');
  assert.equal(chooseMembershipTier(tiers, metrics, now).tier.id, 'silver');
  assert.throws(() => parseMembershipTierRules([{ ...tiers[0], minSpent: 0, minOrders: 0 }]), /حداقل مبلغ یا تعداد/);
  assert.throws(() => parseMembershipTierRules([{ ...tiers[0], id: 'bad', validityDays: 731 }]), /مدت اعتبار/);
  assert.throws(() => parseMembershipTierRules([{ ...tiers[0], id: 'same' }, { ...tiers[1], id: 'same' }]), /تکراری/);
});

test('order workflow presets only group display stages and preserve canonical status values', () => {
  const { workflowDisplayStages, workflowDisplayStageIndex } = loadOrderWorkflow();
  assert.deepEqual(Array.from({ length: 4 }, (_, index) => workflowDisplayStages(index + 1).length), [1, 2, 3, 4]);
  assert.equal(workflowDisplayStageIndex(3, 'preparing'), 1);
  assert.equal(workflowDisplayStageIndex(3, 'ready'), 1);
  assert.equal(workflowDisplayStageIndex(3, 'served'), 2);
  assert.equal(workflowDisplayStageIndex(2, 'served'), 1);
  assert.equal(workflowDisplayStageIndex(1, 'pending'), 0);
  assert.equal(workflowDisplayStageIndex(4, 'paid'), -1);
  assert.equal(workflowDisplayStageIndex(4, 'canceled'), -1);
  assert.deepEqual([...workflowDisplayStages(3)[1].statuses], ['preparing', 'ready']);
});

test('membership discount is staff-confirmed, tenant-scoped, re-evaluated server-side, and snapshotted', () => {
  const orders = source('src/lib/orders.ts');
  const business = source('src/app/api/business/route.ts');
  const cashier = source('src/modules/waiter.tsx');
  const schema = source('src/db/schema.ts');
  const migration = source('src/db/migrations/0032_membership_order_snapshot.sql');
  const rollback = source('src/db/migrations/0032_membership_order_snapshot.down.sql');
  assert.match(orders, /input\.useMembership && source !== "cashier"/);
  assert.match(orders, /مزیت عضویت با کد تخفیف یا تخفیف دستی/);
  assert.match(orders, /currentMembership\(biz\.id, customerId, settingsOf\(biz\)\.membershipTiers \?\? \[\], new Date\(\), tx\)/);
  assert.match(orders, /membershipAppliedBy: membershipSnapshot \? opts\.actorId/);
  assert.match(business, /membershipPreview/);
  assert.match(business, /eq\(customers\.businessId, business\.id\)/);
  assert.match(business, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(business.slice(business.indexOf('if (url.searchParams.get("membershipPreview")'), business.indexOf('return Response.json({ item: publicBiz')), /customer\.phone|customer\.name/);
  assert.match(cashier, /useMembership: mode === "cashier" && useMembership/);
  assert.match(schema, /membershipSnapshot: jsonb\("membership_snapshot"\)/);
  assert.match(migration, /membership_applied_by/);
  assert.match(rollback, /Refusing to drop membership discount snapshots/);
});
