// Uses only MENUPEAK_TEST_DATABASE_URL and an isolated scratch schema; never DATABASE_URL.
// Set the URL only for a disposable database whose name includes "test".
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');

const connectionString = process.env.MENUPEAK_TEST_DATABASE_URL;
let pool;
let schema;
let enabled = Boolean(connectionString);

before(async () => {
  if (!enabled) return;
  const dbName = decodeURIComponent(new URL(connectionString).pathname.slice(1));
  if (!/test/i.test(dbName)) throw new Error('MENUPEAK_TEST_DATABASE_URL must point to a database with "test" in its name');
  pool = new Pool({ connectionString, max: 6 });
  schema = `codex_security_${randomBytes(6).toString('hex')}`;
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query('CREATE TABLE customers (id integer PRIMARY KEY, business_id integer NOT NULL, wallet_balance integer NOT NULL)');
    await client.query('CREATE TABLE wallet_entries (id bigserial PRIMARY KEY, business_id integer NOT NULL, customer_id integer NOT NULL, amount integer NOT NULL, kind text NOT NULL, idempotency_key text NOT NULL, UNIQUE (business_id, idempotency_key))');
    await client.query('CREATE TABLE orders (id bigserial PRIMARY KEY, business_id integer NOT NULL, number integer NOT NULL, payment_status text NOT NULL DEFAULT \'unpaid\', status text NOT NULL DEFAULT \'awaiting_payment\', customer_id integer, cashback_used integer NOT NULL DEFAULT 0, UNIQUE (business_id, number))');
    await client.query('CREATE TABLE order_items (order_id bigint NOT NULL, product_id integer NOT NULL, quantity integer NOT NULL CHECK (quantity > 0))');
    await client.query('CREATE TABLE effects (order_id bigint NOT NULL, kind text NOT NULL, UNIQUE(order_id, kind))');
    await client.query('CREATE TABLE receivables (id bigserial PRIMARY KEY, business_id integer NOT NULL, amount bigint NOT NULL CHECK (amount > 0))');
    await client.query('CREATE TABLE receivable_payments (id bigserial PRIMARY KEY, business_id integer NOT NULL, receivable_id bigint NOT NULL REFERENCES receivables(id), amount bigint NOT NULL CHECK (amount > 0), idempotency_key text NOT NULL, UNIQUE (business_id, idempotency_key))');
    await client.query('CREATE TABLE receivable_payment_reversals (id bigserial PRIMARY KEY, business_id integer NOT NULL, payment_id bigint NOT NULL REFERENCES receivable_payments(id), amount bigint NOT NULL CHECK (amount > 0), idempotency_key text NOT NULL, UNIQUE (business_id, idempotency_key))');
    await client.query('CREATE TABLE receivable_effects (payment_id bigint NOT NULL, kind text NOT NULL, UNIQUE (payment_id, kind))');
    await client.query("CREATE TABLE restaurant_tables (id bigserial PRIMARY KEY, business_id integer NOT NULL, operational_status text NOT NULL CHECK (operational_status IN ('available','cleaning','out_of_service'))) ");
    await client.query('CREATE TABLE table_orders (id bigserial PRIMARY KEY, business_id integer NOT NULL, table_id bigint NOT NULL, status text NOT NULL, payment_status text NOT NULL, deleted boolean NOT NULL DEFAULT false)');
    await client.query('CREATE TABLE table_reservations (id bigserial PRIMARY KEY, business_id integer NOT NULL, table_id bigint NOT NULL, starts_at timestamptz NOT NULL, duration_minutes integer NOT NULL, status text NOT NULL)');
    await client.query('INSERT INTO customers VALUES (1, 11, 100), (2, 22, 100), (3, 11, 40)');
  } finally { client.release(); }
});

after(async () => {
  if (!pool) return;
  const client = await pool.connect();
  try { await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
  finally { client.release(); await pool.end(); }
});

test('concurrent wallet spends cannot exceed balance, tenant filters hold, and retries do not double-apply', { skip: !enabled }, async () => {
  async function spend(key, amount, businessId = 11, customerId = 1) {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${schema}`);
      await client.query('BEGIN');
      const inserted = await client.query('INSERT INTO wallet_entries (business_id, customer_id, amount, kind, idempotency_key) VALUES ($1, $2, $3, \'spend\', $4) ON CONFLICT DO NOTHING RETURNING id', [businessId, customerId, -amount, key]);
      if (!inserted.rowCount) { await client.query('COMMIT'); return false; }
      const changed = await client.query('UPDATE customers SET wallet_balance = wallet_balance - $1 WHERE id = $2 AND business_id = $3 AND wallet_balance >= $1 RETURNING wallet_balance', [amount, customerId, businessId]);
      if (!changed.rowCount) { await client.query('ROLLBACK'); return false; }
      await client.query('COMMIT');
      return true;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
  const outcomes = await Promise.all([spend('order:1:initial', 80), spend('order:2:initial', 80)]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  const retry = await spend('order:1:initial', 80);
  assert.equal(retry, false);
  assert.equal(await spend('tenant-mismatch-key', 10, 11, 2), false);
  const { rows: [wallet] } = await pool.query(`SELECT wallet_balance FROM ${schema}.customers WHERE id = 1`);
  const { rows: [otherTenant] } = await pool.query(`SELECT wallet_balance FROM ${schema}.customers WHERE id = 2`);
  const { rows: [ledger] } = await pool.query(`SELECT count(*)::int AS n FROM ${schema}.wallet_entries`);
  assert.equal(wallet.wallet_balance, 20);
  assert.equal(otherTenant.wallet_balance, 100);
  assert.equal(ledger.n, 1);
});

test('cancel and repeated refund restore only the outstanding order spend once', { skip: !enabled }, async () => {
  const { rows: [order] } = await pool.query(`INSERT INTO ${schema}.orders (business_id, number, customer_id, cashback_used) VALUES (11, 2500, 3, 60) RETURNING id`);
  await pool.query(`INSERT INTO ${schema}.wallet_entries (business_id, customer_id, amount, kind, idempotency_key) VALUES (11, 3, -60, 'spend', $1)`, [`order:${order.id}:spend:initial`]);
  async function cancelAndRefund() {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${schema}`);
      await client.query('BEGIN');
      const { rows: [current] } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [order.id]);
      if (current.status === 'awaiting_payment' && current.payment_status !== 'paid')
        await client.query("UPDATE orders SET status = 'canceled' WHERE id = $1", [order.id]);
      if (current.customer_id && current.cashback_used > 0) {
        const { rows: [totals] } = await client.query("SELECT coalesce(sum(-amount) FILTER (WHERE kind = 'spend'), 0)::int AS spent, coalesce(sum(amount) FILTER (WHERE kind = 'refund'), 0)::int AS refunded FROM wallet_entries WHERE business_id = $1 AND customer_id = $2 AND idempotency_key LIKE $3", [11, current.customer_id, `order:${order.id}:%`]);
        const amount = Math.min(current.cashback_used, Math.max(0, totals.spent - totals.refunded));
        if (amount > 0) {
          const refund = await client.query("INSERT INTO wallet_entries (business_id, customer_id, amount, kind, idempotency_key) VALUES (11, $1, $2, 'refund', $3) ON CONFLICT DO NOTHING RETURNING id", [current.customer_id, amount, `order:${order.id}:refund:1`]);
          if (refund.rowCount) await client.query('UPDATE customers SET wallet_balance = wallet_balance + $1 WHERE id = $2 AND business_id = 11', [amount, current.customer_id]);
        }
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
  await cancelAndRefund();
  await cancelAndRefund();
  const { rows: [wallet] } = await pool.query(`SELECT wallet_balance FROM ${schema}.customers WHERE id = 3`);
  const { rows: [refunds] } = await pool.query(`SELECT count(*)::int AS n FROM ${schema}.wallet_entries WHERE business_id = 11 AND customer_id = 3 AND kind = 'refund' AND idempotency_key LIKE $1`, [`order:${order.id}:%`]);
  assert.equal(wallet.wallet_balance, 100);
  assert.equal(refunds.n, 1);
});

test('concurrent orders receive distinct numbers and a failed item insert leaves no partial order', { skip: !enabled }, async () => {
  async function create(productId) {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${schema}`);
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [1100777]);
      const { rows: [row] } = await client.query('SELECT coalesce(max(number), 1000) + 1 AS number FROM orders WHERE business_id = 11');
      const { rows: [order] } = await client.query('INSERT INTO orders (business_id, number) VALUES (11, $1) RETURNING id', [row.number]);
      await client.query('INSERT INTO order_items VALUES ($1, $2, 1)', [order.id, productId]);
      await client.query('COMMIT');
      return row.number;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
  const numbers = await Promise.all([create(1), create(2)]);
  assert.equal(new Set(numbers).size, 2);
  const client = await pool.connect();
  let failedOrderId;
  try {
    await client.query(`SET search_path TO ${schema}`);
    await client.query('BEGIN');
    const { rows: [order] } = await client.query('INSERT INTO orders (business_id, number) VALUES (11, 2000) RETURNING id');
    failedOrderId = order.id;
    await assert.rejects(client.query('INSERT INTO order_items VALUES ($1, 9, 0)', [order.id]));
    await client.query('ROLLBACK');
  } finally { client.release(); }
  const { rows: [partial] } = await pool.query(`SELECT count(*)::int AS n FROM ${schema}.orders WHERE id = $1`, [failedOrderId]);
  assert.equal(partial.n, 0);
});

test('settlement rollback is retryable and duplicate settlement adds no second effect', { skip: !enabled }, async () => {
  const { rows: [order] } = await pool.query(`INSERT INTO ${schema}.orders (business_id, number) VALUES (11, 3000) RETURNING id`);
  async function settle(failMidway = false) {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${schema}`);
      await client.query('BEGIN');
      const { rows: [current] } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [order.id]);
      if (current.payment_status === 'paid') { await client.query('COMMIT'); return false; }
      await client.query("UPDATE orders SET payment_status = 'paid' WHERE id = $1", [order.id]);
      await client.query("INSERT INTO effects VALUES ($1, 'income'), ($1, 'wallet'), ($1, 'stock'), ($1, 'accounting'), ($1, 'print')", [order.id]);
      if (failMidway) throw new Error('injected failure');
      await client.query('COMMIT');
      return true;
    } catch (e) { await client.query('ROLLBACK'); if (e.message === 'injected failure') return false; throw e; }
    finally { client.release(); }
  }
  assert.equal(await settle(true), false);
  const { rows: [rolledBack] } = await pool.query(`SELECT payment_status FROM ${schema}.orders WHERE id = $1`, [order.id]);
  assert.equal(rolledBack.payment_status, 'unpaid');
  assert.equal(await settle(false), true);
  assert.equal(await settle(false), false);
  const { rows: [effectCount] } = await pool.query(`SELECT count(*)::int AS n FROM ${schema}.effects WHERE order_id = $1`, [order.id]);
  assert.equal(effectCount.n, 5);
});

test('concurrent receivable collections cannot exceed balance; retries and mid-transaction failure are safe', { skip: !enabled }, async () => {
  const { rows: [debt] } = await pool.query(`INSERT INTO ${schema}.receivables (business_id, amount) VALUES (11, 100) RETURNING id`);
  const { rows: [retryDebt] } = await pool.query(`INSERT INTO ${schema}.receivables (business_id, amount) VALUES (11, 50) RETURNING id`);
  async function collect(receivableId, key, amount, failMidway = false) {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${schema}`);
      await client.query('BEGIN');
      const { rows: [locked] } = await client.query('SELECT * FROM receivables WHERE id = $1 AND business_id = 11 FOR UPDATE', [receivableId]);
      const { rows: [existing] } = await client.query('SELECT id FROM receivable_payments WHERE business_id = 11 AND idempotency_key = $1', [key]);
      if (existing) { await client.query('COMMIT'); return 'duplicate'; }
      const { rows: [sum] } = await client.query('SELECT coalesce(sum(amount), 0)::bigint AS total FROM receivable_payments WHERE business_id = 11 AND receivable_id = $1', [receivableId]);
      if (amount > Number(locked.amount) - Number(sum.total)) { await client.query('ROLLBACK'); return 'excess'; }
      const { rows: [payment] } = await client.query('INSERT INTO receivable_payments (business_id, receivable_id, amount, idempotency_key) VALUES (11, $1, $2, $3) RETURNING id', [receivableId, amount, key]);
      await client.query("INSERT INTO receivable_effects VALUES ($1, 'accounting'), ($1, 'cash')", [payment.id]);
      if (failMidway) throw new Error('injected failure');
      await client.query('COMMIT');
      return 'created';
    } catch (e) { await client.query('ROLLBACK'); if (e.message === 'injected failure') return 'rolled_back'; throw e; }
    finally { client.release(); }
  }
  const parallel = await Promise.all([collect(debt.id, 'receipt-a-00000001', 70), collect(debt.id, 'receipt-b-00000002', 70)]);
  assert.equal(parallel.filter((result) => result === 'created').length, 1);
  assert.equal(parallel.filter((result) => result === 'excess').length, 1);
  const winner = parallel[0] === 'created' ? 'receipt-a-00000001' : 'receipt-b-00000002';
  assert.equal(await collect(debt.id, winner, 70), 'duplicate');
  const { rows: [balance] } = await pool.query(`SELECT sum(amount)::int AS total FROM ${schema}.receivable_payments WHERE receivable_id = $1`, [debt.id]);
  assert.equal(balance.total, 70);

  assert.equal(await collect(retryDebt.id, 'receipt-fail-00000003', 50, true), 'rolled_back');
  const { rows: [empty] } = await pool.query(`SELECT count(*)::int AS n FROM ${schema}.receivable_payments WHERE receivable_id = $1`, [retryDebt.id]);
  assert.equal(empty.n, 0);
  assert.equal(await collect(retryDebt.id, 'receipt-fail-00000003', 50), 'created');
  const { rows: [effects] } = await pool.query(`SELECT count(*)::int AS n FROM ${schema}.receivable_effects e JOIN ${schema}.receivable_payments p ON p.id = e.payment_id WHERE p.receivable_id = $1`, [retryDebt.id]);
  assert.equal(effects.n, 2);
});

test('partial receipt reversals are append-only, bounded by original receipt and idempotent', { skip: !enabled }, async () => {
  const { rows: [debt] } = await pool.query(`INSERT INTO ${schema}.receivables (business_id, amount) VALUES (11, 100) RETURNING id`);
  const { rows: [receipt] } = await pool.query(`INSERT INTO ${schema}.receivable_payments (business_id, receivable_id, amount, idempotency_key) VALUES (11, $1, 70, 'original-receipt-000001') RETURNING id`, [debt.id]);
  async function reverse(key, amount) {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${schema}`); await client.query('BEGIN');
      await client.query('SELECT id FROM receivables WHERE id = $1 AND business_id = 11 FOR UPDATE', [debt.id]);
      await client.query('SELECT id FROM receivable_payments WHERE id = $1 AND business_id = 11 FOR UPDATE', [receipt.id]);
      const { rows: [prior] } = await client.query('SELECT coalesce(sum(amount), 0)::int AS total FROM receivable_payment_reversals WHERE business_id = 11 AND payment_id = $1', [receipt.id]);
      const { rows: [existing] } = await client.query('SELECT id FROM receivable_payment_reversals WHERE business_id = 11 AND idempotency_key = $1', [key]);
      if (existing) { await client.query('COMMIT'); return 'duplicate'; }
      if (amount > 70 - prior.total) { await client.query('ROLLBACK'); return 'excess'; }
      await client.query('INSERT INTO receivable_payment_reversals (business_id, payment_id, amount, idempotency_key) VALUES (11, $1, $2, $3)', [receipt.id, amount, key]);
      await client.query('COMMIT'); return 'created';
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
  assert.equal(await reverse('reversal-key-00000001', 40), 'created');
  assert.equal(await reverse('reversal-key-00000001', 40), 'duplicate');
  assert.equal(await reverse('reversal-key-00000002', 31), 'excess');
  assert.equal(await reverse('reversal-key-00000002', 30), 'created');
  const { rows: [totals] } = await pool.query(`SELECT (SELECT sum(amount) FROM ${schema}.receivable_payments WHERE receivable_id = $1) - (SELECT sum(r.amount) FROM ${schema}.receivable_payment_reversals r JOIN ${schema}.receivable_payments p ON p.id = r.payment_id WHERE p.receivable_id = $1) AS collected`, [debt.id]);
  assert.equal(Number(totals.collected), 0);
});

test('table order creation and maintenance transition serialize; reservations and tenant boundaries are enforced', { skip: !enabled }, async () => {
  const { rows: [table] } = await pool.query(`INSERT INTO ${schema}.restaurant_tables (business_id, operational_status) VALUES (11, 'available') RETURNING id`);
  async function openOrder() {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${schema}`); await client.query('BEGIN');
      const { rows: [current] } = await client.query('SELECT * FROM restaurant_tables WHERE id = $1 AND business_id = 11 FOR UPDATE', [table.id]);
      if (!current || current.operational_status !== 'available') { await client.query('ROLLBACK'); return false; }
      await client.query("INSERT INTO table_orders (business_id, table_id, status, payment_status) VALUES (11, $1, 'pending', 'unpaid')", [table.id]);
      await client.query('COMMIT'); return true;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
  async function setCleaning(businessId = 11) {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${schema}`); await client.query('BEGIN');
      const { rows: [current] } = await client.query('SELECT * FROM restaurant_tables WHERE id = $1 AND business_id = $2 FOR UPDATE', [table.id, businessId]);
      if (!current || current.operational_status !== 'available') { await client.query('ROLLBACK'); return false; }
      const { rowCount: ordersCount } = await client.query("SELECT id FROM table_orders WHERE business_id = $1 AND table_id = $2 AND payment_status <> 'paid' AND status <> 'canceled' AND deleted = false", [businessId, table.id]);
      const { rowCount: reservationsCount } = await client.query("SELECT id FROM table_reservations WHERE business_id = $1 AND table_id = $2 AND status IN ('requested','confirmed') AND starts_at + duration_minutes * interval '1 minute' > now()", [businessId, table.id]);
      if (ordersCount || reservationsCount) { await client.query('ROLLBACK'); return false; }
      await client.query("UPDATE restaurant_tables SET operational_status = 'cleaning' WHERE id = $1 AND business_id = $2", [table.id, businessId]);
      await client.query('COMMIT'); return true;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
  const outcomes = await Promise.all([openOrder(), setCleaning()]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal(await setCleaning(22), false);
  await pool.query(`INSERT INTO ${schema}.restaurant_tables (business_id, operational_status) VALUES (11, 'available')`);
  const { rows: [reservedTable] } = await pool.query(`SELECT id FROM ${schema}.restaurant_tables WHERE business_id = 11 AND operational_status = 'available' ORDER BY id DESC LIMIT 1`);
  await pool.query(`INSERT INTO ${schema}.table_reservations (business_id, table_id, starts_at, duration_minutes, status) VALUES (11, $1, now() + interval '1 hour', 90, 'confirmed')`, [reservedTable.id]);
  const { rows: [activeReservation] } = await pool.query(`SELECT id FROM ${schema}.table_reservations WHERE table_id = $1 AND status IN ('requested','confirmed') AND starts_at + duration_minutes * interval '1 minute' > now()`, [reservedTable.id]);
  assert.ok(activeReservation);
});
