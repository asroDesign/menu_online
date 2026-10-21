-- Cash reconciliation is tied to sale transactions; historical sales stay outside shifts.
BEGIN;
CREATE TABLE IF NOT EXISTS cash_shifts (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  opened_by integer NOT NULL REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_cash integer NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  closed_by integer REFERENCES users(id),
  closed_at timestamptz,
  closing_cash integer CHECK (closing_cash IS NULL OR closing_cash >= 0),
  expected_cash integer,
  cash_difference integer,
  note text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cash_shifts_business_opened_idx ON cash_shifts (business_id, opened_at);
CREATE UNIQUE INDEX IF NOT EXISTS cash_shifts_business_open_idx ON cash_shifts (business_id) WHERE closed_at IS NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shift_id integer REFERENCES cash_shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS transactions_shift_idx ON transactions (shift_id) WHERE shift_id IS NOT NULL;
COMMIT;
