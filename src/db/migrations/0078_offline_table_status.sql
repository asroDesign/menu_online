BEGIN;

ALTER TABLE offline_workspace_commands DROP CONSTRAINT IF EXISTS offline_workspace_commands_module_check;
ALTER TABLE offline_workspace_commands DROP CONSTRAINT IF EXISTS offline_workspace_commands_action_check;
ALTER TABLE offline_workspace_commands
  ADD CONSTRAINT offline_workspace_commands_module_check
    CHECK (module IN ('menu','staff','accounting','inventory','reservations','receivables','cheques','customers','orders','cash_shifts','tables')),
  ADD CONSTRAINT offline_workspace_commands_action_check CHECK (
    (module = 'menu' AND action IN ('update_product','update_category','create_product','create_category','set_recipe'))
    OR (module = 'staff' AND action IN ('create_shift','leave_request','shift_change','mark_absent','decide_leave','decide_shift_swap'))
    OR (module = 'accounting' AND action IN ('create_document'))
    OR (module = 'inventory' AND action IN ('receive','waste','movement','transfer','create_item'))
    OR (module = 'reservations' AND action IN ('set_status'))
    OR (module = 'receivables' AND action IN ('record_payment'))
    OR (module = 'cheques' AND action IN ('register','set_status'))
    OR (module = 'customers' AND action IN ('create','update'))
    OR (module = 'orders' AND action IN ('change_status','confirm_cashier'))
    OR (module = 'cash_shifts' AND action IN ('open','close'))
    OR (module = 'tables' AND action IN ('set_status'))
  );

COMMIT;
