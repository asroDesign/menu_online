import { redirect } from "next/navigation";
import { can, getAuth } from "@/lib/auth";
import { isManagerRole, ROLE_HOME } from "@/lib/roles";
import { InventoryWaste } from "@/modules/inventory-waste";

export const dynamic = "force-dynamic";

export default async function InventoryWastePage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!isManagerRole(auth.role) && auth.role !== "warehouse")
    redirect(ROLE_HOME[auth.role] ?? "/dashboard");
  if (!can(auth, "stock_movements")) redirect("/dashboard/plan?locked=stock_movements");
  return <InventoryWaste />;
}
