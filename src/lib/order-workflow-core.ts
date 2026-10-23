export type OrderWorkflowPreset = 1 | 2 | 3 | 4;

export type WorkflowDisplayStage = {
  label: string;
  statuses: string[];
};

const stages: Record<OrderWorkflowPreset, WorkflowDisplayStage[]> = {
  4: [
    { label: "جدید", statuses: ["pending"] },
    { label: "آماده‌سازی", statuses: ["preparing"] },
    { label: "آماده", statuses: ["ready"] },
    { label: "سرو شده", statuses: ["served"] },
  ],
  3: [
    { label: "جدید", statuses: ["pending"] },
    { label: "در حال انجام", statuses: ["preparing", "ready"] },
    { label: "تکمیل", statuses: ["served"] },
  ],
  2: [
    { label: "جدید", statuses: ["pending", "preparing"] },
    { label: "آماده یا تکمیل", statuses: ["ready", "served"] },
  ],
  1: [{ label: "جریان سفارش", statuses: ["pending", "preparing", "ready", "served"] }],
};

export function workflowDisplayStages(preset: number): WorkflowDisplayStage[] {
  return stages[(preset in stages ? preset : 4) as OrderWorkflowPreset].map((stage) => ({ ...stage, statuses: [...stage.statuses] }));
}

export function workflowDisplayStageIndex(preset: number, status: string) {
  return workflowDisplayStages(preset).findIndex((stage) => stage.statuses.includes(status));
}

export function orderStatusAfterPayment(
  currentStatus: string,
  options: { creditSale?: boolean; reopen?: boolean; markCompleted?: boolean } = {},
) {
  if (options.creditSale) return currentStatus;
  if (["awaiting_payment", "pending", "preparing"].includes(currentStatus)) return "preparing";
  if (currentStatus === "canceled" && options.reopen) return "preparing";
  return options.markCompleted ? "paid" : currentStatus;
}
