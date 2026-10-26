BEGIN;

ALTER TABLE offline_workspace_commands DROP CONSTRAINT IF EXISTS offline_workspace_commands_module_check;
ALTER TABLE offline_workspace_commands DROP CONSTRAINT IF EXISTS offline_workspace_commands_action_check;
ALTER TABLE offline_workspace_commands
  ADD CONSTRAINT offline_workspace_commands_module_check
    CHECK (module IN ('menu','staff','accounting','inventory','reservations')),
  ADD CONSTRAINT offline_workspace_commands_action_check CHECK (
    (module = 'menu' AND action IN ('update_product','update_category'))
    OR (module = 'staff' AND action IN ('create_shift','leave_request','shift_change'))
    OR (module = 'accounting' AND action IN ('create_document'))
    OR (module = 'inventory' AND action IN ('receive','waste'))
    OR (module = 'reservations' AND action IN ('set_status'))
  );

COMMIT;
