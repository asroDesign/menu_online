import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaptainMDemo } from "@/components/marketing/demo-templates/captainm";
import { DEMO_MENUS } from "@/lib/demo-menus";

const categories = DEMO_MENUS.find((menu) => menu.id === "captainm")!.categories.slice(1);

export function generateStaticParams() {
  return categories.map((_, index) => ({ categoryId: String(index) }));
}

export async function generateMetadata({ params }: { params: Promise<{ categoryId: string }> }): Promise<Metadata> {
  const { categoryId } = await params;
  const category = categories[Number(categoryId)];
  return { title: category ? `${category} | کاپیتان ام` : "دستهٔ منو", robots: { index: false, follow: true } };
}

export default async function CaptainMCategoryPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const category = categories[Number(categoryId)];
  if (!category || !/^\d+$/.test(categoryId)) notFound();
  return <CaptainMDemo view="products" initialCategory={category}/>;
}
