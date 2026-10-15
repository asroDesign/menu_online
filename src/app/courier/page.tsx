import { redirect } from "next/navigation";
import { CourierApp } from "@/components/courier-app";
import { can, getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "پنل پیک" };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

export default async function CourierPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.role !== "courier") redirect("/dashboard");
  if (!can(auth, "courier")) return <div className="flex min-h-dvh items-center justify-center p-6 text-center text-stone-600">قابلیت «مدیریت پیک» در پلن این رستوران فعال نیست؛ با مدیر رستوران تماس بگیرید.</div>;
  return <CourierApp name={auth.user.name} />;
}
