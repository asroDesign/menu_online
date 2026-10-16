import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MenuClient } from "@/components/menu-client";
import { getPublicMenu } from "@/lib/public-menu";
import { DEMO_SLUG, ensureDemoData } from "@/lib/seed";
import { DEMO_ENABLED } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ table?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (slug === DEMO_SLUG) { if (!DEMO_ENABLED) notFound(); await ensureDemoData(); }
  const data = await getPublicMenu(slug);
  return { title: data ? `منوی ${data.business.name}` : "منو پیدا نشد" };
}

export default async function PublicMenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { table } = await searchParams;
  if (slug === DEMO_SLUG) { if (!DEMO_ENABLED) notFound(); await ensureDemoData(); }
  const data = await getPublicMenu(slug);
  if (!data) notFound();
  const tableId = table && data.tables.some((t) => t.id === Number(table)) ? Number(table) : null;
  return <MenuClient data={JSON.parse(JSON.stringify(data))} initialTableId={tableId} />;
}
