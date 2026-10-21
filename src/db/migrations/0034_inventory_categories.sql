CREATE TABLE inventory_categories (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX inventory_categories_business_name_uq
  ON inventory_categories (business_id, lower(name));

ALTER TABLE inventory_items
  ADD COLUMN category_id integer REFERENCES inventory_categories(id) ON DELETE SET NULL;

CREATE INDEX inventory_items_category_idx
  ON inventory_items (business_id, category_id);
