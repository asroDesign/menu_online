import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SoftMenuTest3 } from "@/components/marketing/demo-templates/softmenu-test3";
import { SoftMenuTest } from "@/components/marketing/demo-templates/softmenu-test";
import { CaptainMDemo } from "@/components/marketing/demo-templates/captainm";
import { HaftkhanDemo } from "@/components/marketing/demo-templates/haftkhan";
import { DEMO_MENUS } from "@/lib/demo-menus";

const dedicatedIds = ["softmenu-test3", "softmenu-test", "captainm", "haftkhan"] as const;
type DedicatedId = (typeof dedicatedIds)[number];

export function generateStaticParams() {
  return dedicatedIds.map((menuId) => ({ menuId }));
}

export async function generateMetadata({ params }: { params: Promise<{ menuId: string }> }): Promise<Metadata> {
  const { menuId } = await params;
  const menu = DEMO_MENUS.find((item) => item.id === menuId);
  if (!menu || !dedicatedIds.includes(menuId as DedicatedId)) return { title: "منوی نمونه | MenuPeak" };
  return {
    title: `${menu.businessName} | منوی نمونه MenuPeak`,
    description: `${menu.businessType} · ${menu.description} پیش‌نمایش نمایشی منوی دیجیتال.`,
    robots: { index: false, follow: true },
  };
}

export default async function DedicatedDemoPage({ params }: { params: Promise<{ menuId: string }> }) {
  const { menuId } = await params;
  if (!dedicatedIds.includes(menuId as DedicatedId)) notFound();
  const Page = {
    "softmenu-test3": SoftMenuTest3,
    "softmenu-test": SoftMenuTest,
    captainm: CaptainMDemo,
    haftkhan: HaftkhanDemo,
  }[menuId as DedicatedId];
  return <main><Page/></main>;
}
