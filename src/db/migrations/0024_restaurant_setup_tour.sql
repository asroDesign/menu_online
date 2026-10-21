-- Existing businesses are not interrupted by the first-login setup tour.
-- New businesses keep NULL until they finish or dismiss it.
ALTER TABLE businesses
  ADD COLUMN setup_tour_completed_at timestamptz;

UPDATE businesses
SET setup_tour_completed_at = now()
WHERE setup_tour_completed_at IS NULL;
