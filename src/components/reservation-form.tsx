"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { formatPrice, toFa } from "@/lib/format";
import { Button, Icon, Input, PersianDateInput, Textarea } from "@/components/ui";

type Settings = { requireDeposit: boolean; depositPerGuest: number; durationMinutes: number };

export function ReservationForm({ slug, businessName, settings, accentColor }: { slug: string; businessName: string; settings: Settings; accentColor: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [startsAt, setStartsAt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ id: number; depositAmount: number } | null>(null);
  const deposit = settings.requireDeposit ? settings.depositPerGuest * guestCount : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!startsAt) { setError("تاریخ و ساعت را انتخاب کنید."); return; }
    setBusy(true);
    try {
      const { item } = await api<{ item: { id: number; depositAmount: number } }>(`/api/public/${slug}/reservations`, {
        method: "POST",
        body: { name, phone, guestCount, startsAt: new Date(startsAt).toISOString(), note },
      });
      setDone(item);
    } catch (e) {
      setError((e as Error).message || "ثبت درخواست رزرو انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return (
    <div className="mt-6 rounded-2xl bg-success/10 p-5 text-center text-success">
      <Icon name="circleCheck" className="mx-auto size-10" />
      <h2 className="mt-3 text-lg font-extrabold">درخواست رزرو ثبت شد</h2>
      <p className="mt-2 text-sm leading-7">کد پیگیری: <b dir="ltr">{toFa(done.id)}</b></p>
      {done.depositAmount > 0
        ? <p className="mt-2 text-sm leading-7">رزرو پس از هماهنگی و ثبت پیش‌پرداخت {formatPrice(done.depositAmount)} توسط {businessName} قطعی می‌شود.</p>
        : <p className="mt-2 text-sm leading-7">رستوران پس از بررسی ظرفیت، رزرو را تأیید می‌کند.</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1.5 block text-xs font-semibold">نام و نام خانوادگی</span><Input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold">شماره موبایل</span><Input required inputMode="tel" dir="ltr" className="text-left" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="0912…" /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1.5 block text-xs font-semibold">تعداد مهمان</span><Input required type="number" min={1} max={30} value={guestCount} onChange={(e) => setGuestCount(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} /></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold">تاریخ و ساعت شمسی</span><PersianDateInput className="w-full" value={startsAt} onChange={setStartsAt} withTime required placeholder="انتخاب روز و ساعت" /></label>
      </div>
      <label className="block"><span className="mb-1.5 block text-xs font-semibold">توضیحات (اختیاری)</span><Textarea rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً صندلی کودک یا مناسبت خاص" /></label>
      <div className="rounded-xl bg-base-200/70 p-3 text-sm leading-6">
        <p>مدت رزرو: <b>{toFa(settings.durationMinutes)} دقیقه</b></p>
        {settings.requireDeposit
          ? <p className="mt-1">پیش‌پرداخت: <b>{formatPrice(deposit)}</b> ({formatPrice(settings.depositPerGuest)} به‌ازای هر نفر)</p>
          : <p className="mt-1">برای این رزرو پیش‌پرداخت دریافت نمی‌شود.</p>}
      </div>
      {error && <p role="alert" className="rounded-xl bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}
      <Button type="submit" size="lg" loading={busy} className="w-full" style={{ background: accentColor, borderColor: accentColor }}>ثبت درخواست رزرو</Button>
      <p className="text-center text-[11px] text-base-content/45">ثبت درخواست به‌معنی تأیید نهایی میز نیست؛ منتظر تماس رستوران بمانید.</p>
    </form>
  );
}
