"use client";
import { Fragment, useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { FEATURES, GROUPS, resolveFeatures, type Level } from "@/lib/plans";
import { Badge, Button, Card, ConfirmDialog, Field, Icon, IconButton, Input, Modal, Select, Skeleton, Switch, cn, useToast, EmojiIcon } from "@/components/ui";
import { pricePlan, type PricedPlan } from "@/lib/plan-pricing";
import { useGet } from "@/components/admin/common";
import { JalaliInput } from "@/components/jalali-input";
import { toFa } from "@/lib/format";

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
  const [section, setSection] = useState<"plans" | "coupons">("plans");
  const eff = useMemo(() => (data ? Object.fromEntries(data.plans.map((p) => [p.key, resolveFeatures(p.key, {}, data.overrides)])) : {}), [data]);
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  async function set(plan: string, feature: string, level: Level | null) {
    const prev = data!;
    setData((d) => { if (!d) return d; const o = { ...d.overrides, [plan]: { ...(d.overrides[plan] ?? {}) } }; if (level === null) delete o[plan][feature]; else o[plan][feature] = level; return { ...d, overrides: o }; });
    try { await api("/api/admin/plans", { method: "POST", body: { plan, feature, level } }); toast("ماتریس پلن به‌روز شد"); } catch (e) { setData(prev); toast((e as Error).message, "error"); }
  }
  return (
    <div className="animate-fade-in space-y-5">
      <div><h1 className="text-xl font-extrabold sm:text-2xl">پلن‌ها و قیمت‌ها</h1><p className="mt-1 text-sm text-stone-500">مدیریت تعرفه‌ها، دسترسی امکانات و کدهای تخفیف اشتراک</p></div>
      <div className="flex gap-2"><Button variant={section === "plans" ? "primary" : "secondary"} onClick={() => setSection("plans")}>تعرفه و امکانات</Button><Button variant={section === "coupons" ? "primary" : "secondary"} onClick={() => setSection("coupons")}>کدهای تخفیف</Button></div>
      {section === "coupons" ? <CouponManager plans={data.plans} /> : <>
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
      </>}
    </div>
  );
}

function CouponManager({ plans }: { plans: PricedPlan[] }) {
  const toast = useToast();
  const { data, error, loading, reload } = useGet<{ items: any[] }>("/api/admin/coupons");
  const [form, setForm] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const body = { code: form.code, kind: form.kind, value: Number(form.value), planKeys: form.planKeys, startsAt: form.startsAt || null, endsAt: form.endsAt || null, maxRedemptions: form.maxRedemptions || null, isActive: form.isActive };
      if (form.id) await api(`/api/admin/coupons/${form.id}`, { method: "PATCH", body }); else await api("/api/admin/coupons", { method: "POST", body });
      toast(form.id ? "کد تخفیف ویرایش شد" : "کد تخفیف ساخته شد"); setForm(null); await reload(true);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  }
  const fresh = () => ({ code: "", kind: "percent", value: "10", planKeys: [] as string[], startsAt: "", endsAt: "", maxRedemptions: "", isActive: true });
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">کدهای تخفیف خرید و تمدید</h3><p className="mt-1 text-xs text-stone-500">کد درصدی یا مبلغ ثابت؛ قابل محدودسازی برای پلن، تاریخ اعتبار و تعداد استفاده</p></div><Button onClick={() => setForm(fresh())}><Icon name="plus" className="size-4" /> کد جدید</Button></div>
    {error ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : loading && !data ? <Skeleton className="h-40 rounded-2xl" /> : !data?.items.length ? <Card className="p-8 text-center text-sm text-stone-500">هنوز کد تخفیفی تعریف نشده است.</Card> : <Card className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b bg-stone-50 text-xs text-stone-500"><th className="p-3 text-start">کد</th><th className="p-3 text-start">تخفیف</th><th className="p-3 text-start">پلن‌ها</th><th className="p-3 text-start">اعتبار</th><th className="p-3 text-start">استفاده</th><th className="p-3 text-start">وضعیت</th><th className="p-3" /></tr></thead><tbody className="divide-y">{data.items.map((c) => <tr key={c.id}><td className="p-3 font-mono font-bold">{c.code}</td><td className="p-3">{toFa(c.value)}{c.kind === "percent" ? "٪" : " تومان"}</td><td className="p-3 text-xs">{c.planKeys.length ? plans.filter((p) => c.planKeys.includes(p.key)).map((p) => p.name).join("، ") : "همه پلن‌ها"}</td><td className="p-3 text-xs">{c.startsAt ? new Date(c.startsAt).toLocaleDateString("fa-IR-u-ca-persian") : "بدون شروع"} تا {c.endsAt ? new Date(c.endsAt).toLocaleDateString("fa-IR-u-ca-persian") : "بدون پایان"}</td><td className="p-3">{toFa(c.redemptions)}{c.maxRedemptions ? ` / ${toFa(c.maxRedemptions)}` : " / ∞"}</td><td className="p-3"><Badge color={c.isActive ? "emerald" : "stone"}>{c.isActive ? "فعال" : "غیرفعال"}</Badge></td><td className="p-2"><div className="flex justify-end gap-1"><IconButton icon="edit" label="ویرایش" onClick={() => setForm({ ...c, value: String(c.value), maxRedemptions: c.maxRedemptions ? String(c.maxRedemptions) : "", startsAt: c.startsAt ?? "", endsAt: c.endsAt ?? "" })} /><IconButton icon="trash" label="غیرفعال‌سازی" className="hover:text-rose-600" onClick={() => setDeleting(c)} /></div></td></tr>)}</tbody></table></Card>}
    <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "ویرایش کد تخفیف" : "کد تخفیف جدید"} footer={<><Button variant="ghost" onClick={() => setForm(null)}>انصراف</Button><Button loading={saving} onClick={save} disabled={!form?.code?.trim()}>ذخیره کد تخفیف</Button></>}>
      {form && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="کد"><Input dir="ltr" className="text-left uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="NOWRUZ20" /></Field><Field label="نوع تخفیف"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="percent">درصدی</option><option value="fixed">مبلغ ثابت</option></Select></Field><Field label={form.kind === "percent" ? "درصد تخفیف" : "مبلغ تخفیف (تومان)"}><Input type="number" min="1" max={form.kind === "percent" ? 100 : undefined} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field><Field label="حداکثر استفاده (خالی = نامحدود)"><Input type="number" min="1" value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} /></Field><Field label="شروع اعتبار شمسی"><JalaliInput value={form.startsAt} onChange={(v) => setForm({ ...form, startsAt: v })} /></Field><Field label="پایان اعتبار شمسی"><JalaliInput end value={form.endsAt} onChange={(v) => setForm({ ...form, endsAt: v })} /></Field></div><div className="space-y-2"><p className="text-sm font-semibold">پلن‌های مجاز (بدون انتخاب = همه)</p><div className="flex flex-wrap gap-2">{plans.map((p) => <label key={p.key} className="flex cursor-pointer items-center gap-2 rounded-xl border border-base-300 px-3 py-2 text-sm"><input type="checkbox" checked={form.planKeys.includes(p.key)} onChange={(e) => setForm({ ...form, planKeys: e.target.checked ? [...form.planKeys, p.key] : form.planKeys.filter((x: string) => x !== p.key) })} />{p.name}</label>)}</div></div><Switch checked={form.isActive} label="کد فعال باشد" onChange={(v) => setForm({ ...form, isActive: v })} /></div>}
    </Modal>
    <ConfirmDialog open={!!deleting} title="غیرفعال‌کردن کد" message={deleting ? `کد ${deleting.code} برای پرداخت‌های جدید غیرفعال می‌شود.` : ""} confirmLabel="غیرفعال کن" onClose={() => setDeleting(null)} onConfirm={async () => { try { await api(`/api/admin/coupons/${deleting.id}`, { method: "DELETE" }); toast("کد غیرفعال شد"); setDeleting(null); await reload(true); } catch (e) { toast((e as Error).message, "error"); } }} />
  </div>;
}
