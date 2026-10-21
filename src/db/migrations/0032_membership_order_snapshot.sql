BEGIN;

ALTER TABLE orders
  ADD COLUMN membership_discount integer NOT NULL DEFAULT 0 CHECK (membership_discount >= 0),
  ADD COLUMN membership_snapshot jsonb,
  ADD COLUMN membership_applied_by integer REFERENCES users(id) ON DELETE SET NULL;

COMMIT;
