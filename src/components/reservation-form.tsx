"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { formatDate, formatPrice, formatTime, toFa } from "@/lib/format";
import { Button, Icon, Input, PersianDateInput, Textarea, cn } from "@/components/ui";

type Settings = { requireDeposit: boolean; depositPerGuest: number; durationMinutes: number };
type ReservationType = "normal" | "occasion" | "business";
type TableOption = { id: number; name: string; zone: string; capacity: number };
const reservationTypes: { id: ReservationType; label: string; caption: string; icon: string }[] = [
  { id: "normal", label: "عادی", caption: "رزرو روزمره", icon: "calendar" },
  { id: "occasion", label: "مناسبت", caption: "قرار ویژه", icon: "sparkles" },
  { id: "business", label: "کاری / رسمی", caption: "جلسه و قرار", icon: "building" },
];

function ReservationTableVisual({ capacity, selected }: { capacity: number; selected: boolean }) {
  const roundTable = capacity <= 4;
  const seatCount = Math.min(12, Math.max(2, capacity));
  const seats = Array.from({ length: seatCount }, (_, index) => {
    const angle = (index / seatCount) * Math.PI * 2 - Math.PI / 2;
    const x = 60 + Math.cos(angle) * 39;
    const y = 44 + Math.sin(angle) * 27;
    return { x, y, angle: (angle * 180) / Math.PI + 90 };
  });

  return (
    <span aria-hidden="true" className={cn("mx-auto grid h-[5.25rem] w-full max-w-36 place-items-center rounded-2xl transition", selected ? "bg-white/70" : "bg-emerald-50/70")}>
      <svg viewBox="0 0 120 88" className="h-[4.75rem] w-full max-w-32 overflow-visible">
        <ellipse cx="60" cy="45" rx="48" ry="35" fill={selected ? "#dbeafe" : "#dcefe6"} opacity=".52" />
        {seats.map((seat, index) => (
          <rect key={index} x={seat.x - 5.5} y={seat.y - 4} width="11" height="8" rx="3.5" transform={`rotate(${seat.angle} ${seat.x} ${seat.y})`} fill={selected ? "#2563eb" : "#4d8b70"} opacity=".78" />
        ))}
        {roundTable ? <circle cx="60" cy="44" r="17" fill={selected ? "#2563eb" : "#4d8b70"} /> : <rect x="34" y="29" width="52" height="32" rx="11" fill={selected ? "#2563eb" : "#4d8b70"} />}
        {roundTable ? <circle cx="60" cy="44" r="5" fill="white" opacity=".45" /> : <path d="M43 37h34M43 43h34M43 49h22" stroke="white" strokeWidth="2" strokeLinecap="round" opacity=".55" />}
      </svg>
    </span>
  );
}

export function ReservationForm({ slug, businessName, settings, accentColor }: { slug: string; businessName: string; settings: Settings; accentColor: string }) {
  const [step, setStep] = useState(1);
  const [reservationType, setReservationType] = useState<ReservationType>("normal");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [startsAt, setStartsAt] = useState("");
  const [note, setNote] = useState("");
  const [tables, setTables] = useState<TableOption[]>([]);
  const [tableId, setTableId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingTables, setCheckingTables] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ id: number; depositAmount: number; tableId: number | null } | null>(null);
  const deposit = settings.requireDeposit ? settings.depositPerGuest * guestCount : 0;
  const selectedTable = tables.find((table) => table.id === tableId);
  const fullDate = startsAt ? new Date(startsAt) : null;

  function validateFirstStep() {
    if (name.trim().length < 2) return "نام و نام خانوادگی را وارد کنید.";
    if (phone.replace(/\D/g, "").length < 10) return "شماره موبایل معتبر وارد کنید.";
    if (!startsAt || !Number.isFinite(new Date(startsAt).getTime())) return "تاریخ و ساعت رزرو را انتخاب کنید.";
    if (new Date(startsAt).getTime() < Date.now() + 30 * 60_000) return "رزرو باید دست‌کم ۳۰ دقیقه زودتر ثبت شود.";
    return "";
  }

  async function continueToTables() {
    setError("");
    const validation = validateFirstStep();
    if (validation) { setError(validation); return; }
    setCheckingTables(true);
    try {
      const query = new URLSearchParams({ startsAt: new Date(startsAt).toISOString(), guestCount: String(guestCount) });
      const result = await api<{ items: TableOption[] }>(`/api/public/${encodeURIComponent(slug)}/reservations?${query}`);
      setTables(result.items);
      setTableId(null);
      if (!result.items.length) { setError("برای این زمان و تعداد نفرات، میز آزادی وجود ندارد. ساعت دیگری انتخاب کنید."); return; }
      setStep(2);
    } catch (cause) { setError((cause as Error).message); }
    finally { setCheckingTables(false); }
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!tableId) { setError("یک میز را برای رزرو انتخاب کنید."); return; }
    setError("");
    setBusy(true);
    try {
      const { item } = await api<{ item: { id: number; depositAmount: number; tableId: number | null } }>(`/api/public/${encodeURIComponent(slug)}/reservations`, {
        method: "POST",
        body: { name: name.trim(), phone, guestCount, startsAt: new Date(startsAt).toISOString(), note, reservationType, tableId },
      });
      setDone(item);
    } catch (cause) { setError((cause as Error).message || "ثبت درخواست رزرو انجام نشد."); }
    finally { setBusy(false); }
  }

  if (done) return <div className="mt-6 overflow-hidden rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-center sm:p-7">
    <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm"><Icon name="circleCheck" className="size-9"/></span>
    <h2 className="mt-4 text-xl font-black text-emerald-950">درخواست رزرو ثبت شد</h2>
    <p className="mt-2 text-sm leading-7 text-emerald-900/75">مجموعه پس از بررسی ظرفیت، درخواست شما را تأیید می‌کند.</p>
    <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-xl bg-white p-3"><span className="text-stone-500">کد پیگیری</span><b className="mt-1 block text-stone-900">{toFa(done.id)}</b></div>
      <div className="rounded-xl bg-white p-3"><span className="text-stone-500">میز</span><b className="mt-1 block text-stone-900">{selectedTable?.name ?? "انتخاب‌شده"}</b></div>
    </div>
    {done.depositAmount > 0 && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">پیش‌پرداخت این رزرو {formatPrice(done.depositAmount)} است و پس از هماهنگی با {businessName} ثبت می‌شود.</p>}
  </div>;

  return <div className="mt-6">
    <div className="mb-5 flex items-center gap-2" aria-label={`مرحله ${toFa(step)} از ۳`}>
      {["اطلاعات رزرو", "انتخاب میز", "تأیید نهایی"].map((label, index) => { const indexStep = index + 1; const complete = step > indexStep; return <div key={label} className="flex min-w-0 flex-1 items-center gap-2">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-xs font-extrabold transition", complete ? "bg-emerald-600 text-white" : step === indexStep ? "text-white" : "bg-stone-100 text-stone-400")} style={step === indexStep ? { backgroundColor: accentColor } : undefined}>{complete ? <Icon name="check" className="size-4"/> : toFa(indexStep)}</span>
        <span className={cn("hidden truncate text-[10px] font-bold sm:block", step === indexStep ? "text-stone-900" : "text-stone-400")}>{label}</span>
        {index < 2 && <span className={cn("h-px min-w-2 flex-1", step > indexStep ? "bg-emerald-300" : "bg-stone-200")}/>}
      </div>; })}
    </div>

    {step === 1 && <section className="space-y-4" aria-labelledby="reservation-details-heading">
      <div><h2 id="reservation-details-heading" className="text-lg font-black">اطلاعات رزرو</h2><p className="mt-1 text-xs leading-6 text-stone-500">زمان، تعداد نفرات و نام رزروکننده را مشخص کنید.</p></div>
      <div className="grid grid-cols-3 gap-2">{reservationTypes.map((type) => <button key={type.id} type="button" aria-pressed={reservationType === type.id} onClick={() => setReservationType(type.id)} className={cn("rounded-2xl border p-3 text-center transition", reservationType === type.id ? "border-blue-500 bg-blue-50 text-blue-950 shadow-sm ring-2 ring-blue-500/15" : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50")}><Icon name={type.icon} className="mx-auto size-5"/><b className="mt-2 block text-xs">{type.label}</b><span className="mt-1 block text-[9px] text-stone-500">{type.caption}</span></button>)}</div>
      <div className="rounded-2xl border border-stone-200 p-3 sm:p-4"><p className="mb-2 text-xs font-bold text-stone-800">روز و ساعت</p><p className="mb-3 text-[11px] leading-5 text-stone-500">زمان‌های قابل انتخاب باید با ساعت کاری مجموعه هماهنگ باشند.</p><PersianDateInput className="w-full" value={startsAt} onChange={setStartsAt} withTime required placeholder="انتخاب روز و ساعت" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 p-3"><span className="block text-xs font-bold">تعداد نفرات</span><span className="mt-2 flex items-center justify-between"><span className="text-xs text-stone-500">مهمان</span><span className="flex items-center gap-3"><button type="button" aria-label="کم‌کردن تعداد نفرات" disabled={guestCount <= 1} onClick={() => setGuestCount((count) => Math.max(1, count - 1))} className="grid size-8 place-items-center rounded-full bg-stone-100 text-stone-700 disabled:opacity-40">−</button><b className="min-w-5 text-center">{toFa(guestCount)}</b><button type="button" aria-label="افزایش تعداد نفرات" disabled={guestCount >= 30} onClick={() => setGuestCount((count) => Math.min(30, count + 1))} className="grid size-8 place-items-center rounded-full bg-stone-100 text-stone-700 disabled:opacity-40">+</button></span></span></div>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-stone-600">نام و نام خانوادگی</span><Input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="نام رزروکننده" /></label>
      </div>
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-stone-600">شماره موبایل</span><Input required inputMode="tel" dir="ltr" className="text-left" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="0912…" /></label>
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-stone-600">توضیح برای مجموعه (اختیاری)</span><Textarea rows={2} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثلاً صندلی کودک یا مناسبت خاص" /></label>
    </section>}

    {step === 2 && <section className="space-y-4" aria-labelledby="reservation-table-heading">
      <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 id="reservation-table-heading" className="text-lg font-black">میز خود را انتخاب کنید</h2><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-800">{toFa(tables.length)} میز آزاد</span></div><p className="mt-1 text-xs leading-6 text-stone-500">میزهای آزاد این زمان با ظرفیت مناسب برای {toFa(guestCount)} نفر نمایش داده شده‌اند.</p></div><button type="button" onClick={() => setStep(1)} className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">تغییر زمان</button></div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">{tables.map((table) => {
        const selected = tableId === table.id;
        return <button key={table.id} type="button" aria-pressed={selected} onClick={() => setTableId(table.id)} className={cn("group min-w-0 rounded-2xl border p-2.5 text-start transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:p-3", selected ? "border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-500/15" : "border-stone-200 bg-white hover:border-emerald-300")}>
          <span className="flex items-center justify-between gap-2"><b className="min-w-0 truncate rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-extrabold text-stone-800 ring-1 ring-stone-200/70">{table.name}</b><span className={cn("grid size-5 shrink-0 place-items-center rounded-full border transition", selected ? "border-blue-600 bg-blue-600 text-white" : "border-stone-300 bg-white text-transparent group-hover:border-emerald-500")}>{selected && <Icon name="check" className="size-3"/>}</span></span>
          <ReservationTableVisual capacity={table.capacity} selected={selected}/>
          <span className="mt-1 flex min-w-0 items-end justify-between gap-1"><span className="min-w-0"><b className="block truncate text-xs font-extrabold text-stone-900">ظرفیت {toFa(table.capacity)} نفر</b><span className="mt-1 block truncate text-[9px] text-stone-500">{table.zone || "سالن اصلی"}</span></span><span className={cn("shrink-0 rounded-full px-2 py-1 text-[9px] font-bold", settings.requireDeposit ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")}>{settings.requireDeposit ? formatPrice(deposit) : "رایگان"}</span></span>
        </button>;
      })}</div>
      <p className="rounded-xl bg-stone-50 px-3 py-2 text-[10px] leading-5 text-stone-500">مبلغ روی کارت، پیش‌پرداخت همین رزرو بر اساس تعداد نفرات و تنظیم رستوران است؛ هزینهٔ اختصاصی برای هر میز در تنظیمات فعلی تعریف نشده است.</p>
    </section>}

    {step === 3 && <section className="space-y-4" aria-labelledby="reservation-confirm-heading">
      <div><h2 id="reservation-confirm-heading" className="text-lg font-black">تأیید نهایی</h2><p className="mt-1 text-xs leading-6 text-stone-500">جزئیات را بررسی کنید و درخواست رزرو را ثبت کنید.</p></div>
      <div className="grid grid-cols-2 gap-2 text-xs">{[
        ["نوع رزرو", reservationTypes.find((type) => type.id === reservationType)?.label ?? "عادی"],
        ["زمان", fullDate && Number.isFinite(fullDate.getTime()) ? `${formatDate(fullDate)} · ${formatTime(fullDate)}` : "—"],
        ["مهمان‌ها", `${toFa(guestCount)} نفر`],
        ["میز", selectedTable?.name ?? "—"],
        ["رزروکننده", name],
        ["شماره موبایل", phone],
      ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-stone-50 p-3"><span className="block text-[10px] text-stone-500">{label}</span><b className="mt-1 block truncate text-stone-900">{value}</b></div>)}</div>
      {note && <p className="rounded-xl bg-stone-50 p-3 text-xs leading-6">یادداشت: {note}</p>}
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-6 text-amber-950"><p>مدت رزرو: <b>{toFa(settings.durationMinutes)} دقیقه</b></p>{settings.requireDeposit ? <p className="mt-1">پیش‌پرداخت درخواستی: <b>{formatPrice(deposit)}</b> ({formatPrice(settings.depositPerGuest)} به‌ازای هر نفر)</p> : <p className="mt-1">برای این رزرو پیش‌پرداخت دریافت نمی‌شود.</p>}</div>
    </section>}

    {error && <p role="alert" className="mt-4 rounded-xl bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}
    <div className="sticky bottom-0 z-10 mt-5 flex gap-2 border-t border-stone-100 bg-white/95 py-3 backdrop-blur-sm">
      {step > 1 && <Button type="button" variant="secondary" className="flex-1" disabled={busy || checkingTables} onClick={() => { setError(""); setStep((current) => Math.max(1, current - 1)); }}>بازگشت</Button>}
      {step === 1 && <Button type="button" size="lg" className="w-full" loading={checkingTables} onClick={() => void continueToTables()} style={{ backgroundColor: accentColor, borderColor: accentColor }}>ادامه و انتخاب میز <Icon name="chevronLeft" className="size-4"/></Button>}
      {step === 2 && <Button type="button" size="lg" className="flex-1" disabled={!tableId} onClick={() => { setError(""); setStep(3); }} style={{ backgroundColor: accentColor, borderColor: accentColor }}>ادامه رزرو <Icon name="chevronLeft" className="size-4"/></Button>}
      {step === 3 && <Button type="button" size="lg" className="flex-1" loading={busy} disabled={!tableId} onClick={() => void submit()} style={{ backgroundColor: accentColor, borderColor: accentColor }}>ثبت درخواست رزرو</Button>}
    </div>
    <p className="mt-3 text-center text-[10px] leading-6 text-stone-400">ثبت درخواست به‌معنی تأیید نهایی نیست؛ تأیید و هماهنگی از طرف مجموعه انجام می‌شود.</p>
  </div>;
}
