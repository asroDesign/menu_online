-- Apply before deploying code that references these columns. Existing rows receive
-- empty/default metadata; balances and historical wallet entries are not rewritten.
BEGIN;
ALTER TABLE wallet_entries
  ADD COLUMN IF NOT EXISTS idempotency_key text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS wallet_entries_biz_idempotency_idx
  ON wallet_entries(business_id, idempotency_key)
  WHERE idempotency_key <> '';

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS settlement_error text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS settlement_attempts integer NOT NULL DEFAULT 0;
COMMIT;
