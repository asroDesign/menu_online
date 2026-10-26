BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS offline_terminals_id_business_uq
  ON offline_terminals(id, business_id);
CREATE TABLE IF NOT EXISTS offline_workspace_commands (
  id text PRIMARY KEY,
  terminal_id text NOT NULL REFERENCES offline_terminals(id) ON DELETE RESTRICT,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  actor_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  module text NOT NULL CHECK (module IN ('menu')),
  action text NOT NULL CHECK (action IN ('update_product','update_category')),
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('applied','conflict','rejected')),
  http_status integer NOT NULL CHECK (http_status IN (200,409,422)),
  receipt text NOT NULL DEFAULT '',
  error text NOT NULL DEFAULT '',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offline_workspace_command_terminal_business_fk
    FOREIGN KEY (terminal_id, business_id) REFERENCES offline_terminals(id, business_id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS offline_workspace_commands_terminal_time_idx
  ON offline_workspace_commands(terminal_id, created_at DESC);
COMMIT;
