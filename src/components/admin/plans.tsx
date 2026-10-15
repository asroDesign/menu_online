"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { FEATURES, GROUPS, resolveFeatures, type Level } from "@/lib/plans";
import { Button, Card, Field, Input, Skeleton, cn, useToast } from "@/components/ui";
import { useGet } from "@/components/admin/common";

const toEn = (s: string) => Number(s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "")) || 0;

export function PlansTab() {
  const toast = useToast();
  const { data, reload, setData } = useGet<{ overrides: Record<string, Record<string, Level>>; plans: { key: string; name: string; tag: string; price: number; oldPrice: number }[] }>("/api/admin/plans");
  const [prices, setPrices] = useState<Record<string, { price: string; oldPrice: string }>>({});
  useEffect(() => { if (data) setPrices(Object.fromEntries(data.plans.map((p) => [p.key, { price: String(p.price), oldPrice: String(p.oldPrice) }]))); }, [data]);
  const eff = useMemo(() => (data ? Object.fromEntries(data.plans.map((p) => [p.key, resolveFeatures(p.key, {}, data.overrides)])) : {}), [data]);
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  async function set(plan: string, feature: string, level: Level | null) {
    const prev = data!;
    setData((d) => { if (!d) return d; const o = { ...d.overrides, [plan]: { ...(d.overrides[plan] ?? {}) } }; if (level === null) delete o[plan][feature]; else o[plan][feature] = level; return { ...d, overrides: o }; });
    try { await api("/api/admin/plans", { method: "POST", body: { plan, feature, level } }); toast("ماتریس پلن به‌روز شد"); } catch (e) { setData(prev); toast((e as Error).message, "error"); }
  }
  async function savePrices() {
    try { await api("/api/admin/settings", { method: "POST", body: { key: "planPrices", value: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, { price: toEn(v.price), oldPrice: toEn(v.oldPrice) }])) } }); toast("قیمت‌ها ذخیره شد؛ در صفحه‌ی اول و صفحه‌ی پلن‌ها اعمال می‌شود"); reload(true); } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <div className="animate-fade-in space-y-5">
      <div><h1 className="text-xl font-extrabold sm:text-2xl">پلن‌ها و قیمت‌ها</h1><p className="mt-1 text-sm text-stone-500">تغییرات ماتریس بلافاصله برای همه‌ی کسب‌وکارهای آن پلن اعمال می‌شود (مگر استثنای دستی داشته باشند)</p></div>
      <Card className="p-5">
        <h3 className="mb-4 font-bold">قیمت سالانه (تومان)</h3>
        <div className="grid gap-4 md:grid-cols-3">{data.plans.map((p) => (
          <div key={p.key} className="space-y-3 rounded-2xl bg-stone-50 p-4"><p className="font-extrabold">{p.name}</p><p className="text-xs text-stone-500">{p.tag}</p>
            <Field label="قیمت فروش"><Input inputMode="numeric" value={prices[p.key]?.price ?? ""} onChange={(e) => setPrices({ ...prices, [p.key]: { ...prices[p.key], price: e.target.value } })} /></Field>
            <Field label="قیمت قبل از تخفیف (خط‌خورده)"><Input inputMode="numeric" value={prices[p.key]?.oldPrice ?? ""} onChange={(e) => setPrices({ ...prices, [p.key]: { ...prices[p.key], oldPrice: e.target.value } })} /></Field>
            <p className="text-xs text-stone-400">فعلی: {formatNumber(p.price)}</p></div>
        ))}</div>
        <div className="mt-4 flex justify-end"><Button onClick={savePrices}>ذخیره قیمت‌ها</Button></div>
      </Card>
      <Card className="overflow-x-auto">
        <p className="border-b border-stone-100 p-4 text-xs leading-6 text-stone-500">سلول‌های دارای حاشیه‌ی زرد با پیش‌فرض اسکریپت تفاوت دارند. «اختصاصی» یعنی نسخه‌ی ویژه‌ی همان امکان (مثلاً مینی‌وبسایت اختصاصی).</p>
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="bg-stone-50 text-xs text-stone-500"><th className="p-3 text-start">امکان</th>{data.plans.map((p) => <th key={p.key} className="w-40 p-3 text-center">{p.name}</th>)}</tr></thead>
          <tbody>{Object.entries(GROUPS).map(([g, meta]) => (
            <Fragment key={g}>
              <tr className="bg-stone-50/70"><td colSpan={4} className="p-2.5 text-xs font-extrabold">{meta.emoji} {meta.title}</td></tr>
              {FEATURES.filter((f) => f.group === g).map((f) => (
                <tr key={f.key} className="border-t border-stone-100"><td className="p-3">{f.label}</td>
                  {data.plans.map((p, i) => { const changed = data.overrides[p.key]?.[f.key] !== undefined && data.overrides[p.key][f.key] !== f.levels[i]; return (
                    <td key={p.key} className="p-2 text-center"><select value={(eff as any)[p.key][f.key]} onChange={(e) => set(p.key, f.key, e.target.value === f.levels[i] ? null : (e.target.value as Level))} className={cn("rounded-lg border-0 px-2 py-1.5 text-xs font-semibold ring-1", (eff as any)[p.key][f.key] === "no" ? "bg-rose-50 text-rose-700 ring-rose-200" : (eff as any)[p.key][f.key] === "custom" ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200", changed && "ring-2 ring-amber-400")}><option value="yes">دارد</option><option value="no">ندارد</option><option value="custom">اختصاصی</option></select></td>); })}
                </tr>
              ))}
            </Fragment>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}
