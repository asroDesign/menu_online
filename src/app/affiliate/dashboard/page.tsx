import type { Metadata } from "next";
import { AffiliateDashboard } from "@/components/affiliate/portal";

export const metadata: Metadata = { title: "پنل همکار فروش", robots: { index: false, follow: false } };
export default function AffiliateDashboardPage() { return <main className="min-h-dvh bg-base-200/60"><AffiliateDashboard /></main>; }
