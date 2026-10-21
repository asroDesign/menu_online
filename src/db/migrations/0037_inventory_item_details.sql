ALTER TABLE inventory_items
  ADD COLUMN sku text,
  ADD COLUMN recipe_unit text NOT NULL DEFAULT 'عدد',
  ADD COLUMN recipe_to_stock_factor double precision NOT NULL DEFAULT 1 CHECK (recipe_to_stock_factor > 0),
  ADD COLUMN reorder_point double precision NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN expiry_date date,
  ADD COLUMN last_purchase_cost integer NOT NULL DEFAULT 0 CHECK (last_purchase_cost >= 0);

UPDATE inventory_items
SET recipe_unit = unit,
    last_purchase_cost = cost_per_unit,
    reorder_point = min_stock * 2;

CREATE UNIQUE INDEX inventory_items_business_sku_uq
  ON inventory_items (business_id, lower(sku))
  WHERE sku IS NOT NULL AND sku <> '';
