ALTER TABLE products
  ADD COLUMN IF NOT EXISTS selling_mode text NOT NULL DEFAULT 'count',
  ADD COLUMN IF NOT EXISTS yield_ratio double precision NOT NULL DEFAULT 1;

ALTER TABLE products
  ADD CONSTRAINT products_selling_mode_check CHECK (selling_mode IN ('count', 'weight')),
  ADD CONSTRAINT products_yield_ratio_check CHECK (yield_ratio > 0 AND yield_ratio <= 1);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS weight_grams integer,
  ADD COLUMN IF NOT EXISTS tare_grams integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yield_ratio_snapshot double precision NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS line_total integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM order_items WHERE price::bigint * quantity > 2147483647) THEN
    RAISE EXCEPTION 'Cannot backfill weighted-sales line totals: legacy order item exceeds the integer amount limit';
  END IF;
END $$;

UPDATE order_items SET line_total = (price::bigint * quantity)::integer WHERE line_total = 0;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_weight_positive_check CHECK (weight_grams IS NULL OR weight_grams > 0),
  ADD CONSTRAINT order_items_tare_nonnegative_check CHECK (tare_grams >= 0),
  ADD CONSTRAINT order_items_yield_ratio_check CHECK (yield_ratio_snapshot > 0 AND yield_ratio_snapshot <= 1),
  ADD CONSTRAINT order_items_line_total_nonnegative_check CHECK (line_total >= 0);
