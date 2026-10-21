import { redirect } from "next/navigation";
import { can, getAuth } from "@/lib/auth";
import { InventoryItemCreate } from "@/components/inventory-item-create";

export default async function InventoryAddPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!can(auth, "inventory")) redirect("/dashboard/plan?locked=inventory");
  return <InventoryItemCreate />;
}
