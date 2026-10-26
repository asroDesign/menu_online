BEGIN;
CREATE TABLE IF NOT EXISTS offline_terminals (
 id text PRIMARY KEY, business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 name text NOT NULL, token_hash text NOT NULL UNIQUE, created_by integer NOT NULL REFERENCES users(id),
 revoked_at timestamptz, last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS offline_catalogs (
 id text PRIMARY KEY, terminal_id text NOT NULL REFERENCES offline_terminals(id), payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS offline_sales (
 id text PRIMARY KEY, terminal_id text NOT NULL REFERENCES offline_terminals(id),
 business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 payload_hash text NOT NULL, payload jsonb NOT NULL, order_id integer REFERENCES orders(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offline_sales_business_idx ON offline_sales(business_id, created_at);
COMMIT;
