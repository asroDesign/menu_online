BEGIN;

ALTER TABLE transactions
  ADD COLUMN settlement_method text,
  ADD COLUMN source_ref text;
CREATE UNIQUE INDEX transactions_biz_source_ref_uq
  ON transactions (business_id, source_ref) WHERE source_ref IS NOT NULL;

CREATE TABLE receivable_accounts (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'person' CHECK (type IN ('person', 'company')),
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  phone text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receivable_accounts_business_idx ON receivable_accounts (business_id, is_active, name);
CREATE UNIQUE INDEX receivable_accounts_customer_uq ON receivable_accounts (business_id, customer_id) WHERE customer_id IS NOT NULL;

CREATE TABLE receivables (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id integer NOT NULL REFERENCES receivable_accounts(id) ON DELETE RESTRICT,
  order_id integer REFERENCES orders(id) ON DELETE RESTRICT,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'order')),
  amount bigint NOT NULL CHECK (amount > 0),
  due_at timestamptz,
  description text NOT NULL DEFAULT '',
  accounting_document_id integer REFERENCES acc_documents(id) ON DELETE RESTRICT,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source = 'order' AND order_id IS NOT NULL) OR (source = 'manual' AND order_id IS NULL))
);
CREATE INDEX receivables_business_created_idx ON receivables (business_id, created_at DESC);
CREATE INDEX receivables_account_idx ON receivables (business_id, account_id, created_at DESC);
CREATE UNIQUE INDEX receivables_business_order_uq ON receivables (business_id, order_id) WHERE order_id IS NOT NULL;

CREATE TABLE receivable_payments (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  receivable_id integer NOT NULL REFERENCES receivables(id) ON DELETE RESTRICT,
  amount bigint NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash', 'bank', 'pos', 'transfer')),
  bank_account_id integer REFERENCES bank_accounts(id) ON DELETE SET NULL,
  shift_id integer REFERENCES cash_shifts(id) ON DELETE SET NULL,
  accounting_document_id integer REFERENCES acc_documents(id) ON DELETE RESTRICT,
  transaction_id integer REFERENCES transactions(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, idempotency_key)
);
CREATE INDEX receivable_payments_ledger_idx ON receivable_payments (business_id, receivable_id, created_at);

CREATE TABLE receivable_payment_reversals (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  payment_id integer NOT NULL REFERENCES receivable_payments(id) ON DELETE RESTRICT,
  amount bigint NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash', 'bank', 'pos', 'transfer')),
  bank_account_id integer REFERENCES bank_accounts(id) ON DELETE SET NULL,
  shift_id integer REFERENCES cash_shifts(id) ON DELETE SET NULL,
  accounting_document_id integer REFERENCES acc_documents(id) ON DELETE RESTRICT,
  transaction_id integer REFERENCES transactions(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  reason text NOT NULL,
  actor_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, idempotency_key)
);
CREATE INDEX receivable_reversals_payment_idx ON receivable_payment_reversals (business_id, payment_id, created_at);

CREATE TABLE receivable_events (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  receivable_id integer NOT NULL REFERENCES receivables(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('created', 'payment', 'payment_reversed')),
  amount bigint NOT NULL DEFAULT 0 CHECK (amount >= 0),
  note text NOT NULL DEFAULT '',
  actor_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receivable_events_ledger_idx ON receivable_events (business_id, receivable_id, created_at);

COMMIT;
