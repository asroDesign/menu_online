BEGIN;

CREATE TABLE customer_reward_campaigns (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  token text NOT NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('discount_percent', 'free_item')),
  discount_percent integer NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  product_id integer,
  product_name text NOT NULL DEFAULT '',
  expires_after_days integer NOT NULL DEFAULT 7 CHECK (expires_after_days BETWEEN 1 AND 365),
  max_claims integer NOT NULL DEFAULT 0 CHECK (max_claims BETWEEN 0 AND 1000000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_reward_campaigns_business_token_uq UNIQUE (business_id, token),
  CONSTRAINT customer_reward_campaigns_reward_shape_ck CHECK (
    (reward_type = 'discount_percent' AND discount_percent BETWEEN 1 AND 100 AND product_id IS NULL)
    OR (reward_type = 'free_item' AND discount_percent = 0 AND product_id IS NOT NULL)
  )
);

CREATE INDEX customer_reward_campaigns_business_created_idx
  ON customer_reward_campaigns (business_id, created_at DESC);

CREATE TABLE customer_reward_claims (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  campaign_id integer NOT NULL REFERENCES customer_reward_campaigns(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reward_type text NOT NULL CHECK (reward_type IN ('discount_percent', 'free_item')),
  discount_percent integer NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  product_id integer,
  product_name text NOT NULL DEFAULT '',
  campaign_name text NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired')),
  consumed_order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_reward_claims_campaign_customer_uq UNIQUE (business_id, campaign_id, customer_id),
  CONSTRAINT customer_reward_claims_reward_shape_ck CHECK (
    (reward_type = 'discount_percent' AND discount_percent BETWEEN 1 AND 100 AND product_id IS NULL)
    OR (reward_type = 'free_item' AND discount_percent = 0 AND product_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX customer_reward_claims_one_active_customer_uq
  ON customer_reward_claims (business_id, customer_id) WHERE status = 'active';
CREATE INDEX customer_reward_claims_customer_status_idx
  ON customer_reward_claims (business_id, customer_id, status, expires_at);

COMMIT;
