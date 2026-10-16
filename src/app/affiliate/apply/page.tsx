import type { Metadata } from "next";
import Link from "next/link";
import { AffiliateApply } from "@/components/affiliate/portal";

export const metadata: Metadata = { title: "درخواست همکاری در فروش", description: "درخواست عضویت در برنامه همکاری در فروش منوی دیجیتال." };
export default function AffiliateApplyPage() { return <main className="min-h-dvh bg-base-200/60 px-4 py-10"><div className="mx-auto mb-5 max-w-2xl"><Link href="/" className="text-sm font-bold text-primary">← منوی دیجیتال</Link></div><AffiliateApply /></main>; }
