-- Product modifier groups and order-line snapshots are additive; historical rows keep empty defaults.
BEGIN;
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS modifier_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dietary_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS allergen_tags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS option_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMIT;
