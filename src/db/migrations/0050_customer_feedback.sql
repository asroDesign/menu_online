BEGIN;

CREATE TABLE customer_feedback (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('suggestion', 'complaint')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 1500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_feedback_business_status_created_idx
  ON customer_feedback (business_id, status, created_at DESC);
CREATE INDEX customer_feedback_customer_created_idx
  ON customer_feedback (business_id, customer_id, created_at DESC);

COMMIT;
