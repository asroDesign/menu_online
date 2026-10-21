"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useFeatures } from "@/components/features";
import { toFa } from "@/lib/format";
import type { Settings } from "@/lib/plans";
import { Button, Card, Field, Input, Skeleton, Switch, useToast , EmojiIcon, IconText} from "@/components/ui";

const n = (s: string) => Number(s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "")) || 0;

/** Restaurant-level switch for the cashback programme (lives in Settings). */
export function CashbackSettingsCard() {
  const f = useFeatures();
  const toast = useToast();
  const [st, setSt] = useState<{ on: boolean; pct: string; min: string; max: string } | null>(null);
  const [orig, setOrig] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ item: { settings: Settings } }>("/api/business").then(({ item }) => {
      const s = item.settings;
      const v = { on: s.cashbackEnabled ?? (s.cashbackPercent ?? 0) > 0, pct: String(s.cashbackPercent ?? 5), min: String(s.cashbackMinOrder ?? 0), max: String(s.cashbackMaxRedeemPercent ?? 100) };
      setSt(v); setOrig(JSON.stringify(v));
    });
  }, []);
  if (!f.has("cashback"))
    return <Card className="p-5"><h2 className="font-bold"><IconText>{<EmojiIcon emoji="" />}</IconText> کش‌بک مشتریان</h2><p className="mt-2 text-sm leading-7 text-stone-500">این امکان در پلن فعلی شما فعال نیست. <Link href="/dashboard/plan?locked=cashback" className="font-bold text-brand-600">مشاهده پلن‌ها</Link></p></Card>;
  if (!st) return <Skeleton className="h-56 rounded-2xl" />;
  async function save() {
    setBusy(true);
    try {
      await api("/api/business", { method: "PATCH", body: { settings: { cashbackEnabled: st!.on, cashbackPercent: n(st!.pct), cashbackMinOrder: n(st!.min), cashbackMaxRedeemPercent: n(st!.max) || 100 } } });
      setOrig(JSON.stringify(st)); toast(st!.on ? "کش‌بک فعال شد" : "کش‌بک غیرفعال شد");
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="font-bold"><IconText>{<EmojiIcon emoji="" />}</IconText> کش‌بک مشتریان</h2><p className="mt-1 text-xs leading-6 text-stone-500">درصدی از مبلغ هر سفارش پرداخت‌شده به کیف پول مشتری اضافه می‌شود. مصرف اعتبار تا راه‌اندازی تأیید پیامکی شماره مشتری غیرفعال است. خاموش‌بودن این گزینه کسب اعتبار جدید را هم متوقف می‌کند.</p></div>
        <Switch checked={st.on} onChange={(v) => setSt({ ...st, on: v })} label="کش‌بک" />
      </div>
      <div className={`mt-4 grid gap-4 sm:grid-cols-3 transition ${st.on ? "" : "pointer-events-none opacity-40"}`}>
        <Field label="درصد کش‌بک (٪)" hint="۰ تا ۵۰"><Input inputMode="numeric" value={st.pct} onChange={(e) => setSt({ ...st, pct: e.target.value })} /></Field>
        <Field label="حداقل مبلغ سفارش برای کش‌بک" hint="تومان؛ ۰ = بدون محدودیت"><Input inputMode="numeric" value={st.min} onChange={(e) => setSt({ ...st, min: e.target.value })} /></Field>
        <Field label="حداکثر سهم کش‌بک در پرداخت (٪)" hint="مثلاً ۵۰٪ از مبلغ سفارش"><Input inputMode="numeric" value={st.max} onChange={(e) => setSt({ ...st, max: e.target.value })} /></Field>
      </div>
      <div className="mt-4 flex items-center justify-between"><p className="text-xs text-stone-500">{st.on ? `مشتری ${toFa(n(st.pct))}٪ از هر خرید را به‌عنوان اعتبار دریافت می‌کند.` : "برنامه‌ی کش‌بک غیرفعال است."}</p><Button size="sm" onClick={save} loading={busy} disabled={JSON.stringify(st) === orig}>ذخیره</Button></div>
    </Card>
  );
}
