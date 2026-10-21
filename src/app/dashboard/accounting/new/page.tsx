import { redirect } from "next/navigation";
import { can, getAuth } from "@/lib/auth";
import { NewAccountingDocumentPage } from "@/modules/accounting";

export const dynamic = "force-dynamic";

export default async function NewAccountingDocumentRoute() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!can(auth, "accounting")) redirect("/dashboard/plan?locked=accounting");
  return <NewAccountingDocumentPage />;
}
