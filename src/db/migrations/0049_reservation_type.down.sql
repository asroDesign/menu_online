BEGIN;

ALTER TABLE reservations
  DROP COLUMN reservation_type;

COMMIT;
