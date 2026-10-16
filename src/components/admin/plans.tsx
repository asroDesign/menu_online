"use client";
import { Fragment, useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { FEATURES, GROUPS, resolveFeatures, type Level } from "@/lib/plans";
import { Button, Card, Field, Input, Skeleton, cn, useToast, EmojiIcon} from "@/components/ui";
import { pricePlan, type PricedPlan } from "@/lib/plan-pricing";
import { useGet } from "@/components/admin/common";

function PriceEditor({ plans, onSaved }: { plans: PricedPlan[]; onSaved: () => void }) {
  const toast = useToast();
  const [prices, setPrices] = useState(() => Object.fromEntries(plans.map(p => [p.key, { oldPrice: String(p.oldPrice), sixMonthPrice: String(p.sixMonthPrice), annualDiscount: String(p.annualDiscount), sixMonthDiscount: String(p.sixMonthDiscount) }])));
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const value = Object.fromEntries(plans.map(p => { const raw = prices[p.key]; const v = { oldPrice: Number(raw.oldPrice), sixMonthPrice: Number(raw.sixMonthPrice), annualDiscount: Number(raw.annualDiscount), sixMonthDiscount: Number(raw.sixMonthDiscount) }; return [p.key, { ...v, price: pricePlan(p, v).price }]; }));
      await api("/api/admin/settings", { method: "POST", body: { key: "planPrices", value } });
      toast("تعرفه‌ها و تخفیف دوره‌ها ذخیره شد"); onSaved();
    } catch(e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  return <Card className="p-5"><form onSubmit={save}><h3 className="font-bold">تعرفه‌های شش‌ماهه و سالانه</h3><p className="mb-5 mt-2 text-xs leading-6 text-stone-500">برای هر پلن، مبلغ کل دوره و درصد تخفیف را جداگانه تعیین کنید. مبلغ نهایی در سایت، پنل مشتری و محاسبه خودکار فاکتور یکسان است.</p><div className="grid gap-4 lg:grid-cols-3">{plans.map(p=>{
    const raw=prices[p.key]; const preview=pricePlan(p,{oldPrice:Number(raw.oldPrice),sixMonthPrice:Number(raw.sixMonthPrice),annualDiscount:Number(raw.annualDiscount),sixMonthDiscount:Number(raw.sixMonthDiscount)});
    return <div key={p.key} className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50 p-4"><h4 className="font-extrabold">{p.name}</h4>{([['sixMonthPrice','مبلغ پایه شش‌ماهه (تومان)'],['sixMonthDiscount','تخفیف شش‌ماهه (درصد)'],['oldPrice','مبلغ پایه سالانه (تومان)'],['annualDiscount','تخفیف سالانه (درصد)']] as const).map(([key,label])=><Field key={key} label={label}><Input required type="number" min="0" max={key.includes('Discount') ? 100 : 2000000000} step={key.includes('Discount') ? 'any' : 1} value={raw[key]} onChange={e=>setPrices({...prices,[p.key]:{...raw,[key]:e.target.value}})}/></Field>)}<div className="rounded-xl bg-white p-3 text-xs leading-7"><p>شش‌ماهه: <b>{formatNumber(preview.terms[6].total)}</b> تومان</p><p>سالانه: <b>{formatNumber(preview.terms[12].total)}</b> تومان</p></div></div>;
  })}</div><div className="mt-4 flex justify-end"><Button type="submit" loading={busy}>ذخیره تعرفه‌ها و تخفیف‌ها</Button></div></form></Card>;
}

export function PlansTab() {
  const toast = useToast();
  const { data, reload, setData } = useGet<{ overrides: Record<string, Record<string, Level>>; plans: PricedPlan[] }>("/api/admin/plans");
  const eff = useMemo(() => (data ? Object.fromEntries(data.plans.map((p) => [p.key, resolveFeatures(p.key, {}, data.overrides)])) : {}), [data]);
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  async function set(plan: string, feature: string, level: Level | null) {
    const prev = data!;
    setData((d) => { if (!d) return d; const o = { ...d.overrides, [plan]: { ...(d.overrides[plan] ?? {}) } }; if (level === null) delete o[plan][feature]; else o[plan][feature] = level; return { ...d, overrides: o }; });
    try { await api("/api/admin/plans", { method: "POST", body: { plan, feature, level } }); toast("ماتریس پلن به‌روز شد"); } catch (e) { setData(prev); toast((e as Error).message, "error"); }
  }
  return (
    <div className="animate-fade-in space-y-5">
      <div><h1 className="text-xl font-extrabold sm:text-2xl">پلن‌ها و قیمت‌ها</h1><p className="mt-1 text-sm text-stone-500">تغییرات ماتریس بلافاصله برای همه‌ی کسب‌وکارهای آن پلن اعمال می‌شود (مگر استثنای دستی داشته باشند)</p></div>
      <PriceEditor key={JSON.stringify(data.plans)} plans={data.plans} onSaved={() => { void reload(true); }} />
      <Card className="overflow-x-auto">
        <p className="border-b border-stone-100 p-4 text-xs leading-6 text-stone-500">سلول‌های دارای حاشیه‌ی زرد با پیش‌فرض اسکریپت تفاوت دارند. «اختصاصی» یعنی نسخه‌ی ویژه‌ی همان امکان (مثلاً مینی‌وبسایت اختصاصی).</p>
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="bg-stone-50 text-xs text-stone-500"><th className="p-3 text-start">امکان</th>{data.plans.map((p) => <th key={p.key} className="w-40 p-3 text-center">{p.name}</th>)}</tr></thead>
          <tbody>{Object.entries(GROUPS).map(([g, meta]) => (
            <Fragment key={g}>
              <tr className="bg-stone-50/70"><td colSpan={4} className="p-2.5 text-xs font-extrabold">{<EmojiIcon emoji={meta.emoji} /> } {meta.title}</td></tr>
              {FEATURES.filter((f) => f.group === g).map((f) => (
                <tr key={f.key} className="border-t border-stone-100"><td className="p-3">{f.label}</td>
                  {data.plans.map((p, i) => { const changed = data.overrides[p.key]?.[f.key] !== undefined && data.overrides[p.key][f.key] !== f.levels[i]; return (
                    <td key={p.key} className="p-2 text-center"><select value={eff[p.key][f.key]} onChange={(e) => set(p.key, f.key, e.target.value === f.levels[i] ? null : (e.target.value as Level))} className={cn("rounded-lg border-0 px-2 py-1.5 text-xs font-semibold ring-1", eff[p.key][f.key] === "no" ? "bg-rose-50 text-rose-700 ring-rose-200" : eff[p.key][f.key] === "custom" ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200", changed && "ring-2 ring-amber-400")}><option value="yes">دارد</option><option value="no">ندارد</option><option value="custom">اختصاصی</option></select></td>); })}
                </tr>
              ))}
            </Fragment>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}
