import { notFound, redirect } from "next/navigation";
import type { ComponentType } from "react";
import { getAuth, can } from "@/lib/auth";
import { MODULE_ONLY, ROLE_HOME } from "@/lib/roles";
import { Accounting } from "@/modules/accounting";
import { SmsPanel } from "@/modules/sms";
import Orders from "@/modules/orders";
import Waiter from "@/modules/waiter";
import Tables from "@/modules/tables";
import Staff from "@/modules/staff";
import { Customers, Cashback, Discounts, Surveys } from "@/modules/growth-a";
import { CrossSell, Bale, Translations, MiniSiteEditor, Domain, ArPage, AiPage, Payments, Tickets, PlanPage } from "@/modules/growth-b";
import { IncomeExpense, Reports, ProfitLoss, Bank, Assets } from "@/modules/finance";
import { Inventory, StockMovements, StockControl, Recipes, Costing } from "@/modules/inventory";
import { Couriers, Zones, Devices, Printers, CallerId, Scale, VoicePager, FoodCourtPager } from "@/modules/hardware";

export const dynamic = "force-dynamic";

import Suppliers from "@/modules/suppliers";
import Kiosk from "@/modules/kiosk";

const Cashier = () => <Waiter mode="cashier" />;

const MODULES: Record<string, { feature?: string | string[]; C: ComponentType }> = {
  orders: { feature: "cashier_pos", C: Orders },
  suppliers: { feature: ["inventory", "accounting"], C: Suppliers },
  kiosk: { feature: "kiosk", C: Kiosk },
  waiter: { feature: "cashier_pos", C: Waiter },
  cashier: { feature: "cashier_pos", C: Cashier },
  tables: { feature: ["self_order", "cashier_pos"], C: Tables },
  staff: { feature: "cashier_pos", C: Staff },
  customers: { feature: "loyalty", C: Customers },
  cashback: { feature: "cashback", C: Cashback },
  discounts: { feature: "discount", C: Discounts },
  surveys: { feature: "surveys", C: Surveys },
  "cross-sell": { feature: "cross_sell", C: CrossSell },
  sms: { feature: "sms", C: SmsPanel },
  bale: { feature: "bale", C: Bale },
  translations: { feature: "translation", C: Translations },
  "mini-site": { feature: "mini_site", C: MiniSiteEditor },
  domain: { feature: "custom_domain", C: Domain },
  ar: { feature: "ar", C: ArPage },
  ai: { feature: "ai", C: AiPage },
  payments: { feature: ["ipg", "installment"], C: Payments },
  tickets: { feature: "support", C: Tickets },
  plan: { C: PlanPage },
  accounting: { feature: "accounting", C: Accounting },
  "income-expense": { feature: "income_expense", C: IncomeExpense },
  reports: { feature: "sales_reports", C: Reports },
  "profit-loss": { feature: "profit_loss", C: ProfitLoss },
  bank: { feature: "bank_report", C: Bank },
  assets: { feature: "assets", C: Assets },
  inventory: { feature: "inventory", C: Inventory },
  "stock-movements": { feature: "stock_movements", C: StockMovements },
  "stock-control": { feature: "stock_control", C: StockControl },
  recipes: { feature: "recipes", C: Recipes },
  costing: { feature: "costing", C: Costing },
  couriers: { feature: "courier", C: Couriers },
  zones: { feature: "zones", C: Zones },
  devices: { feature: "tablet_pos", C: Devices },
  printers: { feature: "cloud_printer", C: Printers },
  "caller-id": { feature: "caller_id", C: CallerId },
  scale: { feature: "scale", C: Scale },
  "voice-pager": { feature: "pager_voice", C: VoicePager },
  "food-court-pager": { feature: "foodcourt_pager", C: FoodCourtPager },
};

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: slug } = await params;
  const def = MODULES[slug];
  if (!def) notFound();
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const only = MODULE_ONLY[slug];
  if (only && !only.includes(auth.role)) redirect(ROLE_HOME[auth.role] ?? "/dashboard/orders");
  if (def.feature) {
    if (!can(auth, def.feature)) redirect(`/dashboard/plan?locked=${Array.isArray(def.feature) ? def.feature[0] : def.feature}`);
  }
  const C = def.C;
  return <C />;
}
