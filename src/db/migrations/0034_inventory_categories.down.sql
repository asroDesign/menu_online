DROP INDEX IF EXISTS inventory_items_category_idx;
ALTER TABLE inventory_items DROP COLUMN IF EXISTS category_id;
DROP TABLE IF EXISTS inventory_categories;
