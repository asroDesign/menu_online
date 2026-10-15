import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "ثبت‌نام | منوی دیجیتال" };

export default async function RegisterPage() {
  if (await getAuth()) redirect("/dashboard");
  return <AuthForm mode="register" />;
}
