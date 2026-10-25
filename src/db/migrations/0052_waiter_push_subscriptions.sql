BEGIN;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_business_user_idx
  ON push_subscriptions (business_id, user_id);

COMMIT;
