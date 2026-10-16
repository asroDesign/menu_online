import type { Metadata } from "next";
import Link from "next/link";
import { AffiliateLogin } from "@/components/affiliate/portal";

export const metadata: Metadata = { title: "ورود به پنل همکار فروش", robots: { index: false, follow: false } };
export default function AffiliateLoginPage() { return <main className="min-h-dvh bg-base-200/60 px-4 py-10"><div className="mx-auto mb-5 max-w-md"><Link href="/" className="text-sm font-bold text-primary">← منوی دیجیتال</Link></div><AffiliateLogin /></main>; }
