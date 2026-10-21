-- Roll back only after deploying the previous application version. This removes
-- idempotency and settlement-diagnostic metadata, but preserves wallet balances/entries.
BEGIN;
DROP INDEX IF EXISTS wallet_entries_biz_idempotency_idx;
ALTER TABLE wallet_entries DROP COLUMN IF EXISTS idempotency_key;
ALTER TABLE payments
  DROP COLUMN IF EXISTS settlement_error,
  DROP COLUMN IF EXISTS settlement_attempts;
COMMIT;
