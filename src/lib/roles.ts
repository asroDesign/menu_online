import type { FeatureMap } from "@/lib/plans";

export const STAFF_ROLE_LABELS: Record<string, string> = {
  manager: "مدیر شیفت",
  waiter: "گارسون",
  cashier: "صندوقدار",
  chef: "آشپزخانه",
  warehouse: "انباردار",
  accountant: "حسابدار",
};

export const MANAGER_ROLES = ["owner", "manager"];
export const isManagerRole = (r: string) => MANAGER_ROLES.includes(r);

/** plan features a given staff role may use ("*" = everything the plan offers) */
export const ROLE_FEATURES: Record<string, string[] | "*"> = {
  owner: "*",
  courier: ["courier"],
  manager: "*",
  waiter: ["cashier_pos", "self_order", "waiter_call", "delivery_order", "preorder", "discount", "cashback", "loyalty", "cross_sell", "zones", "foodcourt_pager", "pager_voice", "caller_id", "staff_scheduling", "support"],
  cashier: ["cashier_pos", "self_order", "waiter_call", "delivery_order", "preorder", "discount", "cashback", "loyalty", "cross_sell", "zones", "foodcourt_pager", "pager_voice", "caller_id", "tablet_pos", "scale", "staff_scheduling", "support"],
  chef: ["cashier_pos", "tablet_pos", "pager_voice", "foodcourt_pager", "recipes", "cloud_printer", "staff_scheduling", "support"],
  warehouse: ["inventory", "stock_movements", "stock_control", "purchase_suggestions", "recipes", "costing", "scale", "staff_scheduling", "support"],
  accountant: ["accounting", "income_expense", "sales_reports", "profit_loss", "bank_report", "assets", "cheque_register", "costing", "cashier_pos", "staff_scheduling", "payroll", "support"],
};

const M = ["owner", "manager"];
/** dashboard modules limited to specific roles (everything else is gated by plan-features per role) */
export const MODULE_ONLY: Record<string, string[]> = {
  dashboard: [...M, "accountant"],
  waiter: [...M, "waiter", "cashier"], cashier: [...M, "cashier"],
  kiosk: M, suppliers: [...M, "warehouse", "accountant"],
  staff: M, discounts: M, cashback: M, "cross-sell": M, zones: M, printers: M, plan: M, devices: M, surveys: M, sms: M, bale: M,
  payroll: [...M, "accountant"],
  reservations: M,
  "loyalty-wheel": M,
  "customer-feedback": M,
  translations: M, ar: M, ai: M, domain: M, "mini-site": M, payments: M, products: M, categories: M, settings: M,
};

export const ROLE_HOME: Record<string, string> = {
  courier: "/courier",
  owner: "/dashboard",
  manager: "/dashboard",
  accountant: "/dashboard",
  waiter: "/dashboard/waiter",
  cashier: "/dashboard/cashier",
  chef: "/dashboard/orders",
  warehouse: "/dashboard/inventory",
};

export function restrictByRole(map: FeatureMap, role: string): FeatureMap {
  const allow = ROLE_FEATURES[role] ?? [];
  if (allow === "*") return map;
  const out: FeatureMap = {};
  for (const k of Object.keys(map)) out[k] = allow.includes(k) ? map[k] : "no";
  return out;
}
