"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useFeatures } from "@/components/features";
import type { Settings } from "@/lib/plans";
import Link from "next/link";
import { Badge, Button, Card, Field, Icon, Input, PageHeader, Select, Skeleton, Switch, cn, useToast , EmojiIcon, IconText} from "@/components/ui";

const TEMPLATES: { key: string; name: string; desc: string }[] = [
  { key: "classic", name: "کلاسیک", desc: "منوی دسته‌ها در کنار صفحه و محصولات به‌صورت کاشی؛ آشناترین و سریع‌ترین چیدمان" },
  { key: "photo", name: "تصویری", desc: "عکس‌های بزرگ تمام‌قاب؛ مناسب کافه، فست‌فود و دسر" },
  { key: "simple", name: "ساده (دسترس‌پذیر)", desc: "فهرست تک‌ستونه با فونت و دکمه‌های بسیار بزرگ؛ راحت‌ترین برای همه‌ی سنین" },
  { key: "dark", name: "تیره", desc: "پوسته‌ی تیره و مدرن؛ مناسب فضاهای کم‌نور و برندهای شیک" },
  { key: "wizard", name: "مرحله‌ای", desc: "هر بار یک دسته‌بندی با نوار پیشرفت و دکمه‌ی بعدی؛ برای مشتری‌های کاملاً تازه‌کار" },
];

function Mini({ k, active }: { k: string; active: boolean }) {
  const ac = active ? "var(--color-primary)" : "#94a3b8";
  const tile = <div className="rounded-md bg-stone-300" />;
  const dark = k === "dark";
  return (
    <div className={cn("flex aspect-[4/3] gap-1.5 overflow-hidden rounded-xl p-2", dark ? "bg-stone-900" : "bg-stone-100")}>
      {k === "classic" && <><div className="flex w-1/4 flex-col gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className="h-full rounded" style={{ background: i === 0 ? ac : "#d6d3d1" }} />)}</div><div className="grid flex-1 grid-cols-3 gap-1">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i}>{tile}</div>)}</div></>}
      {k === "photo" && <div className="flex flex-1 flex-col gap-1.5"><div className="flex h-3 gap-1">{[0, 1, 2].map((i) => <div key={i} className="flex-1 rounded-full" style={{ background: i === 0 ? ac : "#d6d3d1" }} />)}</div><div className="grid flex-1 grid-cols-2 gap-1.5">{[0, 1].map((i) => <div key={i} className="rounded-lg bg-gradient-to-t from-stone-700 to-stone-400" />)}</div></div>}
      {k === "simple" && <div className="flex flex-1 flex-col gap-1.5 bg-white p-1">{[0, 1, 2].map((i) => <div key={i} className="flex flex-1 items-center gap-1 rounded border border-stone-300 p-1"><div className="aspect-square h-full rounded bg-stone-300" /><div className="h-1.5 flex-1 rounded bg-stone-400" /><div className="size-3 rounded" style={{ background: ac }} /></div>)}</div>}
      {k === "dark" && <div className="flex flex-1 flex-col gap-1.5"><div className="flex h-3 gap-1">{[0, 1, 2].map((i) => <div key={i} className="flex-1 rounded-full" style={{ background: i === 0 ? ac : "#3f3f46" }} />)}</div><div className="grid flex-1 grid-cols-3 gap-1">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="rounded-md bg-zinc-700" />)}</div></div>}
      {k === "wizard" && <div className="flex flex-1 flex-col gap-1.5"><div className="flex h-1.5 gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className="flex-1 rounded-full" style={{ background: i < 2 ? ac : "#d6d3d1" }} />)}</div><div className="grid flex-1 grid-cols-2 gap-1.5">{[0, 1].map((i) => <div key={i} className="rounded-lg bg-stone-400" />)}</div><div className="flex h-4 gap-1"><div className="flex-1 rounded bg-stone-300" /><div className="flex-[2] rounded" style={{ background: ac }} /></div></div>}
    </div>
  );
}

export default function Kiosk() {
  const f = useFeatures();
  const toast = useToast();
  const [biz, setBiz] = useState<{ slug: string; settings: Settings } | null>(null);
  const [cfg, setCfg] = useState<NonNullable<Settings["kiosk"]> | null>(null);
  const [orig, setOrig] = useState("");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [posDevs, setPosDevs] = useState<{ id: number; name: string; terminalNumber: string; bankName: string; kioskEnabled: boolean; settlementBankAccountId: number | null; online: boolean; lastSeenAt: string | null }[]>([]);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const load = () => api<{ posDevices: typeof posDevs }>("/api/orders/settlement-options").then((r) => { setPosDevs(r.posDevices.filter((d) => d.kioskEnabled && d.settlementBankAccountId)); setNow(Date.now()); }).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    // The browser origin is only available after this client component mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(location.origin);
    api<{ item: { slug: string; settings: Settings } }>("/api/business").then((r) => {
      const k = { template: "classic", welcomeTitle: "", welcomeSubtitle: "", idleSeconds: 90, allowCounter: true, allowOnline: false, askPhone: true, allowPos: false, ...(r.item.settings.kiosk ?? {}) };
      setBiz(r.item); setCfg(k); setOrig(JSON.stringify(k));
    });
  }, []);
  if (!biz || !cfg) return <Skeleton className="h-96 rounded-2xl" />;
  const currentCfg = cfg;
  const url = `${origin}/kiosk/${biz.slug}`;
  const ipgOk = !!(biz.settings.ipg?.merchantId) && f.has("ipg");
  const posOk = f.has("tablet_pos");
  const selectedPosId = posDevs.some((device) => device.id === cfg.posDeviceId) ? cfg.posDeviceId : posDevs.find((device) => device.online)?.id ?? posDevs[0]?.id;
  const sel = posDevs.find((d) => d.id === selectedPosId);
  const live = (d: { lastSeenAt: string | null }) => !!d.lastSeenAt && now - new Date(d.lastSeenAt).getTime() < 45_000;
  const anyLive = (sel ? [sel] : posDevs).some(live);
  async function save() {
    setBusy(true);
    const next = { ...currentCfg, ...(currentCfg.allowPos ? { posDeviceId: selectedPosId } : {}) };
    try { await api("/api/business", { method: "PATCH", body: { settings: { kiosk: next } } }); setCfg(next); setOrig(JSON.stringify(next)); toast("تنظیمات کیوسک ذخیره شد"); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  const set = (p: Partial<typeof currentCfg>) => setCfg({ ...currentCfg, ...p });
  return (
    <div className="animate-fade-in pb-20">
      <PageHeader title="سفارش‌گیر کیوسک" subtitle="صفحه‌ی لمسی خودسفارش‌دهی؛ مشتری سفارش می‌دهد و در صندوق (یا آنلاین) پرداخت می‌کند، سفارش مستقیم به آشپزخانه می‌رسد" actions={<a href={url} target="_blank"><Button><Icon name="external" className="size-4" /> باز کردن کیوسک</Button></a>} />
      <h2 className="mb-3 font-bold">قالب نمایش (۵ طرح)</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <IconText>{TEMPLATES.map((t) => (
          <div key={t.key} className={cn("flex flex-col rounded-2xl bg-white p-3 ring-2 transition", cfg.template === t.key ? "ring-brand-500 shadow-lg" : "ring-stone-200 hover:ring-brand-300")}>
            <button onClick={() => set({ template: t.key })} className="text-start"><Mini k={t.key} active={cfg.template === t.key} /><div className="mt-3 flex items-center justify-between"><b>{t.name}</b>{cfg.template === t.key && <Badge color="brand">فعال</Badge>}</div><p className="mt-1 text-xs leading-6 text-stone-500">{t.desc}</p></button>
            <a className="mt-3 text-center text-xs font-bold text-brand-600 hover:underline" href={`${url}?template=${t.key}`} target="_blank">پیش‌نمایش تمام‌صفحه {<EmojiIcon emoji="" />}</a>
          </div>
        ))}</IconText>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card className="space-y-4 p-5">
          <h3 className="font-bold">تنظیمات</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="عنوان صفحه‌ی خوش‌آمدگویی"><Input value={cfg.welcomeTitle ?? ""} onChange={(e) => set({ welcomeTitle: e.target.value })} placeholder="نام رستوران" /></Field>
            <Field label="زیرعنوان"><Input value={cfg.welcomeSubtitle ?? ""} onChange={(e) => set({ welcomeSubtitle: e.target.value })} placeholder="برای شروع سفارش، صفحه را لمس کنید" /></Field>
            <Field label="بازگشت خودکار به صفحه‌ی اول بعد از (ثانیه بی‌حرکتی)" hint="۳۰ تا ۶۰۰"><Input inputMode="numeric" value={String(cfg.idleSeconds ?? 90)} onChange={(e) => set({ idleSeconds: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></Field>
          </div>
          <div className="space-y-2">
            {([["allowCounter", "پرداخت در صندوق (سفارش با شماره، در پیشخوان پرداخت می‌شود)", true], ["askPhone", "درخواست شماره موبایل برای باشگاه مشتریان و کش‌بک (اختیاری)", true]] as const).map(([k, l]) => (
              <div key={k} className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3"><span className="text-sm font-medium">{l}</span><Switch checked={cfg[k] !== false} onChange={(v) => set({ [k]: v })} label={l} /></div>
            ))}
            <div className={cn("rounded-xl bg-stone-50 px-4 py-3", !posOk && "opacity-60")}>
              <div className="flex items-center justify-between gap-3">
                <div><span className="text-sm font-medium"><IconText>{<EmojiIcon emoji="" />}</IconText> پرداخت با دستگاه کارتخوان (ارسال خودکار مبلغ)</span><p className="mt-0.5 text-[11px] leading-5 text-stone-500">پس از تأیید سفارش، مبلغ خودکار به کارتخوان می‌رود و مشتری فقط کارت می‌زند.</p></div>
                <Switch checked={!!cfg.allowPos && posOk} disabled={!posOk || posDevs.length === 0} onChange={(v) => set({ allowPos: v, ...(v && selectedPosId ? { posDeviceId: selectedPosId } : {}) })} label="کارتخوان" />
              </div>
              {cfg.allowPos && posOk && (
                <div className="mt-3 space-y-2 border-t border-stone-200 pt-3">
                  {posDevs.length === 0 ? (
                    <p className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-800">هنوز پوزی به کیوسک و حساب بانکی متصل نشده. در تنظیمات هر کارتخوان، کانال «کیوسک» و حساب تسویه را فعال کنید. <Link href="/dashboard/devices" className="font-bold underline">رفتن به تنظیمات پوز</Link></p>
                  ) : (
                    <>
                      {posDevs.length > 1 && <Field label="پوز متصل به کیوسک"><Select value={String(selectedPosId ?? "")} onChange={(e) => set({ posDeviceId: e.target.value ? Number(e.target.value) : undefined })}>{posDevs.map((d) => <option key={d.id} value={d.id}>{d.name}{d.terminalNumber ? ` · شماره ${d.terminalNumber}` : ""}{d.bankName ? ` · ${d.bankName}` : ""}{live(d) ? " — آنلاین" : " — آفلاین"}</option>)}</Select></Field>}
                      {posDevs.length === 1 && sel && <p className="text-xs text-stone-600">پوز متصل: <b>{sel.name}</b>{sel.terminalNumber ? ` · شماره ${sel.terminalNumber}` : ""}{sel.bankName ? ` · ${sel.bankName}` : ""}</p>}
                      <p className={cn("rounded-lg p-3 text-xs font-semibold", anyLive ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>{anyLive ? "● برنامه‌ی پل متصل است؛ گزینه‌ی کارتخوان در کیوسک نمایش داده می‌شود." : "○ برنامه‌ی پل متصل نیست؛ تا زمان اتصال، گزینه‌ی کارتخوان در کیوسک غیرفعال است."}</p>
                    </>
                  )}
                </div>
              )}
              {!posOk && <p className="mt-1 text-[11px] text-amber-700">این امکان در پلن شما فعال نیست.</p>}
            </div>
            <div className={cn("flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3", !ipgOk && "opacity-60")}><div><span className="text-sm font-medium">پرداخت آنلاین با کارت (درگاه زرین‌پال)</span>{!ipgOk && <p className="mt-0.5 text-[11px] text-amber-700">ابتدا درگاه پرداخت را در «درگاه پرداخت» تنظیم کنید.</p>}</div><Switch checked={!!cfg.allowOnline && ipgOk} disabled={!ipgOk} onChange={(v) => set({ allowOnline: v })} label="پرداخت آنلاین" /></div>
          </div>
        </Card>
        <Card className="p-5 text-center">
          <h3 className="mb-3 text-start font-bold">آدرس کیوسک</h3>
          <div className="inline-block rounded-2xl border-2 border-dashed border-brand-300 p-3"><QRCodeSVG value={url} size={150} marginSize={0} /></div>
          <p className="mt-3 break-all text-xs text-stone-500" dir="ltr">{url}</p>
          <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => navigator.clipboard.writeText(url).then(() => toast("لینک کپی شد"))}><Icon name="copy" className="size-4" /> کپی لینک</Button>
          <p className="mt-4 rounded-xl bg-stone-50 p-3 text-start text-[11px] leading-6 text-stone-600"><b>راه‌اندازی:</b> روی تبلت یا مانیتور لمسی، مرورگر را (ترجیحاً حالت Kiosk / تمام‌صفحه) روی همین آدرس باز بگذارید. سفارش‌ها با منبع «کیوسک» در بخش سفارش‌ها دیده می‌شوند.</p>
        </Card>
      </div>
      <div className={cn("fixed inset-x-0 bottom-0 z-30 flex justify-center p-4 transition-all lg:ps-64", JSON.stringify(cfg) !== orig ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-8 opacity-0")}>
        <div className="flex items-center gap-3 rounded-2xl bg-stone-900 px-4 py-2.5 text-white shadow-2xl"><span className="text-sm">تغییرات ذخیره نشده</span><Button size="sm" loading={busy} onClick={save}>ذخیره</Button></div>
      </div>
    </div>
  );
}
