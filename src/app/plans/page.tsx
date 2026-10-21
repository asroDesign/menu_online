import type { Metadata } from "next";
import { getPlanList } from "@/lib/app-settings";
import { getPlanOverrides } from "@/lib/entitlements";
import { resolveFeatures } from "@/lib/plans";
import { Pricing } from "@/components/marketing/pricing";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PlatformEventBeacon } from "@/components/marketing/platform-event-beacon";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تعرفه‌ها و مقایسه همه امکانات | منوی دیجیتال", description: "مقایسه کامل امکانات پلن‌های پایه، پرمیوم و پرمیوم پلاس با تعرفه شش‌ماهه و سالانه و تخفیف هر دوره." };
export default async function PlansPage(){const [plans,overrides]=await Promise.all([getPlanList(),getPlanOverrides()]);const matrix=Object.fromEntries(plans.map(p=>[p.key,resolveFeatures(p.key,null,overrides)]));return <><PlatformEventBeacon name="pricing_view"/><main className="market-container plans-page"><div className="section-heading"><span className="eyebrow">سرمایه‌گذاری روی تجربهٔ بهتر</span><h1>یک پلن برای امروز.<br/><em>فضا برای رشد فردا.</em></h1><p>دورهٔ مناسب خودتان را انتخاب کنید و تمام امکانات را کنار هم ببینید.<br/>قیمت‌ها به تومان و برای کل دورهٔ انتخابی هستند.</p></div><Pricing plans={plans} matrix={matrix} compare/></main><SiteFooter/></>}
