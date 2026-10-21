import type { Metadata } from "next";
import { TrackOrderClient } from "@/components/track-order-client";

export const metadata: Metadata = {
  title: "رهگیری سفارش",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function TrackOrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <main className="min-h-dvh bg-base-200 px-4 py-10" dir="rtl"><TrackOrderClient slug={slug} /></main>;
}
