-- Drop only after deploying the previous application version; previously-issued links stop working.
BEGIN;
DROP INDEX IF EXISTS orders_tracking_token_hash_idx;
ALTER TABLE orders DROP COLUMN IF EXISTS tracking_token_hash;
COMMIT;
