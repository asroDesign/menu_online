const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function load(file, imports = {}) {
  const box = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, require: (id) => imports[id] ?? require(id), console });
  return box.exports;
}
const core = load('src/lib/accounting-document-core.ts');

test('journal cards show the actual parent moein and linked detail, including inactive historic accounts', () => {
  const accounts = new Map([
    [1, { id: 1, code: '11', name: 'نقد', level: 'kol', parentId: null }],
    [2, { id: 2, code: '1102', name: 'بانک‌ها', level: 'moein', parentId: 1 }],
    [3, { id: 3, code: '110201', name: 'بانک ملی', level: 'tafsili', parentId: 2, isActive: false }],
  ]);
  const row = core.journalAccountLabels(3, accounts);
  assert.equal(row.moeinCode, '1102'); assert.equal(row.moein, 'بانک‌ها');
  assert.equal(row.tafsili, '110201 — بانک ملی');
  assert.equal(core.journalAccountLabels(999, accounts).name, 'حساب نامشخص');
  accounts.get(1).parentId = 3;
  assert.equal(core.journalAccountLabels(3, accounts).kol, 'نقد');
});
test('invalid financial amounts are rejected before rounding and pagination is bounded', () => {
  for (const value of [NaN, Infinity, -Infinity, -0.1, 'bad', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => core.journalAmount(value));
  assert.equal(core.journalAmount(125.5), 126);
  assert.equal(core.journalAmount(undefined), 0);
  assert.equal(core.journalPagination('-3', '-9').page, 1);
  assert.equal(core.journalPagination('2', '20').offset, 20);
  assert.equal(core.journalPagination('Infinity', 'Infinity').limit, 100);
});

// A transactional in-memory adapter runs the actual posting/reversal functions.
// It verifies rollback/control flow; it is not a substitute for PostgreSQL integration tests.
function harness() {
  const names = ['accAccounts', 'accDocuments', 'accFiscalYears', 'accLines', 'assets', 'bankAccounts', 'businesses', 'devices', 'inventoryItems', 'orders', 'transactions'];
  const schema = Object.fromEntries(names.map((name) => [name, new Proxy({ table: name }, { get: (obj, key) => key === 'table' ? obj.table : { table: name, key } })]));
  const date = new Date('2026-10-25T00:00:00Z');
  let state = {
    accAccounts: [
      { id: 1, businessId: 1, code: '1101', name: 'صندوق', level: 'moein', isActive: true },
      { id: 2, businessId: 1, code: '4101', name: 'فروش', level: 'moein', isActive: true },
    ],
    accDocuments: [], accLines: [],
    accFiscalYears: [{ id: 1, businessId: 1, title: '1405', startDate: new Date('2026-03-21'), endDate: new Date('2027-03-20'), isClosed: false }],
  };
  let tail = Promise.resolve(); let failUpdate = false;
  const sql = (strings, ...values) => ({ text: strings.join('?'), values });
  const comparison = (fn) => (col, value) => (row) => fn(row[col.key], value);
  const orm = { sql, eq: comparison((a,b) => a === b), lte: comparison((a,b) => a <= b), gte: comparison((a,b) => a >= b),
    and: (...conditions) => (row) => conditions.filter(Boolean).every((fn) => fn(row)), asc: (x) => x, desc: (x) => x,
  };
  const db = {
    execute: async () => [],
    select(fields) {
      let table, predicate = () => true;
      const query = {
        from(value) { table = value.table; return query; }, where(fn) { predicate = fn; return query; },
        for() { return query; }, orderBy() { return query; }, limit() { return query; },
        then(resolve, reject) {
          try {
            const rows = (state[table] ?? []).filter(predicate);
            if (fields?.n?.text?.includes('count')) return Promise.resolve([{ n: rows.length }]).then(resolve, reject);
            if (fields?.n?.text?.includes('max')) return Promise.resolve([{ n: Math.max(0, ...rows.map((r) => r.number)) }]).then(resolve, reject);
            return Promise.resolve(rows.map((r) => ({ ...r }))).then(resolve, reject);
          } catch (error) { return Promise.reject(error).then(resolve, reject); }
        },
      };
      return query;
    },
    insert(table) {
      return { values(values) {
        const rows = Array.isArray(values) ? values : [values];
        assert.ok(rows.length, 'an empty insert is invalid');
        const action = () => rows.map((row) => {
          const target = state[table.table] ?? (state[table.table] = []);
          const item = { status: 'posted', reversed: false, reversedOf: null, id: Math.max(0, ...target.map((r) => r.id)) + 1, ...row };
          target.push(item); return { ...item };
        });
        return { returning: async () => action(), then: (resolve, reject) => Promise.resolve().then(action).then(resolve, reject) };
      } };
    },
    update(table) { return { set(patch) { return { where(predicate) {
      const action = () => {
        if (failUpdate) throw new Error('injected update failure');
        const rows = state[table.table].filter(predicate);
        rows.forEach((row) => Object.assign(row, patch)); return rows;
      };
      return { returning: async () => action(), then: (resolve, reject) => Promise.resolve().then(action).then(resolve, reject) };
    } }; } }; },
    delete(table) { return { where: async (predicate) => { state[table.table] = state[table.table].filter((row) => !predicate(row)); } }; },
    transaction(work) {
      const job = tail.then(async () => {
        const before = structuredClone(state);
        try { return await work(db); } catch (error) { state = before; throw error; }
      });
      tail = job.catch(() => {}); return job;
    },
  };
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const accounting = load('src/lib/accounting.ts', {
    '@/db': { db }, '@/db/schema': schema, 'drizzle-orm': orm, '@/lib/auth': { HttpError },
    '@/lib/accounting-document-core': core, '@/lib/jalali': { fmtJ: () => '1405/08/03' },
  });
  const input = { date, sourceRef: 'order:1', lines: [{ accountId: 1, debit: 100 }, { accountId: 2, credit: 100 }] };
  return { accounting, input, biz: { id: 1 }, state: () => state, fail: () => { failUpdate = true; } };
}

test('repeated concurrent source postings return one document and one set of lines', async () => {
  const h = harness();
  const docs = await Promise.all([h.accounting.postDocument(h.biz, h.input), h.accounting.postDocument(h.biz, h.input)]);
  assert.equal(docs[0].id, docs[1].id);
  assert.equal(h.state().accDocuments.length, 1); assert.equal(h.state().accLines.length, 2);
});
test('reversal is atomic and concurrent repeats cannot create a second reversal', async () => {
  const h = harness(); const doc = await h.accounting.postDocument(h.biz, h.input);
  const results = await Promise.allSettled([h.accounting.reverseDocument(h.biz, doc.id, 'tester'), h.accounting.reverseDocument(h.biz, doc.id, 'tester')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(h.state().accDocuments.length, 2); assert.equal(h.state().accDocuments[0].reversed, true);
  const reversalLines = h.state().accLines.filter((line) => line.documentId !== doc.id);
  assert.equal(reversalLines.find((line) => line.accountId === 1).credit, 100);
});
test('failure after inserting reversal rolls back both the new document and lines', async () => {
  const h = harness(); const doc = await h.accounting.postDocument(h.biz, h.input); h.fail();
  await assert.rejects(h.accounting.reverseDocument(h.biz, doc.id, 'tester'), /injected/);
  assert.equal(h.state().accDocuments.length, 1); assert.equal(h.state().accLines.length, 2);
  assert.equal(h.state().accDocuments[0].reversed, false);
});
test('inactive accounts reject new postings but remain reversible; other tenants cannot reverse', async () => {
  const h = harness(); const doc = await h.accounting.postDocument(h.biz, h.input);
  h.state().accAccounts[0].isActive = false;
  await assert.rejects(h.accounting.postDocument(h.biz, { ...h.input, sourceRef: 'order:2' }), /غیرفعال/);
  await assert.rejects(h.accounting.reverseDocument({ id: 2 }, doc.id, 'other'), /پیدا نشد/);
  await h.accounting.reverseDocument(h.biz, doc.id, 'tester');
  assert.equal(h.state().accDocuments.length, 2);
});
test('empty draft can be saved, but closed fiscal years and posted documents cannot be edited or deleted', async () => {
  const h = harness();
  const draft = await h.accounting.postDocument(h.biz, { ...h.input, status: 'draft' }, { enforce: false });
  await h.accounting.replaceDraftLines(h.biz, draft.id, { date: h.input.date, status: 'draft', lines: [] });
  assert.equal(h.state().accLines.length, 0);
  h.state().accFiscalYears[0].isClosed = true;
  await assert.rejects(h.accounting.deleteDraft(h.biz, draft.id), /بسته/);
  await assert.rejects(h.accounting.replaceDraftLines(h.biz, draft.id, { date: h.input.date, status: 'draft', lines: [] }), /بسته/);
  h.state().accFiscalYears[0].isClosed = false;
  h.state().accDocuments[0].status = 'posted';
  await assert.rejects(h.accounting.deleteDraft(h.biz, draft.id), /پیش‌نویس/);
  assert.equal(h.state().accDocuments.length, 1);
});
