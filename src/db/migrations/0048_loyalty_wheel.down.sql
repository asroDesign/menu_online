BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM loyalty_wheel_spins) OR EXISTS (SELECT 1 FROM loyalty_wheel_prizes) OR EXISTS (SELECT 1 FROM loyalty_wheel_settings) THEN
    RAISE EXCEPTION 'Cannot roll back the loyalty wheel while its settings, prizes, or spin history exist';
  END IF;
END $$;

DROP TABLE loyalty_wheel_spins;
DROP TABLE loyalty_wheel_prizes;
DROP TABLE loyalty_wheel_settings;

COMMIT;
