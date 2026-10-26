BEGIN;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS source_command_id text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS source_command_hash text;
ALTER TABLE reservations ADD CONSTRAINT reservations_source_command_pair_check
  CHECK (
    (source_command_id IS NULL AND source_command_hash IS NULL)
    OR (
      source_command_id IS NOT NULL
      AND source_command_hash IS NOT NULL
      AND
      source_command_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND source_command_hash ~* '^[0-9a-f]{64}$'
    )
  );
CREATE UNIQUE INDEX IF NOT EXISTS reservations_source_command_uq
  ON reservations(business_id, source_command_id);
COMMIT;
