BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM offline_workspace_commands WHERE module = 'inventory' AND action = 'movement') THEN
    RAISE EXCEPTION 'Refusing to remove offline inventory movement support while movement command history exists';
  END IF;
END $$;

ALTER TABLE offline_workspace_commands DROP CONSTRAINT IF EXISTS offline_workspace_commands_action_check;
ALTER TABLE offline_workspace_commands
  ADD CONSTRAINT offline_workspace_commands_action_check CHECK (
    (module = 'menu' AND action IN ('update_product','update_category'))
    OR (module = 'staff' AND action IN ('create_shift','leave_request','shift_change'))
    OR (module = 'accounting' AND action IN ('create_document'))
    OR (module = 'inventory' AND action IN ('receive','waste'))
    OR (module = 'reservations' AND action IN ('set_status'))
    OR (module = 'receivables' AND action IN ('record_payment'))
  );

COMMIT;
