BEGIN;
CREATE TABLE IF NOT EXISTS trial_grants (
  id serial PRIMARY KEY,
  business_id integer NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('premium', 'premium_plus')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  feature_set_version text NOT NULL,
  feature_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted', 'revoked')),
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS trial_grants_status_end_idx ON trial_grants (status, ends_at);
COMMIT;
