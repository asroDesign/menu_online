BEGIN;

CREATE TABLE loyalty_wheel_settings (
  business_id integer PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  cooldown_hours integer NOT NULL DEFAULT 24 CHECK (cooldown_hours BETWEEN 1 AND 720),
  reward_expires_after_days integer NOT NULL DEFAULT 30 CHECK (reward_expires_after_days BETWEEN 1 AND 365),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE loyalty_wheel_prizes (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  prize_type text NOT NULL CHECK (prize_type IN ('fixed_amount', 'discount_code', 'free_items', 'no_prize', 'message')),
  amount integer NOT NULL DEFAULT 0 CHECK (amount BETWEEN 0 AND 500000000),
  discount_code_id integer REFERENCES discount_codes(id) ON DELETE RESTRICT,
  product_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(product_ids) = 'array'),
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 300),
  weight integer NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 10000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_wheel_prize_shape_ck CHECK (
    (prize_type = 'fixed_amount' AND amount > 0 AND discount_code_id IS NULL AND jsonb_array_length(product_ids) = 0 AND message = '') OR
    (prize_type = 'discount_code' AND amount = 0 AND discount_code_id IS NOT NULL AND jsonb_array_length(product_ids) = 0 AND message = '') OR
    (prize_type = 'free_items' AND amount = 0 AND discount_code_id IS NULL AND jsonb_array_length(product_ids) BETWEEN 1 AND 10 AND message = '') OR
    (prize_type = 'no_prize' AND amount = 0 AND discount_code_id IS NULL AND jsonb_array_length(product_ids) = 0 AND message = '') OR
    (prize_type = 'message' AND amount = 0 AND discount_code_id IS NULL AND jsonb_array_length(product_ids) = 0 AND char_length(message) BETWEEN 1 AND 300)
  )
);

CREATE INDEX loyalty_wheel_prizes_business_idx ON loyalty_wheel_prizes (business_id, is_active, id);

CREATE TABLE loyalty_wheel_spins (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  prize_id integer REFERENCES loyalty_wheel_prizes(id) ON DELETE SET NULL,
  request_key text NOT NULL CHECK (char_length(request_key) BETWEEN 16 AND 80),
  prize_type text NOT NULL CHECK (prize_type IN ('fixed_amount', 'discount_code', 'free_items', 'no_prize', 'message')),
  prize_title text NOT NULL CHECK (char_length(prize_title) BETWEEN 1 AND 80),
  reward_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reward_snapshot) = 'object'),
  status text NOT NULL CHECK (status IN ('active', 'redeemed', 'expired', 'no_prize', 'message')),
  expires_at timestamptz,
  consumed_order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_wheel_spins_status_shape_ck CHECK (
    (status = 'active' AND prize_type IN ('fixed_amount', 'discount_code', 'free_items') AND expires_at IS NOT NULL) OR
    (status = 'redeemed' AND prize_type IN ('fixed_amount', 'discount_code', 'free_items')) OR
    (status = 'expired' AND prize_type IN ('fixed_amount', 'discount_code', 'free_items')) OR
    (status = 'no_prize' AND prize_type = 'no_prize') OR
    (status = 'message' AND prize_type = 'message')
  )
);

CREATE UNIQUE INDEX loyalty_wheel_spins_request_uq ON loyalty_wheel_spins (business_id, customer_id, request_key);
CREATE UNIQUE INDEX loyalty_wheel_spins_one_active_customer_uq ON loyalty_wheel_spins (business_id, customer_id) WHERE status = 'active';
CREATE INDEX loyalty_wheel_spins_customer_time_idx ON loyalty_wheel_spins (business_id, customer_id, created_at DESC);

COMMIT;
