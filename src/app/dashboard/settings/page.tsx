"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toFa } from "@/lib/format";
import { MapPicker } from "@/components/map-picker";
import { CashbackSettingsCard } from "@/components/cashback-settings";
import { Button, Card, Field, Icon, Input, PageHeader, Select, Skeleton, Switch, Textarea, cn, useToast } from "@/components/ui";

type Biz = {
  name: string; slug: string; type: string; description: string; phone: string; address: string; instagram: string;
  accentColor: string; logoEmoji: string; lat: number | null; lng: number | null; taxPercent: number; servicePercent: number; acceptOrders: boolean;
};

const COLORS = ["#f97316", "#ef4444", "#e11d48", "#8b5cf6", "#3b82f6", "#0d9488", "#16a34a", "#44403c"];
const LOGOS = ["☕", "🍕", "🍔", "🌸", "🍰", "🥗", "🍣", "🍽️", "🧁", "🥐"];
const TYPES: Record<string, string> = { cafe: "کافه", restaurant: "رستوران", fastfood: "فست‌فود", bakery: "نان و شیرینی", shop: "فروشگاه / کاتالوگ" };

export default function SettingsPage() {
  const toast = useToast();
  const [biz, setBiz] = useState<Biz | null>(null);
  const [saved, setSaved] = useState<Biz | null>(null);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(location.origin);  
    api<{ item: Biz }>("/api/business").then((r) => {
      setBiz(r.item);
      setSaved(r.item);
    });
  }, []);

  if (!biz || !saved)
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-60 rounded-2xl" />
      </div>
    );

  const set = <K extends keyof Biz>(k: K, v: Biz[K]) => setBiz({ ...biz, [k]: v });
  const dirty = JSON.stringify(biz) !== JSON.stringify(saved);
  const url = `${origin}/m/${biz.slug}`;

  async function save() {
    if (!biz) return;
    setSaving(true);
    try {
      const { item } = await api<{ item: Biz }>("/api/business", { method: "PATCH", body: biz });
      setBiz(item);
      setSaved(item);
      toast("تنظیمات ذخیره شد");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in pb-20">
      <PageHeader title="تنظیمات" subtitle="اطلاعات کسب‌وکار، ظاهر منو و قوانین سفارش‌گیری" />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 font-bold">اطلاعات کسب‌وکار</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="نام کسب‌وکار *"><Input value={biz.name} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="نوع فعالیت">
                <Select value={biz.type} onChange={(e) => set("type", e.target.value)}>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="معرفی کوتاه" className="sm:col-span-2"><Textarea rows={3} value={biz.description} onChange={(e) => set("description", e.target.value)} /></Field>
              <Field label="تلفن"><Input value={biz.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
              <Field label="اینستاگرام"><Input dir="ltr" className="text-left" value={biz.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="username" /></Field>
              <Field label="آدرس" className="sm:col-span-2"><Input value={biz.address} onChange={(e) => set("address", e.target.value)} /></Field>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 font-bold">ظاهر منوی دیجیتال</h2>
            <div className="space-y-5">
              <div>
                <span className="mb-2 block text-xs font-semibold text-stone-600">رنگ اصلی منو</span>
                <div className="flex flex-wrap gap-2.5">
                  {COLORS.map((c) => (
                    <button key={c} type="button" aria-label={c} onClick={() => set("accentColor", c)} style={{ background: c }} className={cn("size-9 rounded-full transition", biz.accentColor === c ? "ring-2 ring-stone-900 ring-offset-2" : "hover:scale-110")} />
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-2 block text-xs font-semibold text-stone-600">لوگو (ایموجی)</span>
                <div className="flex flex-wrap gap-2">
                  {LOGOS.map((e) => (
                    <button key={e} type="button" onClick={() => set("logoEmoji", e)} className={cn("flex size-11 items-center justify-center rounded-xl text-2xl transition", biz.logoEmoji === e ? "bg-brand-100 ring-2 ring-brand-400" : "bg-stone-100 hover:bg-stone-200")}>{e}</button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 font-bold">سفارش‌گیری و صورت‌حساب</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="مالیات بر ارزش افزوده (٪)"><Input inputMode="numeric" value={String(biz.taxPercent)} onChange={(e) => set("taxPercent", Number(e.target.value.replace(/\D/g, "")) || 0)} /></Field>
              <Field label="هزینه خدمات (٪)"><Input inputMode="numeric" value={String(biz.servicePercent)} onChange={(e) => set("servicePercent", Number(e.target.value.replace(/\D/g, "")) || 0)} /></Field>
              <div className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3 sm:col-span-2">
                <div>
                  <p className="text-sm font-semibold">سفارش آنلاین مشتری</p>
                  <p className="text-xs text-stone-500">اگر خاموش باشد، منو فقط برای مشاهده است</p>
                </div>
                <Switch checked={biz.acceptOrders} onChange={(v) => set("acceptOrders", v)} label="سفارش آنلاین" />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-bold">📍 موقعیت رستوران روی نقشه</h2><p className="mt-1 text-xs leading-6 text-stone-500">برای محاسبه‌ی فاصله و تعیین خودکار محدوده‌ی ارسال دلیوری لازم است.</p></div>{biz.lat != null && <Button size="sm" variant="ghost" onClick={() => setBiz({ ...biz, lat: null, lng: null })}>حذف</Button>}</div>
            <MapPicker height={300} value={biz.lat != null && biz.lng != null ? { lat: biz.lat, lng: biz.lng } : null} onChange={(lat, lng) => setBiz((b) => (b ? { ...b, lat, lng } : b))} />
          </Card>

          <CashbackSettingsCard />
        </div>

        <div className="space-y-5">
          <Card className="p-5 text-center">
            <h2 className="mb-4 text-start font-bold">لینک و QR منو</h2>
            <div className="inline-block rounded-2xl border-2 border-dashed border-brand-300 p-4">
              <QRCodeSVG value={url} size={170} marginSize={0} fgColor="#1c1917" />
            </div>
            <Field label="آدرس اختصاصی منو" className="mt-4 text-start" hint="فقط حروف انگلیسی کوچک، عدد و خط تیره">
              <div className="flex items-center overflow-hidden rounded-xl ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-brand-400" dir="ltr">
                <span className="bg-stone-50 px-2.5 py-2.5 text-xs text-stone-400">/m/</span>
                <input className="h-10 flex-1 border-0 bg-white px-2 text-sm outline-none" value={biz.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} />
              </div>
            </Field>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => navigator.clipboard.writeText(url).then(() => toast("لینک کپی شد"))}><Icon name="copy" className="size-4" /> کپی</Button>
              <a href={url} target="_blank" className="flex-1"><Button variant="dark" size="sm" className="w-full"><Icon name="external" className="size-4" /> مشاهده</Button></a>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 font-bold">پیش‌نمایش صورت‌حساب</h2>
            <p className="text-sm leading-7 text-stone-500">
              روی هر سفارش {toFa(biz.taxPercent)}٪ مالیات{biz.servicePercent ? ` و ${toFa(biz.servicePercent)}٪ هزینه خدمات` : ""} اضافه می‌شود.
            </p>
          </Card>
        </div>
      </div>

      <div className={cn("fixed inset-x-0 bottom-0 z-30 flex justify-center p-4 transition-all lg:ps-64", dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-8 opacity-0")}>
        <div className="flex items-center gap-3 rounded-2xl bg-stone-900 px-4 py-2.5 text-white shadow-2xl">
          <span className="text-sm">تغییرات ذخیره نشده</span>
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={() => setBiz(saved)}>بازگشت</Button>
          <Button size="sm" loading={saving} onClick={save}>ذخیره</Button>
        </div>
      </div>
    </div>
  );
}
