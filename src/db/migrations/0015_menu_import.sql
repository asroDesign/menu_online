BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS products_business_external_idx
  ON products (business_id, external_id);

CREATE TABLE IF NOT EXISTS menu_import_jobs (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  request_key text NOT NULL,
  source_hash text NOT NULL,
  snapshot_hash text NOT NULL,
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'committed')),
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  result jsonb,
  created_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  CONSTRAINT menu_import_jobs_business_request_uq UNIQUE (business_id, request_key)
);
CREATE INDEX IF NOT EXISTS menu_import_jobs_business_created_idx
  ON menu_import_jobs (business_id, created_at DESC);

COMMIT;
