import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getAuth } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-next-path";

export const dynamic = "force-dynamic";
export const metadata = { title: "ثبت‌نام | منوی دیجیتال" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; trial?: string | string[] }> }) {
  const query = await searchParams;
  const nextPath = safeNextPath(query.next);
  const freeTrialSignup = query.trial === "demo";
  if (await getAuth()) redirect(nextPath);
  return <AuthForm mode="register" nextPath={nextPath} freeTrialSignup={freeTrialSignup} />;
}
