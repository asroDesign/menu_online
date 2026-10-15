import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { MiniSite } from "@/components/mini-site";
import { featuresOf } from "@/lib/entitlements";
import { DEMO_SLUG, ensureDemoData } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function MiniSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === DEMO_SLUG) await ensureDemoData();
  const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug));
  if (!biz || biz.isSuspended) notFound();
  const level = (await featuresOf(biz)).mini_site;
  if (level === "no") notFound();
  return <MiniSite biz={biz} custom={level === "custom"} />;
}
