ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS parent_category_id integer REFERENCES categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS categories_parent_idx
  ON categories (business_id, parent_category_id);
