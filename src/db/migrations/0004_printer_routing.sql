ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS printer_category_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE print_jobs
  ADD COLUMN IF NOT EXISTS detail text NOT NULL DEFAULT '';
