const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

test('waiter push subscriptions require waiter role, entitlement, and current-user tenant ownership', () => {
  const route = source('src/app/api/r/push-subscriptions/route.ts');
  const sender = source('src/lib/web-push.ts');
  const schema = source('src/db/schema.ts');
  const migration = source('src/db/migrations/0052_waiter_push_subscriptions.sql');
  assert.match(route, /requireWaiter\(auth\.role\)/);
  assert.match(route, /withAuth\(async[\s\S]*feature: "waiter_call"/);
  assert.match(route, /eq\(pushSubscriptions\.businessId, auth\.business\.id\)/);
  assert.match(route, /eq\(pushSubscriptions\.userId, auth\.user\.id\)/);
  assert.match(route, /endpoint: subscription\.endpoint/);
  assert.match(route, /hostname === "fcm\.googleapis\.com"/);
  assert.match(route, /hostname === "web\.push\.apple\.com"/);
  assert.match(route, /hostname\.endsWith\("\.notify\.windows\.com"\)/);
  assert.match(route, /!trustedPushHost/);
  assert.match(sender, /eq\(pushSubscriptions\.businessId, input\.businessId\)/);
  assert.match(sender, /eq\(users\.businessId, input\.businessId\)/);
  assert.match(sender, /eq\(users\.staffRole, "waiter"\)/);
  assert.match(sender, /eq\(staff\.role, "waiter"\)/);
  assert.match(sender, /eq\(staff\.isActive, true\)/);
  assert.match(schema, /pushSubscriptions = pgTable\("push_subscriptions"/);
  assert.match(migration, /endpoint text NOT NULL UNIQUE/);
});

test('customer service requests trigger privacy-minimized push after durable insert', () => {
  const route = source('src/app/api/public/[slug]/service-requests/route.ts');
  const sender = source('src/lib/web-push.ts');
  assert.match(route, /db\.insert\(waiterServiceRequests\)[\s\S]*await sendWaiterCallPush/);
  assert.match(sender, /type: "waiter-call"/);
  assert.match(sender, /requestId: input\.requestId/);
  assert.match(sender, /body: `میز \$\{input\.tableName\} درخواست حضور گارسون دارد\.`/);
  assert.doesNotMatch(sender, /message: input\.message/);
  assert.match(sender, /statusCode === 404 \|\| statusCode === 410/);
});

test('waiter opt-in registers the worker only after a user gesture and the worker shows/clicks a system notification', () => {
  const enrollment = source('src/components/waiter-push-enrollment.tsx');
  const worker = source('public/service-worker.js');
  const shell = source('src/components/dashboard-shell.tsx');
  const manifest = source('src/app/manifest.ts');
  assert.match(enrollment, /Notification\.requestPermission\(\)/);
  assert.match(enrollment, /pushManager\.subscribe\(/);
  assert.match(enrollment, /register\("\/service-worker\.js"/);
  assert.match(enrollment, /api\("\/api\/r\/push-subscriptions"/);
  assert.match(shell, /role === "waiter" && hasAny\(features, "waiter_call"\) && <WaiterPushEnrollment/);
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /showNotification\(/);
  assert.match(worker, /addEventListener\("notificationclick"/);
  assert.match(worker, /postMessage\(\{ type: "menupeak:waiter-call", requestId: payload\.requestId \}\)/);
  assert.doesNotMatch(worker, /postMessage\(\{[^}]*tableName|postMessage\(\{[^}]*body, title/);
  assert.match(manifest, /display: "standalone"/);
});
