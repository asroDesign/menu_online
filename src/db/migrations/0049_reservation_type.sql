BEGIN;

ALTER TABLE reservations
  ADD COLUMN reservation_type text NOT NULL DEFAULT 'normal';

COMMIT;
