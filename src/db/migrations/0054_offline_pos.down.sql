-- Stop desktop synchronization and export all three tables before rollback.
-- Existing orders/accounting documents are intentionally retained.
BEGIN;
DROP TABLE IF EXISTS offline_sales;
DROP TABLE IF EXISTS offline_catalogs;
DROP TABLE IF EXISTS offline_terminals;
COMMIT;
