import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SoftMenuTest } from "@/components/marketing/demo-templates/softmenu-test";
import { DEMO_MENUS } from "@/lib/demo-menus";

const menu = DEMO_MENUS.find((item) => item.id === "softmenu-test")!;
const categories = menu.categories.slice(1);

export function generateStaticParams() {
  return categories.map((_, index) => ({ categoryId: String(index) }));
}

export async function generateMetadata({ params }: { params: Promise<{ categoryId: string }> }): Promise<Metadata> {
  const { categoryId } = await params;
  const category = categories[Number(categoryId)];
  return { title: category ? `${category} | منوی رستوران نمونه` : "دستهٔ منو", robots: { index: false, follow: true } };
}

export default async function SoftMenuCategoryPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const category = categories[Number(categoryId)];
  if (!category || !/^\d+$/.test(categoryId)) notFound();
  return <main><SoftMenuTest initialCategory={category}/></main>;
}
