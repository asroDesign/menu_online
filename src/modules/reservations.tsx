"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useCollection } from "@/lib/api";
import { formatDate, formatPrice, formatTime, toFa } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorState, Icon, PageHeader, Skeleton, useToast } from "@/components/ui";

type Reservation = {
  id: number; tableName: string | null; customerName: string; customerPhone: string; guestCount: number;
  startsAt: string; durationMinutes: number; status: string; depositAmount: number; depositStatus: string; depositMethod: string; note: string;
  smsNotification?: { status: "sent" | "failed" | "skipped"; detail: string };
};
const STATUS: Record<string, [string, string]> = {
  requested: ["در انتظار بررسی", "amber"], confirmed: ["تأییدشده", "emerald"], cancelled: ["لغوشده", "rose"], completed: ["انجام‌شده", "blue"], no_show: ["عدم حضور", "stone"],
};

export default function Reservations() {
  const col = useCollection<Reservation>("/api/r/reservations", { poll: 30_000 });
  const toast = useToast();
  const [slug, setSlug] = useState("");
  useEffect(() => {
    api<{ item: { slug: string } }>("/api/business").then((r) => setSlug(r.item.slug)).catch(() => {});
  }, []);

  const reservationPath = slug ? `/m/${slug}/reserve` : "";
  async function copyReservationLink() {
    if (!reservationPath) return;
    try {
      await navigator.clipboard.writeText(new URL(reservationPath, window.location.origin).toString());
      toast("لینک رزرو کپی شد");
    } catch {
      toast("کپی لینک انجام نشد؛ صفحه رزرو را باز کنید و نشانی آن را کپی کنید.", "error");
    }
  }

  async function update(row: Reservation, patch: Record<string, unknown>) {
    try {
      const updated = await col.update(row.id, patch);
      await col.reload(true);
      const sms = updated.smsNotification;
      if (sms && sms.status !== "sent") toast(`وضعیت رزرو ذخیره شد؛ پیامک ارسال نشد: ${sms.detail}`, "error");
      else toast(sms?.status === "sent" ? "وضعیت رزرو ذخیره و پیامک ارسال شد" : "وضعیت رزرو به‌روز شد");
    }
    catch (e) { toast((e as Error).message, "error"); }
  }
  return <div className="animate-fade-in">
    <PageHeader title="رزرو میز" subtitle="درخواست‌های رزرو و پیش‌پرداخت‌ها را مدیریت کنید" actions={<Button variant="secondary" onClick={() => col.reload()}><Icon name="refresh" className="size-4" /> تازه‌سازی</Button>} />
    <Card className="mb-5 flex flex-col gap-4 overflow-hidden border-0 bg-gradient-to-l from-primary to-secondary p-5 text-primary-content shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15"><Icon name="calendar" className="size-6" /></span>
        <div><h2 className="font-extrabold">لینک رزرو برای مشتریان</h2><p className="mt-1 text-xs leading-6 text-primary-content/80">این صفحه را در شبکه‌های اجتماعی یا پیام‌رسان‌ها به اشتراک بگذارید.</p></div>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        {reservationPath && <Link href={reservationPath} target="_blank" rel="noreferrer" className="btn border-0 bg-white text-primary shadow-md hover:bg-white/90"><Icon name="external" className="size-4" />صفحه رزرو مشتری</Link>}
        <Button variant="secondary" className="border-white/20 bg-white/15 text-primary-content hover:bg-white/25" disabled={!reservationPath} onClick={copyReservationLink}><Icon name="copy" className="size-4" />کپی لینک</Button>
      </div>
    </Card>
    <Card className="mb-5 flex items-start gap-3 bg-primary/5 p-4"><Icon name="calendar" className="size-5 shrink-0 text-primary" /><p className="text-sm leading-7">رزروها ظرفیت میز را تا پایان بازه نگه می‌دارند. با فعال‌بودن پیش‌پرداخت، ثبت دریافت آن رزرو را تأیید می‌کند.</p></Card>
    {col.loading ? <div className="grid gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      : col.error ? <ErrorState message={col.error} onRetry={() => col.reload()} />
      : !col.items.length ? <EmptyState icon="calendar" title="رزروی ثبت نشده" description="درخواست‌های رزرو آنلاین مشتریان در این بخش نمایش داده می‌شوند." />
      : <div className="grid gap-3 xl:grid-cols-2">{col.items.map((row) => {
        const [label, color] = STATUS[row.status] ?? [row.status, "stone"];
        const closed = ["cancelled", "completed", "no_show"].includes(row.status);
        return <Card key={row.id} className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="font-extrabold">{row.customerName}</p><a href={`tel:${row.customerPhone}`} dir="ltr" className="mt-1 block text-sm text-primary">{row.customerPhone}</a></div><Badge color={color}>{label}</Badge></div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p className="rounded-xl bg-base-200/60 px-3 py-2"><Icon name="calendar" className="me-1.5 size-4" />{formatDate(row.startsAt)} · {formatTime(row.startsAt)}</p>
            <p className="rounded-xl bg-base-200/60 px-3 py-2"><Icon name="users" className="me-1.5 size-4" />{toFa(row.guestCount)} نفر · {toFa(row.durationMinutes)} دقیقه</p>
            <p className="rounded-xl bg-base-200/60 px-3 py-2"><Icon name="table" className="me-1.5 size-4" />{row.tableName ?? "میز حذف‌شده"}</p>
            <p className="rounded-xl bg-base-200/60 px-3 py-2"><Icon name="wallet" className="me-1.5 size-4" />پیش‌پرداخت: {row.depositAmount ? formatPrice(row.depositAmount) : "ندارد"}</p>
          </div>
          {row.depositStatus === "pending" && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">پیش‌پرداخت دریافت نشده؛ رزرو تأیید نشده است.</p>}
          {row.depositStatus === "paid" && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">پیش‌پرداخت ثبت شد · {row.depositMethod === "bank" ? "بانک" : row.depositMethod === "card" ? "کارت‌به‌کارت" : "نقدی"}</p>}
          {row.note && <p className="rounded-xl bg-base-200/60 px-3 py-2 text-sm">{row.note}</p>}
          {!closed && <div className="flex flex-wrap gap-2 border-t border-base-200 pt-3">
            {row.depositStatus === "pending" ? <Button size="sm" onClick={() => update(row, { depositPaid: true, depositMethod: "cash" })}><Icon name="check" className="size-4" />ثبت دریافت و تأیید</Button>
              : row.status !== "confirmed" ? <Button size="sm" onClick={() => update(row, { status: "confirmed" })}><Icon name="check" className="size-4" />تأیید رزرو</Button>
              : <Button size="sm" variant="secondary" onClick={() => update(row, { status: "completed" })}>ثبت انجام رزرو</Button>}
            {row.status === "confirmed" ? <Button size="sm" variant="ghost" onClick={() => update(row, { status: "no_show" })}>مهمان حاضر نشد</Button> : <Button size="sm" variant="ghost" onClick={() => update(row, { status: "cancelled" })}>{row.status === "requested" ? "رد رزرو" : "لغو رزرو"}</Button>}
          </div>}
        </Card>;
      })}</div>}
  </div>;
}
