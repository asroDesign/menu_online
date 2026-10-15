import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAuth } from "@/lib/auth";
import { isManagerRole, ROLE_HOME } from "@/lib/roles";

export default async function ManagerOnly({ children }: { children: ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!isManagerRole(auth.role)) redirect(ROLE_HOME[auth.role] ?? "/dashboard/orders");
  return children;
}
