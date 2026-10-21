import { redirect } from "next/navigation";
import { can, getAuth } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/roles";
import { Costing } from "@/modules/inventory";

export const dynamic = "force-dynamic";

export default async function SmartPricingPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!can(auth, "costing")) redirect("/dashboard/plan?locked=costing");
  if (!["owner", "manager", "accountant", "warehouse"].includes(auth.role)) redirect(ROLE_HOME[auth.role] ?? "/dashboard");
  return <Costing />;
}
