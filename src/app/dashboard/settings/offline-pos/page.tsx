"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button, Card, Input, Icon } from "@/components/ui";
type Data = { terminals: { id: string; name: string; lastSeenAt: string | null; revokedAt: string | null }[]; sales: { id: string; orderId: number | null; createdAt: string }[] };
export default function OfflinePosSettings() {
  const [data, setData] = useState<Data>({ terminals: [], sales: [] });
  const [name, setName] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => { try { setData(await api<Data>("/api/offline-pos/terminals")); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => { let active = true; api<Data>("/api/offline-pos/terminals").then(value => { if (active) setData(value); }).catch(e => { if (active) setError((e as Error).message); }); return () => { active = false; }; }, []);
  async function pair() {
    setBusy(true); setError("");
    try {
      const pairing = await api<Record<string, unknown>>("/api/offline-pos/terminals", { method: "POST", body: { name } });
      const url = URL.createObjectURL(new Blob([JSON.stringify({ ...pairing, server: window.location.origin }, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "menupeak-pos-pairing.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setName(""); await reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (!window.confirm("فروش‌های ارسال‌نشده دستگاه پس از لغو، نیاز به بازیابی توسط مدیر دارند. دسترسی این صندوق لغو شود؟")) return;
    try { await api("/api/offline-pos/terminals", { method: "DELETE", body: { id } }); await reload(); } catch (e) { setError((e as Error).message); }
  }
  return <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl bg-primary p-6 text-primary-content"><div className="flex items-center gap-3"><Icon name="desktop" className="size-9" /><div><h1 className="text-xl font-extrabold">صندوق ویندوز؛ ادامه فروش هنگام قطعی اینترنت</h1><p className="mt-2 text-sm leading-7 opacity-85">ذخیره روی دستگاه، چاپ محلی و همگام‌سازی خودکار بعد از اتصال.</p></div></div></header>
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    <div className="grid gap-5 md:grid-cols-2"><Card className="space-y-4 p-5"><h2 className="font-bold">۱. نصب و اتصال صندوق</h2><a className="btn btn-primary" href="https://github.com/asroDesign/menu_online/releases/download/windows-bridge-latest/MenuPeak-Bridge-Setup-x64.exe"><Icon name="download" className="size-4" />دریافت MenuPeak Desktop برای ویندوز</a><p className="text-xs leading-6 text-base-content/65">نسخهٔ ۰٫۲ یا بالاتر لازم است. برنامه را روی حساب Windows مخصوص صندوق نصب کنید و فایل اتصال را در تب صندوق وارد کنید. اولین دریافت منو به اینترنت نیاز دارد.</p><label className="block space-y-2 text-sm"><span>نام دستگاه</span><Input value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="مثلاً صندوق سالن اصلی" /></label><Button disabled={!name.trim()} loading={busy} onClick={pair}>ساخت صندوق و دریافت فایل اتصال</Button><p className="text-xs leading-6 text-warning">فایل اتصال مجوز ثبت فروش است؛ آن را عمومی ارسال نکنید. کلید فقط یک‌بار دانلود می‌شود.</p></Card>
    <Card className="space-y-3 p-5"><h2 className="font-bold">۲. تجهیزات و کار آفلاین</h2><ol className="list-inside list-decimal space-y-2 text-sm leading-7"><li>تنظیمات تجهیزات را از پنل دانلود و در برنامه وارد کنید.</li><li>در صندوق ویندوز، چاپگر مشتری و مسیرهای آشپزخانه را تعیین کنید.</li><li>سفارش را نقدی، کارتخوان با شماره پیگیری، یا پرداخت‌نشده ثبت کنید.</li><li>وضعیت صف و خطاها را در برنامه ببینید؛ بستن پنجره برنامه را به کنار ساعت منتقل می‌کند.</li></ol><Link className="btn btn-outline btn-sm" href="/dashboard/settings/printers/devices">تنظیم چاپگرها</Link><p className="text-xs leading-6 text-base-content/65">منوی محلی تا ۷ روز معتبر است. دستگاه‌های صندوق در قطعی اینترنت پایگاه مشترک ندارند؛ سفارش‌های هر دستگاه جدا هستند. ارسال مبلغ به کارتخوان نیاز به سرویس سازگار PSP دارد و ثبت رسید، تأیید بانکی خودکار نیست.</p></Card></div>
    <Card className="p-5"><div className="mb-4 flex justify-between"><h2 className="font-bold">صندوق‌های متصل</h2><Button size="sm" variant="secondary" onClick={reload}>بازخوانی</Button></div><div className="space-y-3">{data.terminals.map(t => <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-base-300 p-3"><div><b>{t.name}</b><p className="mt-1 text-xs text-base-content/60">{t.revokedAt ? "دسترسی لغو شده" : t.lastSeenAt ? `آخرین ارتباط: ${new Date(t.lastSeenAt).toLocaleString("fa-IR")}` : "هنوز متصل نشده"}</p></div>{!t.revokedAt && <Button size="sm" variant="secondary" onClick={() => revoke(t.id)}>لغو دسترسی</Button>}</div>)}{!data.terminals.length && <p className="text-sm text-base-content/60">هنوز صندوقی تعریف نشده است.</p>}</div></Card>
    <Card className="p-5"><h2 className="mb-3 font-bold">۵۰ فروش اخیر دریافت‌شده از صندوق‌ها</h2><div className="overflow-x-auto"><table className="table table-sm"><thead><tr><th>شناسه محلی</th><th>سفارش سایت</th><th>زمان دریافت</th></tr></thead><tbody>{data.sales.map(s => <tr key={s.id}><td dir="ltr">{s.id.slice(0,8)}</td><td>{s.orderId ? <Link className="link" href="/dashboard/orders">{s.orderId.toLocaleString("fa-IR")}</Link> : "—"}</td><td>{new Date(s.createdAt).toLocaleString("fa-IR")}</td></tr>)}</tbody></table></div></Card>
  </div>;
}
