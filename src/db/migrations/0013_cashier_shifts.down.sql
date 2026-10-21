-- Removing this migration discards shift history and detaches associated sale transactions.
BEGIN;
DROP INDEX IF EXISTS transactions_shift_idx;
ALTER TABLE transactions DROP COLUMN IF EXISTS shift_id;
DROP INDEX IF EXISTS cash_shifts_business_open_idx;
DROP INDEX IF EXISTS cash_shifts_business_opened_idx;
DROP TABLE IF EXISTS cash_shifts;
COMMIT;
