import type { Metadata } from "next";
import { CaptainMDemo } from "@/components/marketing/demo-templates/captainm";

export const metadata: Metadata = {
  title: "منوی کاپیتان ام | محصولات",
  description: "فهرست محصولات و دسته‌بندی‌های منوی نمایشی کافه رستوران کاپیتان ام.",
  robots: { index: false, follow: true },
};

export default function CaptainMProductsPage() {
  return <CaptainMDemo view="products"/>;
}
