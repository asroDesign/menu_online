BEGIN;

ALTER TABLE recipes
  ADD COLUMN waste_percent double precision NOT NULL DEFAULT 0
  CHECK (waste_percent >= 0 AND waste_percent <= 99.9);

COMMIT;
