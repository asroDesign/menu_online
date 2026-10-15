import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getAuth } from "@/lib/auth";
import { ensureDemoData } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const metadata = { title: "ورود | منوی دیجیتال" };

export default async function LoginPage() {
  await ensureDemoData();
  if (await getAuth()) redirect("/dashboard");
  return <AuthForm mode="login" />;
}
