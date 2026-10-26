BEGIN;
CREATE TABLE IF NOT EXISTS offline_workspace_snapshots (
  id text PRIMARY KEY,
  terminal_id text NOT NULL REFERENCES offline_terminals(id) ON DELETE CASCADE,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  dataset text NOT NULL CHECK (dataset IN ('menu')),
  revision integer NOT NULL CHECK (revision > 0),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  issued_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offline_workspace_terminal_dataset_revision_uq UNIQUE (terminal_id, dataset, revision)
);
COMMIT;
