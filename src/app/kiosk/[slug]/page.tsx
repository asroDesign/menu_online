import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { KioskClient, type KioskCfg } from "@/components/kiosk-client";
import { featuresOf } from "@/lib/entitlements";
import { hasAny, type Settings } from "@/lib/plans";
import { buildPublicMenu } from "@/lib/public-menu";
import { posDeviceForChannel, posOnline } from "@/lib/pos";
import { DEMO_SLUG } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";
export const metadata = { title: "سفارش‌گیر کیوسک" };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

export default async function KioskPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ template?: string }> }) {
  const { slug } = await params;
  const { template } = await searchParams;
  if (slug === DEMO_SLUG) notFound();
  const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug));
  if (!biz || biz.isSuspended) notFound();
  if (!hasAny(await featuresOf(biz), "kiosk")) notFound();
  const st = ((biz.settings ?? {}) as Settings).kiosk;
  const kioskPos = st?.allowPos ? await posDeviceForChannel(biz.id, "kiosk", st.posDeviceId) : null;
  const data = await buildPublicMenu(biz);
  const cfg: KioskCfg = {
    template: ["classic", "photo", "simple", "dark", "wizard"].includes(String(template)) ? String(template) : (st?.template ?? "classic"),
    welcomeTitle: st?.welcomeTitle || biz.name,
    welcomeSubtitle: st?.welcomeSubtitle || "برای شروع سفارش، صفحه را لمس کنید",
    idleSeconds: st?.idleSeconds ?? 90,
    allowCounter: st?.allowCounter !== false,
    allowOnline: !!st?.allowOnline && data.caps.ipg,
    askPhone: st?.askPhone !== false,
    allowPos: !!st?.allowPos && hasAny(await featuresOf(biz), "tablet_pos"),
    posOnline: !!kioskPos && (await posOnline(biz.id, kioskPos.id)),
  };
  return <KioskClient data={JSON.parse(JSON.stringify(data))} cfg={cfg} />;
}
