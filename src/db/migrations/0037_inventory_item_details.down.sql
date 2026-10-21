DROP INDEX IF EXISTS inventory_items_business_sku_uq;

ALTER TABLE inventory_items
  DROP COLUMN IF EXISTS last_purchase_cost,
  DROP COLUMN IF EXISTS expiry_date,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS reorder_point,
  DROP COLUMN IF EXISTS recipe_to_stock_factor,
  DROP COLUMN IF EXISTS recipe_unit,
  DROP COLUMN IF EXISTS sku;
