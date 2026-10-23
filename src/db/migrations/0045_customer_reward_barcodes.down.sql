BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM customer_reward_claims) OR EXISTS (SELECT 1 FROM customer_reward_campaigns) THEN
    RAISE EXCEPTION 'Cannot roll back customer reward barcodes while campaigns or customer claims exist';
  END IF;
END $$;

DROP TABLE customer_reward_claims;
DROP TABLE customer_reward_campaigns;

COMMIT;
