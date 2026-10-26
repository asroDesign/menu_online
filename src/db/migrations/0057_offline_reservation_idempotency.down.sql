BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM reservations WHERE source_command_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Resolve offline reservation retries before removing idempotency columns';
  END IF;
END;
$$;
DROP INDEX IF EXISTS reservations_source_command_uq;
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_source_command_pair_check;
ALTER TABLE reservations DROP COLUMN IF EXISTS source_command_hash;
ALTER TABLE reservations DROP COLUMN IF EXISTS source_command_id;
COMMIT;
