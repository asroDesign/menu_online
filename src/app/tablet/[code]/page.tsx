import { KitchenDisplay } from "@/components/kitchen-display";

export const dynamic = "force-dynamic";
export const metadata = { title: "نمایشگر آشپزخانه" };

export default async function TabletPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <KitchenDisplay code={code} />;
}
