BEGIN;

ALTER TABLE recipes DROP COLUMN waste_percent;

COMMIT;
