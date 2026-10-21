import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import Link from "next/link";
import { getPublicTutorials } from "@/lib/marketing-content";
import { SiteFooter } from "@/components/marketing/rich-content";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { metadataBase: new URL(getSiteUrl()), title: "آموزش اسکریپت | منوی دیجیتال", description: "آموزش کار با منوی دیجیتال، پنل مدیریت، صندوق، سفارش‌گیری و امکانات سامانه." };
export default async function TutorialsPage() {
 const items=await getPublicTutorials(); return <main className="min-h-dvh bg-base-200/40"><header className="bg-neutral px-5 py-14 text-neutral-content"><div className="mx-auto max-w-6xl"><h1 className="text-4xl font-black">مرکز آموزش</h1><p className="mt-3 leading-8 text-neutral-content/70">راهنمای گام‌به‌گام استفاده از امکانات اسکریپت</p></div></header><section className="mx-auto max-w-6xl px-5 py-10">{items.length?<div className="grid gap-5 md:grid-cols-2">{items.map(t=><Link key={t.id} href={`/tutorials/${t.slug}`} className="card overflow-hidden bg-base-100 shadow-sm ring-1 ring-base-300 md:flex-row">{t.coverImage&&<img src={t.coverImage} alt={t.title} className="aspect-video w-full object-cover md:w-64"/>}<div className="card-body"><span className="badge badge-outline">{t.category}</span><h2 className="card-title">{t.title}</h2><p className="text-sm leading-7 text-base-content/65">{t.summary}</p><span className="font-bold text-primary">مشاهده آموزش ←</span></div></Link>)}</div>:<div className="rounded-3xl bg-base-100 p-12 text-center text-base-content/60">آموزش‌ها به‌زودی منتشر می‌شوند.</div>}</section><SiteFooter/></main>;
}
