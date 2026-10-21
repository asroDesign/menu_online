-- Run after deploying the previous application version. Option and tag metadata is discarded;
-- base product data, order items, and historical unit prices remain intact.
BEGIN;
ALTER TABLE order_items DROP COLUMN IF EXISTS option_snapshot;
ALTER TABLE products
  DROP COLUMN IF EXISTS modifier_groups,
  DROP COLUMN IF EXISTS dietary_tags,
  DROP COLUMN IF EXISTS allergen_tags;
COMMIT;
