"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { useFeatures } from "@/components/features";
import Link from "next/link";
import type { Settings } from "@/lib/plans";
import { toFa } from "@/lib/format";
import { MapPicker } from "@/components/map-picker";
import { CashbackSettingsCard } from "@/components/cashback-settings";
import { ImageUpload } from "@/components/image-upload";
import { Button, Card, Field, Icon, Input, PageHeader, Select, Skeleton, Switch, Textarea, cn, useToast , EmojiIcon, IconText} from "@/components/ui";

type Biz = {
  name: string; slug: string; type: string; description: string; phone: string; address: string; instagram: string;
  accentColor: string; logoEmoji: string; logoUrl: string; lat: number | null; lng: number | null; taxPercent: number; servicePercent: number; acceptOrders: boolean;
  settings: Settings;
};

type Category = { id: number; name: string; isActive: boolean };
const WEEK = [
  { day: 6, label: "شنبه" }, { day: 0, label: "یکشنبه" }, { day: 1, label: "دوشنبه" },
  { day: 2, label: "سه‌شنبه" }, { day: 3, label: "چهارشنبه" }, { day: 4, label: "پنجشنبه" }, { day: 5, label: "جمعه" },
];
const DEFAULT_HOURS = WEEK.map(({ day }) => ({ day, open: true, start: "09:00", end: "22:00" }));
const DEFAULT_MENUS = [
  { id: "breakfast", name: "صبحانه", enabled: false, start: "07:00", end: "11:00", days: [], categoryIds: [] },
  { id: "lunch", name: "ناهار", enabled: false, start: "11:00", end: "16:00", days: [], categoryIds: [] },
  { id: "dinner", name: "شام", enabled: false, start: "16:00", end: "23:00", days: [], categoryIds: [] },
];
const subscribeNoop = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

const COLORS = ["#f97316", "#ef4444", "#e11d48", "#8b5cf6", "#3b82f6", "#0d9488", "#16a34a", "#44403c"];
const LOGOS = ["", "", "", "", "", "", "", "", "", ""];
const TYPES: Record<string, string> = { cafe: "کافه", restaurant: "رستوران", fastfood: "فست‌فود", bakery: "نان و شیرینی", shop: "فروشگاه / کاتالوگ" };

export default function SettingsPage() {
  const features = useFeatures();
  const toast = useToast();
  const [biz, setBiz] = useState<Biz | null>(null);
  const [saved, setSaved] = useState<Biz | null>(null);
  const [saving, setSaving] = useState(false);
  const origin = useSyncExternalStore(subscribeNoop, getOrigin, getServerOrigin);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    api<{ item: Biz }>("/api/business").then((r) => {
      const item = { ...r.item, settings: r.item.settings ?? {} };
      setBiz(item);
      setSaved(item);
    });
    api<{ items: Category[] }>("/api/categories").then((r) => setCategories(r.items)).catch(() => {});
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
  const setSettings = (patch: Partial<Settings>) => setBiz({ ...biz, settings: { ...biz.settings, ...patch } });
  const hours = biz.settings.operatingHours ?? { enabled: false, days: DEFAULT_HOURS };
  const hourDays = hours.days?.length ? hours.days : DEFAULT_HOURS;
  const menus = biz.settings.scheduledMenus?.length ? biz.settings.scheduledMenus : DEFAULT_MENUS;
  const reservation = { enabled: true, requireDeposit: false, depositPerGuest: 0, durationMinutes: 90, ...biz.settings.reservations };
  const cardTransfer = { enabled: false, cardNumber: "", accountHolder: "", bankName: "", instructions: "", ...biz.settings.cardTransfer };
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-bold">ساعت کاری</h2><p className="mt-1 text-xs leading-6 text-stone-500">سفارش آنلاین فقط در این بازه پذیرفته می‌شود؛ پیش‌سفارش برای زمان باز بودن هم بررسی خواهد شد.</p></div>
              <Switch checked={!!hours.enabled} onChange={(enabled) => setSettings({ operatingHours: { enabled, days: hourDays } })} label="اعمال ساعت کاری" />
            </div>
            {hours.enabled && <div className="space-y-2">
              {WEEK.map(({ day, label }) => {
                const row = hourDays.find((x) => x.day === day) ?? { day, open: false, start: "09:00", end: "22:00" };
                return <div key={day} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-xl bg-stone-50 p-2.5 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={row.open} onChange={(e) => setSettings({ operatingHours: { ...hours, days: hourDays.map((x) => x.day === day ? { ...x, open: e.target.checked } : x) } })} /><span className="font-semibold">{label}</span></label>
                  <Input type="time" aria-label={`شروع ${label}`} disabled={!row.open} className="h-9 w-28 px-2" value={row.start} onChange={(e) => setSettings({ operatingHours: { ...hours, days: hourDays.map((x) => x.day === day ? { ...x, start: e.target.value } : x) } })} />
                  <span className="text-xs text-stone-400">تا</span>
                  <Input type="time" aria-label={`پایان ${label}`} disabled={!row.open} className="h-9 w-28 px-2" value={row.end} onChange={(e) => setSettings({ operatingHours: { ...hours, days: hourDays.map((x) => x.day === day ? { ...x, end: e.target.value } : x) } })} />
                </div>;
              })}
              <p className="text-[11px] leading-5 text-stone-400">منطقه زمانی محاسبه: تهران. برای ساعت کاری شبانه، ساعت پایان را قبل از شروع وارد کنید.</p>
            </div>}
          </Card>

          <Card className="p-5">
            <div className="mb-4"><h2 className="font-bold">منوهای زمان‌دار</h2><p className="mt-1 text-xs leading-6 text-stone-500">دسته‌های انتخاب‌شده فقط در ساعت منوی مربوط نمایش داده می‌شوند؛ دسته‌های بدون زمان‌بندی همیشه در منو می‌مانند.</p></div>
            <div className="space-y-4">
              {menus.map((menu, index) => <section key={menu.id} className="space-y-3 rounded-2xl bg-stone-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold">{menu.name}</h3><p className="text-[11px] text-stone-500">بازه‌ی نمایش منو</p></div><Switch checked={menu.enabled} onChange={(enabled) => setSettings({ scheduledMenus: menus.map((m, i) => i === index ? { ...m, enabled } : m) })} label={`فعال‌سازی ${menu.name}`} /></div>
                <div className="grid gap-3 sm:grid-cols-2"><Field label="از"><Input type="time" value={menu.start} onChange={(e) => setSettings({ scheduledMenus: menus.map((m, i) => i === index ? { ...m, start: e.target.value } : m) })} /></Field><Field label="تا"><Input type="time" value={menu.end} onChange={(e) => setSettings({ scheduledMenus: menus.map((m, i) => i === index ? { ...m, end: e.target.value } : m) })} /></Field></div>
                {categories.length === 0 ? <p className="text-xs text-stone-500">برای زمان‌بندی، ابتدا دسته‌بندی منو بسازید.</p> : <div className="flex flex-wrap gap-2">{categories.filter((c) => c.isActive).map((category) => {
                  const checked = menu.categoryIds.includes(category.id);
                  return <label key={category.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs ring-1", checked ? "bg-brand-50 text-brand-800 ring-brand-300" : "bg-white ring-stone-200")}><input type="checkbox" checked={checked} onChange={() => setSettings({ scheduledMenus: menus.map((m, i) => i === index ? { ...m, categoryIds: checked ? m.categoryIds.filter((id) => id !== category.id) : [...m.categoryIds, category.id] } : m) })} />{category.name}</label>;
                })}</div>}
              </section>)}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">رزرو میز</h2><p className="mt-1 text-xs leading-6 text-stone-500">ماژول رزرو در پلن پایه فعال نیست و به‌صورت مستقل در تعرفه‌ها ارائه می‌شود.</p></div>{!features.has("reservations") && <Link href="/dashboard/plan?locked=reservations" className="text-xs font-bold text-brand-700 underline">مشاهده تعرفه‌ها</Link>}</div>
            {features.has("reservations") ? <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3"><div><p className="text-sm font-semibold">پذیرش رزرو آنلاین</p><p className="text-xs text-stone-500">پیوند رزرو در منوی مشتری نمایش داده می‌شود.</p></div><Switch checked={reservation.enabled} onChange={(enabled) => setSettings({ reservations: { ...reservation, enabled } })} label="رزرو میز" /></div>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-stone-50 px-4 py-3"><div><p className="text-sm font-semibold">دریافت پیش‌پرداخت</p><p className="text-xs text-stone-500">در صورت فعال‌بودن، رزرو تا ثبت دریافت مبلغ در انتظار می‌ماند.</p></div><Switch checked={reservation.requireDeposit} disabled={!reservation.enabled} onChange={(requireDeposit) => setSettings({ reservations: { ...reservation, requireDeposit } })} label="پیش‌پرداخت رزرو" /></div>
              {reservation.requireDeposit && <Field label="پیش‌پرداخت به‌ازای هر نفر (تومان)"><Input inputMode="numeric" value={String(reservation.depositPerGuest)} onChange={(e) => setSettings({ reservations: { ...reservation, depositPerGuest: Number(e.target.value.replace(/\D/g, "")) || 0 } })} /></Field>}
              <Field label="مدت هر رزرو (دقیقه)" hint="برای محاسبه‌ی ظرفیت میزها استفاده می‌شود."><Input inputMode="numeric" value={String(reservation.durationMinutes)} onChange={(e) => setSettings({ reservations: { ...reservation, durationMinutes: Number(e.target.value.replace(/\D/g, "")) || 90 } })} /></Field>
            </div> : <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-800">دسترسی این ماژول را مدیر سامانه از تنظیم تعرفه‌ها فعال می‌کند.</p>}
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
                <span className="mb-2 block text-xs font-semibold text-stone-600">آیکن جایگزین لوگو</span>
                <div className="flex flex-wrap gap-2">
                  {LOGOS.map((e) => (
                    <button key={e} type="button" onClick={() => set("logoEmoji", e)} className={cn("flex size-11 items-center justify-center rounded-xl text-2xl transition", biz.logoEmoji === e ? "bg-brand-100 ring-2 ring-brand-400" : "bg-stone-100 hover:bg-stone-200")}>{e}</button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-2 block text-xs font-semibold text-stone-600">تصویر لوگوی کسب‌وکار</span>
                <ImageUpload value={biz.logoUrl ?? ""} emoji={biz.logoEmoji} label="لوگوی کسب‌وکار" description="لوگو در سربرگ پنل و منوی عمومی نمایش داده می‌شود؛ JPG، PNG، WebP یا GIF، حداکثر ۲٫۵ مگابایت." onChange={(logoUrl) => set("logoUrl", logoUrl)} />
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

          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-bold">پرداخت کارت‌به‌کارت</h2><p className="mt-1 text-xs leading-6 text-stone-500">اطلاعات کارت پس از ثبت سفارش به مشتری نمایش داده می‌شود؛ سفارش تا تأیید دریافت وجه در پنل در انتظار پرداخت می‌ماند.</p></div>
              <Switch checked={cardTransfer.enabled} onChange={(enabled) => setSettings({ cardTransfer: { ...cardTransfer, enabled } })} label="فعال‌سازی کارت‌به‌کارت" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="شماره کارت ۱۶ رقمی"><Input inputMode="numeric" dir="ltr" className="text-left" value={cardTransfer.cardNumber} onChange={(e) => setSettings({ cardTransfer: { ...cardTransfer, cardNumber: e.target.value } })} placeholder="0000 0000 0000 0000" /></Field>
              <Field label="نام صاحب کارت"><Input value={cardTransfer.accountHolder} onChange={(e) => setSettings({ cardTransfer: { ...cardTransfer, accountHolder: e.target.value } })} placeholder="نام و نام خانوادگی" /></Field>
              <Field label="نام بانک (اختیاری)"><Input value={cardTransfer.bankName} onChange={(e) => setSettings({ cardTransfer: { ...cardTransfer, bankName: e.target.value } })} placeholder="مثلاً ملت" /></Field>
              <Field label="توضیح برای مشتری (اختیاری)"><Input value={cardTransfer.instructions} onChange={(e) => setSettings({ cardTransfer: { ...cardTransfer, instructions: e.target.value } })} placeholder="شماره سفارش را در توضیحات انتقال بنویسید" /></Field>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-bold"><IconText>{<EmojiIcon emoji="" />}</IconText> موقعیت رستوران روی نقشه</h2><p className="mt-1 text-xs leading-6 text-stone-500">برای محاسبه‌ی فاصله و تعیین خودکار محدوده‌ی ارسال دلیوری لازم است.</p></div>{biz.lat != null && <Button size="sm" variant="ghost" onClick={() => setBiz({ ...biz, lat: null, lng: null })}>حذف</Button>}</div>
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
