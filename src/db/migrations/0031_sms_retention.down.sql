BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sms_retention_deliveries) THEN
    RAISE EXCEPTION 'Refusing to drop SMS retention delivery history';
  END IF;
END $$;
DROP TABLE sms_retention_deliveries;
DROP TABLE sms_retention_members;
DROP TABLE sms_retention_rules;
COMMIT;
