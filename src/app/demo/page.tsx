import type { Metadata } from "next";
import { LeadForm } from "@/components/marketing/lead-form";
import { SiteFooter } from "@/components/marketing/rich-content";
import { PlatformEventBeacon } from "@/components/marketing/platform-event-beacon";
export const metadata:Metadata={title:"درخواست نمایش همراه کارشناس | MenuPeak",description:"برای هماهنگی نمایش سامانه، درخواست خود را ثبت کنید تا کارشناس با شما تماس بگیرد."};
export default function DemoPage(){return <main className="min-h-dvh bg-base-200/40"><PlatformEventBeacon name="demo_request_view"/><header className="bg-gradient-to-br from-primary to-primary/80 px-5 py-12 text-primary-content"><div className="mx-auto max-w-5xl"><h1 className="text-4xl font-black">درخواست نمایش همراه کارشناس</h1><p className="mt-3 max-w-2xl leading-8 opacity-90">نام و راه تماس را ثبت کنید تا برای هماهنگی زمان و نمایش بخش‌های متناسب با کسب‌وکارتان با شما تماس بگیریم.</p></div></header><section className="mx-auto max-w-3xl px-5 py-10"><LeadForm kind="demo" title="هماهنگی نمایش سامانه"/></section><SiteFooter/></main>}
