"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toFa } from "@/lib/format";
import { Button, EmptyState, Field, Input, Modal, Select, useToast , IconText} from "@/components/ui";

type Tpl = { id: number; purpose: string; title: string; isActive: boolean; sampleText: string };
const PURPOSE: Record<string, string> = { birthday: "تولد", occasion: "مناسبتی", promo: "تبلیغاتی", service: "خدماتی" };

/** Send a pattern-based SMS to a customer group (segment) or to hand-picked numbers. */
export function SmsSendModal({ open, onClose, audience, numbers, count, title }: { open: boolean; onClose: () => void; audience: string; numbers?: string; count: number; title: string }) {
  const toast = useToast();
  const [tpls, setTpls] = useState<Tpl[] | null>(null);
  const [tplId, setTplId] = useState("");
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTpls(null); api<{ items: Tpl[] }>("/api/r/smstemplates").then((r) => setTpls(r.items.filter((t) => t.isActive))).catch(() => setTpls([])); setName(title); } }, [open, title]);
  const cur = tpls?.find((t) => String(t.id) === tplId) ?? tpls?.[0];
  async function send() {
    if (!cur) return;
    setBusy(true);
    try {
      await api("/api/r/smscampaigns", { method: "POST", body: { title: name, templateId: cur.id, audience, numbers, code, discount, origin: location.origin } });
      toast(`ارسال پیامک برای ${toFa(count)} نفر آغاز شد`);
      onClose();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={`ارسال پیامک — ${title}`} size="md" footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button onClick={send} loading={busy} disabled={!cur || count === 0}>ارسال به {toFa(count)} نفر</Button></>}>
      <IconText>{!tpls ? <div className="skeleton h-32" /> : tpls.length === 0 ? (
        <EmptyState emoji="" title="هنوز قالب پیامکی ندارید" description="ابتدا در پنل پیامک یک قالب (پترن) بسازید." action={<Link href="/dashboard/sms"><Button size="sm">رفتن به پنل پیامک</Button></Link>} />
      ) : (
        <div className="space-y-4">
          <Field label="قالب پیامک (پترن)"><Select value={String(cur?.id ?? "")} onChange={(e) => setTplId(e.target.value)}>{tpls.map((t) => <option key={t.id} value={t.id}>{PURPOSE[t.purpose]} — {t.title}</option>)}</Select></Field>
          {cur?.sampleText && <p className="rounded-xl bg-stone-50 p-3 text-xs leading-7 text-stone-600">{cur.sampleText}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="کد تخفیف (اختیاری)"><Input dir="ltr" className="text-left uppercase" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
            <Field label="مقدار تخفیف (متن)"><Input value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="۱۵٪" /></Field>
          </div>
          <Field label="عنوان کمپین"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <p className="text-[11px] leading-6 text-stone-400">فقط مشتریانی که دریافت پیامک را فعال نگه داشته‌اند، پیام می‌گیرند. گزارش ارسال در پنل پیامک موجود است.</p>
        </div>
      )}</IconText>
    </Modal>
  );
}
