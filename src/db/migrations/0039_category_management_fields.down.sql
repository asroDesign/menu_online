DROP INDEX IF EXISTS categories_parent_idx;

ALTER TABLE categories
  DROP COLUMN IF EXISTS image_url,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS parent_category_id;
