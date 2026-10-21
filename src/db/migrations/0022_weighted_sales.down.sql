ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_line_total_nonnegative_check;
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_yield_ratio_check;
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_tare_nonnegative_check;
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_weight_positive_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_yield_ratio_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_selling_mode_check;

-- This rollback removes weighted-sale snapshots. Take a database backup before applying it
-- and do not roll back after weighted orders have been accepted.
ALTER TABLE order_items
  DROP COLUMN IF EXISTS line_total,
  DROP COLUMN IF EXISTS yield_ratio_snapshot,
  DROP COLUMN IF EXISTS tare_grams,
  DROP COLUMN IF EXISTS weight_grams;
ALTER TABLE products
  DROP COLUMN IF EXISTS yield_ratio,
  DROP COLUMN IF EXISTS selling_mode;
