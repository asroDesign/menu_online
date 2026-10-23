"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { formatPrice, toFa } from "@/lib/format";
import { AmountInput, Badge, Button, Card, EmptyState, ErrorState, Field, Icon, Input, PageHeader, Select, Skeleton, Switch, Textarea, useToast } from "@/components/ui";

type PrizeType = "fixed_amount" | "discount_code" | "free_items" | "no_prize" | "message";
type Prize = { id: number; title: string; prizeType: PrizeType; amount: number; discountCodeId: number | null; productIds: number[]; message: string; weight: number; isActive: boolean; dependencyAvailable: boolean };
type ChoiceProduct = { id: number; name: string; price: number };
type ChoiceCode = { id: number; code: string; type: string; value: number; minOrder: number };
type WheelData = { settings: { isEnabled: boolean; cooldownHours: number; rewardExpiresAfterDays: number }; prizes: Prize[]; products: ChoiceProduct[]; discountCodes: ChoiceCode[]; eligiblePrizeCount: number };
type PrizeDraft = { title: string; prizeType: PrizeType; amount: number; discountCodeId: string; productIds: number[]; message: string; weight: number };
const emptyDraft: PrizeDraft = { title: "", prizeType: "fixed_amount", amount: 50_000, discountCodeId: "", productIds: [], message: "", weight: 1 };
const prizeNames: Record<PrizeType, string> = { fixed_amount: "مبلغ ثابت", discount_code: "کد تخفیف", free_items: "آیتم رایگان", no_prize: "پوچ", message: "پیام ویژه" };

export default function LoyaltyWheel() {
  const toast = useToast();
  const [data, setData] = useState<WheelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [cooldownHours, setCooldownHours] = useState(24);
  const [expiryDays, setExpiryDays] = useState(30);
  const [draft, setDraft] = useState<PrizeDraft>(emptyDraft);
  const [editing, setEditing] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const applyData = useCallback((result: WheelData) => {
    setData(result);
    setEnabled(result.settings.isEnabled);
    setCooldownHours(result.settings.cooldownHours);
    setExpiryDays(result.settings.rewardExpiresAfterDays);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      applyData(await api<WheelData>("/api/loyalty-wheel"));
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, [applyData]);

  useEffect(() => {
    let live = true;
    api<WheelData>("/api/loyalty-wheel").then((result) => { if (live) applyData(result); })
      .catch((cause) => { if (live) setError((cause as Error).message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [applyData]);

  const totalWeight = useMemo(() => data?.prizes.filter((prize) => prize.isActive && prize.dependencyAvailable).reduce((sum, prize) => sum + prize.weight, 0) ?? 0, [data]);
  const validPrizeCount = data?.eligiblePrizeCount ?? 0;

  async function saveSettings() {
    setBusy(true);
    try {
      const result = await api<{ settings: WheelData["settings"] }>("/api/loyalty-wheel", { method: "PATCH", body: { isEnabled: enabled, cooldownHours, rewardExpiresAfterDays: expiryDays } });
      setData((current) => current ? { ...current, settings: result.settings } : current);
      toast(enabled ? "گردونه در منوی مشتری فعال شد" : "گردونه غیرفعال شد");
    } catch (cause) { toast((cause as Error).message, "error"); }
    finally { setBusy(false); }
  }

  function startCreate() { setEditing(null); setDraft(emptyDraft); setFormOpen(true); }
  function startEdit(prize: Prize) {
    setEditing(prize.id);
    setDraft({ title: prize.title, prizeType: prize.prizeType, amount: prize.amount, discountCodeId: prize.discountCodeId ? String(prize.discountCodeId) : "", productIds: prize.productIds ?? [], message: prize.message, weight: prize.weight });
    setFormOpen(true);
  }

  async function savePrize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const body = { ...draft, discountCodeId: draft.discountCodeId ? Number(draft.discountCodeId) : null };
      const result = editing
        ? await api<{ item: Prize }>(`/api/loyalty-wheel/prizes/${editing}`, { method: "PATCH", body: { ...body, isActive: data?.prizes.find((item) => item.id === editing)?.isActive ?? true } })
        : await api<{ item: Prize }>("/api/loyalty-wheel/prizes", { method: "POST", body });
      setData((current) => current ? { ...current, prizes: editing ? current.prizes.map((item) => item.id === result.item.id ? { ...result.item, dependencyAvailable: true } : item) : [{ ...result.item, dependencyAvailable: true }, ...current.prizes], eligiblePrizeCount: current.eligiblePrizeCount + (editing ? 0 : 1) } : current);
      setFormOpen(false);
      setDraft(emptyDraft);
      setEditing(null);
      toast(editing ? "جایزه ویرایش شد" : "جایزه به گردونه اضافه شد");
      void reload();
    } catch (cause) { toast((cause as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function togglePrize(prize: Prize) {
    setBusy(true);
    try {
      const body = { title: prize.title, prizeType: prize.prizeType, amount: prize.amount, discountCodeId: prize.discountCodeId, productIds: prize.productIds, message: prize.message, weight: prize.weight, isActive: !prize.isActive };
      const result = await api<{ item: Prize }>(`/api/loyalty-wheel/prizes/${prize.id}`, { method: "PATCH", body });
      setData((current) => current ? { ...current, prizes: current.prizes.map((item) => item.id === prize.id ? { ...result.item, dependencyAvailable: item.dependencyAvailable } : item) } : current);
      toast(prize.isActive ? "جایزه از گردونه خارج شد" : "جایزه به گردونه برگشت");
      void reload();
    } catch (cause) { toast((cause as Error).message, "error"); }
    finally { setBusy(false); }
  }

  if (loading && !data) return <div className="space-y-4"><Skeleton className="h-24 rounded-2xl"/><Skeleton className="h-56 rounded-2xl"/></div>;
  if (error && !data) return <ErrorState message={error} onRetry={() => void reload()} />;

  return <div className="animate-fade-in space-y-5">
    <PageHeader title="گردونهٔ شانس" subtitle="جایزه بسازید، احتمال نسبی آن را تعیین کنید و گردونه را به نویگیشن منوی مشتری اضافه کنید." actions={<Button onClick={startCreate}><Icon name="plus" className="size-4"/> افزودن جایزه</Button>} />
    <Card className="overflow-hidden border-0 bg-gradient-to-l from-violet-950 via-indigo-900 to-fuchsia-900 p-5 text-white shadow-xl sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20"><Icon name="sparkles" className="size-6 text-amber-300"/></span><div><h2 className="text-lg font-black">گردونه را در منوی مشتری نمایش بده</h2><p className="mt-1 max-w-2xl text-xs leading-6 text-white/75">دکمهٔ گردونه فقط وقتی تنظیم فعال باشد و حداقل یک جایزهٔ معتبر وجود داشته باشد، در نوار پایین منوی همان رستوران دیده می‌شود.</p></div></div>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/15"><Switch checked={enabled} onChange={setEnabled} label="فعال بودن گردونه"/><span className="hidden h-8 w-px bg-white/20 sm:block"/><Button variant="secondary" className="border-white/20 bg-white text-violet-950 hover:bg-white/90" loading={busy} onClick={() => void saveSettings()}>ذخیره وضعیت</Button></div>
      </div>
      <div className="mt-5 grid gap-3 border-t border-white/15 pt-4 sm:grid-cols-2">
        <Field label="فاصلهٔ مجاز بین چرخش‌ها (ساعت)" className="text-white"><Input type="number" min={1} max={720} value={cooldownHours} onChange={(event) => setCooldownHours(Number(event.target.value))} className="border-white/15 bg-white/10 text-white"/></Field>
        <Field label="اعتبار جایزهٔ برنده (روز)" className="text-white"><Input type="number" min={1} max={365} value={expiryDays} onChange={(event) => setExpiryDays(Number(event.target.value))} className="border-white/15 bg-white/10 text-white"/></Field>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-white/65">چرخش فقط بعد از ورود امن مشتری با OTP انجام می‌شود. مبلغ جایزه، کد تخفیف یا آیتم رایگان هنگام ثبت سفارش در سمت سرور بررسی و مصرف می‌شود.</p>
    </Card>

    {formOpen && <Card className="border-violet-200 p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-extrabold">{editing ? "ویرایش جایزه" : "جایزهٔ جدید"}</h2><p className="mt-1 text-xs leading-5 text-base-content/60">وزن بالاتر یعنی احتمال بیشتر؛ شانس نمایش‌داده‌شده بین جوایز معتبر فعال محاسبه می‌شود.</p></div><Button size="sm" variant="ghost" onClick={() => setFormOpen(false)}><Icon name="x" className="size-4"/> بستن</Button></div>
      <form className="space-y-4" onSubmit={(event) => void savePrize(event)}>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="عنوانی که روی گردونه دیده می‌شود"><Input required maxLength={80} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="مثلاً ۵۰ هزار تومان تخفیف"/></Field><Field label="نوع جایزه"><Select value={draft.prizeType} onChange={(event) => setDraft((current) => ({ ...current, prizeType: event.target.value as PrizeType }))}>{Object.entries(prizeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field></div>
        {draft.prizeType === "fixed_amount" && <Field label="مبلغ جایزه (تومان)"><AmountInput min={1} value={draft.amount} onValueChange={(value) => setDraft((current) => ({ ...current, amount: Number(value) || 0 }))}/></Field>}
        {draft.prizeType === "discount_code" && <Field label="کد تخفیف فعال"><Select required value={draft.discountCodeId} onChange={(event) => setDraft((current) => ({ ...current, discountCodeId: event.target.value }))}><option value="">انتخاب کد تخفیف…</option>{data?.discountCodes.map((coupon) => <option key={coupon.id} value={coupon.id}>{coupon.code} · {coupon.type === "percent" ? `${toFa(coupon.value)}٪` : formatPrice(coupon.value)}{coupon.minOrder ? ` · حداقل ${formatPrice(coupon.minOrder)}` : ""}</option>)}</Select>{!data?.discountCodes.length && <p className="mt-1 text-[11px] text-amber-700">کد تخفیف فعال و دارای ظرفیت پیدا نشد؛ ابتدا در بخش کد تخفیف یک کد بسازید.</p>}</Field>}
        {draft.prizeType === "free_items" && <fieldset className="space-y-2"><legend className="mb-2 text-sm font-bold">یک تا ۱۰ محصول رایگان انتخاب کنید</legend>{data?.products.length ? <div className="grid max-h-56 gap-2 overflow-auto rounded-xl border border-base-300 p-2 sm:grid-cols-2">{data.products.map((product) => <label key={product.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-base-200/50 p-2.5 text-xs"><input type="checkbox" checked={draft.productIds.includes(product.id)} disabled={!draft.productIds.includes(product.id) && draft.productIds.length >= 10} onChange={(event) => setDraft((current) => ({ ...current, productIds: event.target.checked ? [...current.productIds, product.id] : current.productIds.filter((id) => id !== product.id) }))}/><span className="min-w-0 flex-1 truncate font-bold">{product.name}</span><span className="shrink-0 text-base-content/60">{formatPrice(product.price)}</span></label>)}</div> : <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">محصول قابل استفاده پیدا نشد. محصول باید فعال، قیمت‌دار، تعدادی و بدون گزینهٔ اجباری باشد.</p>}</fieldset>}
        {draft.prizeType === "message" && <Field label="متن پیام برنده"><Textarea required maxLength={300} rows={3} value={draft.message} onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))} placeholder="مثلاً ممنون که مشتری ما هستید؛ دفعه بعد منتظر جایزه باشید."/></Field>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label="وزن شانس" hint="عدد صحیح از ۱ تا ۱۰٬۰۰۰؛ برای پوچ هم می‌توان وزن تعیین کرد."><Input required type="number" inputMode="numeric" min={1} max={10000} value={draft.weight} onChange={(event) => setDraft((current) => ({ ...current, weight: Number(event.target.value) }))}/></Field><div className="flex items-end pb-2 text-xs text-base-content/60">{totalWeight > 0 && draft.weight > 0 ? `احتمال تقریبی: ${toFa((draft.weight / (totalWeight + (editing ? 0 : draft.weight)) * 100).toFixed(1))}٪` : "احتمال پس از ذخیره محاسبه می‌شود."}</div></div>
        <div className="flex justify-end gap-2 border-t border-base-200 pt-3"><Button variant="ghost" type="button" onClick={() => setFormOpen(false)}>انصراف</Button><Button loading={busy} type="submit" disabled={draft.prizeType === "discount_code" && !draft.discountCodeId || draft.prizeType === "free_items" && draft.productIds.length === 0}>ذخیره جایزه</Button></div>
      </form>
    </Card>}

    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-black">جایزه‌های گردونه</h2><p className="mt-1 text-xs text-base-content/60">{toFa(data?.prizes.length ?? 0)} جایزه · {toFa(validPrizeCount)} مورد معتبر برای نمایش</p></div><Button variant="secondary" size="sm" onClick={() => void reload()}><Icon name="refresh" className="size-4"/> تازه‌سازی</Button></div>
    {error && <ErrorState message={error} onRetry={() => void reload()}/>}
    {!data?.prizes.length ? <EmptyState icon="sparkles" title="هنوز جایزه‌ای تعریف نشده" description="اولین جایزه را اضافه کنید؛ بعد گردونه را فعال و در منوی مشتری نمایش دهید." action={<Button onClick={startCreate}><Icon name="plus" className="size-4"/> افزودن جایزه</Button>}/> : <div className="grid gap-3 xl:grid-cols-2">{data.prizes.map((prize) => {
      const chance = totalWeight > 0 && prize.isActive && prize.dependencyAvailable ? prize.weight / totalWeight * 100 : 0;
      return <Card key={prize.id} className="space-y-3 p-4">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700"><Icon name={prize.prizeType === "no_prize" ? "circleX" : prize.prizeType === "message" ? "message" : "award"} className="size-5"/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{prize.title}</h3><Badge color={prize.isActive ? "violet" : "stone"}>{prize.isActive ? "فعال" : "غیرفعال"}</Badge><Badge color="blue">{prizeNames[prize.prizeType]}</Badge></div><p className="mt-1 text-xs text-base-content/60">{prize.prizeType === "fixed_amount" ? formatPrice(prize.amount) : prize.prizeType === "discount_code" ? data.discountCodes.find((coupon) => coupon.id === prize.discountCodeId)?.code ?? `کد #${prize.discountCodeId}` : prize.prizeType === "free_items" ? (prize.productIds ?? []).map((id) => data.products.find((product) => product.id === id)?.name ?? `محصول #${id}`).join("، ") : prize.prizeType === "message" ? prize.message : "بدون جایزه"}</p></div><Button size="sm" variant="ghost" onClick={() => startEdit(prize)} aria-label="ویرایش"><Icon name="edit" className="size-4"/></Button></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-200 pt-3"><div className="flex gap-4 text-xs"><span><b>{toFa(prize.weight)}</b> وزن</span><span><b>{toFa(chance.toFixed(1))}٪</b> احتمال فعلی</span></div><div className="flex items-center gap-2">{!prize.dependencyAvailable && <span className="text-[11px] font-semibold text-amber-700">وابستگی حذف یا غیرفعال شده</span>}<Switch checked={prize.isActive} onChange={() => void togglePrize(prize)} label={prize.isActive ? "فعال" : "غیرفعال"}/></div></div>
      </Card>;
    })}</div>}
    <Card className="flex items-start gap-3 border-blue-200 bg-blue-50/50 p-4"><Icon name="shield" className="mt-0.5 size-5 shrink-0 text-blue-700"/><p className="text-xs leading-6 text-blue-950">هر مشتری برای چرخش باید شماره‌اش را با کد یک‌بارمصرف تأیید کرده باشد. نتیجه به حساب همان مشتری و همان رستوران متصل است؛ جایزه‌های نقدی، تخفیف و اقلام رایگان در سمت سرور دوباره بررسی می‌شوند و یک بار در سفارش بعدی قابل استفاده‌اند.</p></Card>
  </div>;
}
