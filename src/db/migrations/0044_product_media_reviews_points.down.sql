BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM product_reviews) THEN
    RAISE EXCEPTION 'Refusing to drop submitted product reviews; archive review content before rollback.';
  END IF;
  IF EXISTS (SELECT 1 FROM customer_point_entries WHERE kind <> 'opening') THEN
    RAISE EXCEPTION 'Refusing to drop customer point history; reverse non-opening point entries before rollback.';
  END IF;
END $$;

DROP TABLE customer_point_entries;
DROP TABLE product_reviews;
ALTER TABLE products DROP COLUMN video_url;

COMMIT;
