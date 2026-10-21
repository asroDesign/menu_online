import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getAuth } from "@/lib/auth";
import { ensureDemoData } from "@/lib/seed";
import { safeNextPath } from "@/lib/safe-next-path";

export const dynamic = "force-dynamic";
export const metadata = { title: "ورود | منوی دیجیتال" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; trial?: string | string[] }> }) {
  const query = await searchParams;
  const nextPath = safeNextPath(query.next);
  const freeTrialSignup = query.trial === "demo";
  await ensureDemoData();
  if (await getAuth()) redirect(nextPath);
  return <AuthForm mode="login" nextPath={nextPath} freeTrialSignup={freeTrialSignup} />;
}
