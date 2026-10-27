import type { Metadata } from "next";
import { getPlanList } from "@/lib/app-settings";
import { getPlanOverrides } from "@/lib/entitlements";
import { resolveFeatures } from "@/lib/plans";
import { Pricing } from "@/components/marketing/pricing";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PlatformEventBeacon } from "@/components/marketing/platform-event-beacon";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تعرفه‌ها و مقایسه همه امکانات | منوی دیجیتال", description: "مقایسه امکانات پلن‌های پایه، پرمیوم و پرمیوم پلاس؛ مشاهده قیمت ماهانه و خرید اشتراک یک، سه، شش یا دوازده‌ماهه." };
export default async function PlansPage(){const [plans,overrides]=await Promise.all([getPlanList(),getPlanOverrides()]);const matrix=Object.fromEntries(plans.map(p=>[p.key,resolveFeatures(p.key,null,overrides)]));return <><PlatformEventBeacon name="pricing_view"/><main className="market-container plans-page"><div className="section-heading"><span className="eyebrow">سرمایه‌گذاری روی تجربهٔ بهتر</span><h1>یک پلن برای امروز.<br/><em>فضا برای رشد فردا.</em></h1><p>قیمت هر پلن را به‌صورت ماهانه ببینید؛ دورهٔ یک، سه، شش یا دوازده‌ماهه را انتخاب کنید تا مبلغ کل و امکانات را کنار هم بررسی کنید.</p></div><Pricing plans={plans} matrix={matrix} compare/></main><SiteFooter/></>}
