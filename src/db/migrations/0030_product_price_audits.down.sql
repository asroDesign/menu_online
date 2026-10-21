BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM product_price_audits) THEN
    RAISE EXCEPTION 'Refusing to drop price-change audit history.';
  END IF;
END $$;

DROP TABLE product_price_audits;

COMMIT;
