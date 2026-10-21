BEGIN;

-- Repair cheque tables created before the updated_at field was present.
ALTER TABLE cheques
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMIT;
