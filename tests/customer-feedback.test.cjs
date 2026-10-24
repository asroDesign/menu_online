const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadCore() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/customer-feedback-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports });
  return box.exports;
}

test('feedback setting is opt-in and accepts only explicit true', () => {
  const { customerFeedbackEnabled } = loadCore();
  assert.equal(customerFeedbackEnabled({}), false);
  assert.equal(customerFeedbackEnabled({ customerFeedbackEnabled: false }), false);
  assert.equal(customerFeedbackEnabled({ customerFeedbackEnabled: 'true' }), false);
  assert.equal(customerFeedbackEnabled({ customerFeedbackEnabled: true }), true);
});

test('customer feedback accepts only suggestion/complaint with bounded non-empty text', () => {
  const { parseCustomerFeedbackInput } = loadCore();
  const parsed = parseCustomerFeedbackInput({ type: 'suggestion', message: '  پیام کاربردی برای رستوران  ' });
  assert.equal(parsed.type, 'suggestion');
  assert.equal(parsed.message, 'پیام کاربردی برای رستوران');
  assert.equal(parseCustomerFeedbackInput({ type: 'other', message: 'یک پیام معتبر و بلند' }), null);
  assert.equal(parseCustomerFeedbackInput({ type: 'complaint', message: 'کوتاه' }), null);
  assert.equal(parseCustomerFeedbackInput({ type: 'complaint', message: `x${'x'.repeat(1500)}` }), null);
});

test('public feedback API requires the tenant setting and an OTP-bound customer session', () => {
  const route = source('src/app/api/public/[slug]/customer/feedback/route.ts');
  assert.match(route, /customerFeedbackEnabled\(business\.settings\)/);
  assert.match(route, /publicCustomerId\(slug, business\.id\)/);
  assert.match(route, /eq\(customers\.businessId, business\.id\)/);
  assert.match(route, /customer-feedback-submit/);
  assert.match(route, /readJson\(req, 8 \* 1024\)/);
  assert.match(route, /customerFeedback\.customerId, customer\.id/);
});

test('feedback manager routes are tenant scoped and status changes are allow-listed', () => {
  const registry = source('src/lib/registry-b.ts');
  assert.match(registry, /customer_feedback: customerFeedbackH/);
  assert.match(registry, /eq\(customerFeedback\.businessId, business\.id\)/);
  assert.match(registry, /isCustomerFeedbackStatus\(body\.status\)/);
  assert.match(registry, /\{ manager: true \}/);
});
