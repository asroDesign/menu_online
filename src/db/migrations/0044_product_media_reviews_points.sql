BEGIN;

ALTER TABLE products
  ADD COLUMN video_url text NOT NULL DEFAULT '';

CREATE TABLE product_reviews (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  moderated_by integer REFERENCES users(id) ON DELETE SET NULL,
  moderated_at timestamptz,
  awarded_points integer NOT NULL DEFAULT 0 CHECK (awarded_points >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_reviews_business_product_customer_uq UNIQUE (business_id, product_id, customer_id)
);

CREATE INDEX product_reviews_business_status_created_idx
  ON product_reviews (business_id, status, created_at DESC);
CREATE INDEX product_reviews_product_status_created_idx
  ON product_reviews (business_id, product_id, status, created_at DESC);

CREATE TABLE customer_point_entries (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  review_id integer REFERENCES product_reviews(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('opening', 'purchase', 'referral', 'review', 'redeem', 'adjustment')),
  amount integer NOT NULL CHECK (amount <> 0),
  idempotency_key text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_point_entries_business_idempotency_uq UNIQUE (business_id, idempotency_key)
);

CREATE INDEX customer_point_entries_customer_created_idx
  ON customer_point_entries (business_id, customer_id, created_at DESC);

INSERT INTO customer_point_entries (business_id, customer_id, kind, amount, idempotency_key, note)
SELECT business_id, id, 'opening', points, 'opening:' || id::text, 'موجودی امتیاز پیش از دفتر امتیاز'
FROM customers
WHERE points > 0;

COMMIT;
