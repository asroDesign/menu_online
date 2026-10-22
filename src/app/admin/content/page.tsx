import { notFound, redirect } from "next/navigation";
import { ContentEditorPage } from "@/components/admin/content-editor-page";
import { adminCan, getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "ویرایش محتوای سایت | پنل مدیریت" };

export default async function AdminContentEditorRoute({ searchParams }: { searchParams: Promise<{ type?: string; id?: string }> }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.user.role !== "admin") redirect("/dashboard");
  if (!adminCan(auth, "content")) redirect("/admin");
  const params = await searchParams;
  if (params.type !== "posts" && params.type !== "tutorials") notFound();
  const id = params.id ? Number(params.id) : null;
  if (params.id && (!Number.isSafeInteger(id) || (id ?? 0) < 1)) notFound();
  return <ContentEditorPage kind={params.type} id={id} />;
}
