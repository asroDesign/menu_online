import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/shell";
import { adminDept, getAuth } from "@/lib/auth";
import { permsOf } from "@/lib/admin-meta";

export const dynamic = "force-dynamic";
export const metadata = { title: "پنل مدیر سامانه | منوی دیجیتال" };

export default async function AdminPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.user.role !== "admin") redirect("/dashboard");
  const dept = adminDept(auth);
  return <AdminShell me={{ id: auth.user.id, name: auth.user.name, email: auth.user.email, dept, perms: permsOf(dept), businessId: auth.business.id }} />;
}
