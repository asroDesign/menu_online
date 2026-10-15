import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { MODULE_ONLY, ROLE_HOME } from "@/lib/roles";
import Overview from "@/modules/overview";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!MODULE_ONLY.dashboard.includes(auth.role)) redirect(ROLE_HOME[auth.role] ?? "/dashboard/orders");
  return <Overview />;
}
