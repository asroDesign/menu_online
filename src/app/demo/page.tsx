import type { Metadata } from "next";
import { LeadForm } from "@/components/marketing/lead-form";
import { SiteFooter } from "@/components/marketing/rich-content";
export const metadata:Metadata={title:"درخواست دموی رایگان | منوی دیجیتال",description:"برای مشاهده رایگان امکانات منوی دیجیتال، درخواست دمو ثبت کنید."};
export default function DemoPage(){return <main className="min-h-dvh bg-base-200/40"><header className="bg-gradient-to-br from-primary to-primary/80 px-5 py-12 text-primary-content"><div className="mx-auto max-w-5xl"><h1 className="text-4xl font-black">دموی رایگان سامانه</h1><p className="mt-3 max-w-2xl leading-8 opacity-90">اطلاعات تماس را ثبت کنید؛ کارشناس ما برای هماهنگی نمایش رایگان با شما تماس می‌گیرد.</p></div></header><section className="mx-auto max-w-3xl px-5 py-10"><LeadForm kind="demo" title="درخواست نمایش رایگان"/></section><SiteFooter/></main>}
