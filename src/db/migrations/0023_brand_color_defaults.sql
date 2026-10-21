-- New businesses start with the platform's blue brand color.
-- Existing businesses keep their independently selected accent colors.
ALTER TABLE businesses ALTER COLUMN accent_color SET DEFAULT '#2563eb';
