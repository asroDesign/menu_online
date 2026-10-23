const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function checkout(failSettlement = false) {
  const committed = [];
  const effects = [];
  const createOptions = [];
  let txCount = 0;
  const db = { transaction: async (fn) => {
    txCount++;
    const executor = { pending: [] };
    const result = await fn(executor);
    committed.push(...executor.pending);
    return result;
  } };
  const mocks = {
    '@/lib/cashier-debt-input': { parseCashierDebt: value => value },
    'drizzle-orm': { and() {}, eq() {} }, '@/db': { db }, '@/db/schema': { staff: {} },
    '@/lib/auth': { withAuth: fn => fn, readJson: async req => req, HttpError: class extends Error {} },
    '@/lib/accounting': { ensureAccounting: async () => effects.push('chart') },
    '@/lib/roles': { isManagerRole: () => true }, '@/lib/rate-limit': { enforceRateLimit: async () => {} }, '@/lib/logger': { logInfo() {} },
    '@/lib/orders': {
      parseOrderInput: raw => raw,
      createOrder: async (_biz, _input, _source, _features, opts) => {
        createOptions.push(opts);
        (opts.executor?.pending ?? committed).push('order', 'items', 'customer');
        effects.push('create');
        return { id: 1 };
      },
      settleOrder: async (_biz, _features, _id, method, _setStatus, opts) => {
        assert.ok(opts.executor, 'cashier settlement must share creation transaction');
        assert.equal(opts.creditSale, method === 'credit');
        opts.executor.pending.push('accounting', method === 'credit' ? 'debt' : 'payment');
        if (failSettlement) throw new Error('injected accounting failure');
      },
      listOrders: async () => [{ id: 1 }],
    },
  };
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/app/api/orders/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports: mod.exports, module: mod, require: id => { if (!mocks[id]) throw new Error(id); return mocks[id]; }, Response, URL });
  return { run: input => mod.exports.POST({ source: 'cashier', ...input }, { role: 'cashier', business: { id: 1 }, user: { id: 2 }, features: {} }), committed, effects, createOptions, transactions: () => txCount };
}

for (const method of ['cash', 'pos', 'card', 'credit']) {
  test(`cashier ${method}: order, customer and ledger commit together`, async () => {
    const h = checkout();
    const response = await h.run({ payNow: method });
    assert.equal(response.status, 201);
    assert.equal(h.transactions(), 1);
    assert.equal(h.createOptions[0].deferPrint, method !== 'credit', 'only a payment that transitions to preparation defers printing to settlement');
    assert.deepEqual(h.effects, ['chart', 'create']);
    assert.deepEqual(h.committed, ['order', 'items', 'customer', 'accounting', method === 'credit' ? 'debt' : 'payment']);
  });
  test(`cashier ${method}: settlement failure rolls back the whole request`, async () => {
    const h = checkout(true);
    await assert.rejects(h.run({ payNow: method }), /injected accounting failure/);
    assert.deepEqual(h.committed, []);
  });
}
test('register without payment creates an open order without financial settlement', async () => {
  const h = checkout();
  await h.run({ payNow: null });
  assert.equal(h.createOptions[0].deferPrint, undefined, 'unpaid orders still print when first registered');
  assert.deepEqual(h.committed, ['order', 'items', 'customer']);
  assert.equal(h.transactions(), 0);
});

function manualPrint({ exists = true, queued = 2 } = {}) {
  const calls = [];
  let policy;
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const mocks = {
    '@/lib/auth': { withAuth: (fn, options) => { policy = options; return fn; }, readJson: async req => req, HttpError },
    '@/lib/rate-limit': { enforceRateLimit: async () => calls.push('rate-limit') },
    '@/lib/orders': {
      listOrders: async (tenant, { id }) => { calls.push(['lookup', tenant, id]); return exists ? [{ id }] : []; },
      queuePrintJobs: async (...args) => { calls.push(['queue', args[0].id, args[1], args[7]]); return queued; },
    },
  };
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/app/api/orders/[id]/print/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports: mod.exports, module: mod, require: id => mocks[id], Response });
  return { calls, policy, run: (kind = 'kitchen') => mod.exports.POST({ kind }, { business: { id: 42 }, user: { id: 3 }, features: {} }, { id: '12' }) };
}
test('manual receipt routes through tenant lookup, limiter and cashier authorization', async () => {
  const h = manualPrint();
  assert.equal(h.policy.feature, 'cloud_printer');
  assert.deepEqual(Array.from(h.policy.roles), ['cashier']);
  assert.equal((await h.run()).status, 200);
  assert.deepEqual(h.calls, ['rate-limit', ['lookup', 42, 12], ['queue', 42, 12, 'kitchen']]);
});
test('another tenant or missing order cannot enqueue a receipt', async () => {
  const h = manualPrint({ exists: false });
  await assert.rejects(h.run(), { status: 404 });
  assert.equal(h.calls.some(row => Array.isArray(row) && row[0] === 'queue'), false);
});
test('no matching printer returns an actionable error instead of claiming success', async () => {
  await assert.rejects(manualPrint({ queued: 0 }).run(), { status: 409 });
  await assert.rejects(manualPrint().run('anything'), { status: 400 });
});
