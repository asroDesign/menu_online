export const ONLINE_ORDER_ACTION_STATUSES = ["pending", "awaiting_payment"] as const;
export const ONLINE_ORDER_RECENT_STATUSES = ["preparing"] as const;
export const ONLINE_ORDER_RECENT_WINDOW_MS = 24 * 60 * 60_000;

export type OnlineOrderNotificationSource = {
  source: string;
  status: string;
  deletedAt?: Date | string | null;
  createdAt: Date | string;
};

/** Keep actionable online orders visible; recently paid orders remain visible while preparation starts. */
export function isVisibleOnlineOrder(order: OnlineOrderNotificationSource, now = Date.now()): boolean {
  if (order.source !== "customer" || order.deletedAt) return false;
  if ((ONLINE_ORDER_ACTION_STATUSES as readonly string[]).includes(order.status)) return true;
  if (!(ONLINE_ORDER_RECENT_STATUSES as readonly string[]).includes(order.status)) return false;
  const createdAt = new Date(order.createdAt).getTime();
  return Number.isFinite(createdAt) && createdAt >= now - ONLINE_ORDER_RECENT_WINDOW_MS;
}

export type DashboardNotificationGroups = {
  orders: readonly unknown[];
  reservations: readonly unknown[];
  waiterCalls: readonly unknown[];
  inventory: readonly unknown[];
};

export function dashboardNotificationCount(groups: DashboardNotificationGroups): number {
  return groups.orders.length + groups.reservations.length + groups.waiterCalls.length + groups.inventory.length;
}
