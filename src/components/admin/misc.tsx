"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate, formatTime, toFa } from "@/lib/format";
import { fmtJ } from "@/lib/jalali";
import { JalaliInput } from "@/components/jalali-input";
import { PLANS } from "@/lib/plans";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, Select, Skeleton, Switch, Textarea, cn, useToast , EmojiIcon, IconText} from "@/components/ui";
import { useGet, type Me } from "@/components/admin/common";

const LEVEL: Record<string, [string, string]> = { info: ["اطلاع‌رسانی", "blue"], warning: ["هشدار", "amber"], success: ["خبر خوب", "emerald"] };

export function AnnouncementsTab() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useGet<{ items: any[] }>("/api/admin/announcements");
  const [f, setF] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  async function save() {
    try {
      const body = { title: f.title, body: f.body, level: f.level, audience: f.audience, expiresAt: f.expiresAt || null };
      if (f.id) await api(`/api/admin/announcements/${f.id}`, { method: "PATCH", body }); else await api("/api/admin/announcements", { method: "POST", body });
      toast(f.id ? "ذخیره شد" : "اطلاعیه منتشر شد"); setF(null); reload(true);
    } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-xl font-extrabold sm:text-2xl">اطلاعیه‌ها</h1><p className="mt-1 text-sm text-stone-500">پیام همگانی که بالای داشبورد رستوران‌ها نمایش داده می‌شود (قابل بستن توسط کاربر)</p></div><Button onClick={() => setF({ title: "", body: "", level: "info", audience: "all", expiresAt: "" })}><Icon name="plus" className="size-4" /> اطلاعیه جدید</Button></div>
      <IconText>{error ? <ErrorState message={error} onRetry={() => reload()} /> : loading && !data ? <Skeleton className="h-40 rounded-2xl" /> : !data?.items.length ? <EmptyState emoji="" title="هنوز اطلاعیه‌ای ثبت نشده" description="از اطلاعیه برای خبر تعمیرات، قابلیت‌های جدید یا تمدید اشتراک استفاده کنید." action={<Button onClick={() => setF({ title: "", body: "", level: "info", audience: "all", expiresAt: "" })}>ساخت اطلاعیه</Button>} /> : (
        <div className="space-y-3">{data.items.map((a) => {
          const expired = a.expiresAt && new Date(a.expiresAt).getTime() < Date.now();
          return (
            <Card key={a.id} className={cn("p-4", (!a.isActive || expired) && "opacity-60")}>
              <div className="flex flex-wrap items-start gap-3"><div className="min-w-60 flex-1"><div className="flex flex-wrap items-center gap-2"><b>{a.title}</b><Badge color={LEVEL[a.level]?.[1]}>{LEVEL[a.level]?.[0]}</Badge><Badge>{a.audience === "all" ? "همه" : `پلن ${PLANS.find((p) => `plan:${p.key}` === a.audience)?.name}`}</Badge>{expired && <Badge color="stone">منقضی</Badge>}</div><p className="mt-1.5 text-sm leading-7 text-stone-600">{a.body}</p><p className="mt-1 text-[11px] text-stone-400">{a.createdBy} · {fmtJ(a.createdAt)}{a.expiresAt && ` · تا ${fmtJ(a.expiresAt)}`}</p></div>
                <div className="flex items-center gap-1"><Switch checked={a.isActive} label="فعال" onChange={async (v) => { setData((d) => (d ? { items: d.items.map((x) => (x.id === a.id ? { ...x, isActive: v } : x)) } : d)); try { await api(`/api/admin/announcements/${a.id}`, { method: "PATCH", body: { isActive: v } }); } catch (e) { toast((e as Error).message, "error"); reload(true); } }} /><IconButton icon="edit" label="ویرایش" onClick={() => setF({ ...a, expiresAt: a.expiresAt ?? "" })} /><IconButton icon="trash" label="حذف" className="hover:text-rose-600" onClick={() => setDel(a)} /></div></div>
            </Card>
          );
        })}</div>
      )}</IconText>
      <Modal open={!!f} onClose={() => setF(null)} title={f?.id ? "ویرایش اطلاعیه" : "اطلاعیه جدید"} footer={<><Button variant="ghost" onClick={() => setF(null)}>انصراف</Button><Button onClick={save} disabled={!f?.title?.trim()}>{f?.id ? "ذخیره" : "انتشار"}</Button></>}>
        {f && <div className="space-y-4"><Field label="عنوان *"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label="متن"><Textarea rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="نوع"><Select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>{Object.entries(LEVEL).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</Select></Field><Field label="مخاطبان"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="all">همه‌ی کسب‌وکارها</option>{PLANS.map((p) => <option key={p.key} value={`plan:${p.key}`}>فقط پلن {p.name}</option>)}</Select></Field></div>
          <Field label="تاریخ پایان نمایش (شمسی)" hint="خالی = تا زمانی که غیرفعال کنید"><JalaliInput end value={f.expiresAt} onChange={(v) => setF({ ...f, expiresAt: v })} /></Field></div>}
      </Modal>
      <ConfirmDialog open={!!del} title="حذف اطلاعیه" message="اطلاعیه حذف می‌شود." onClose={() => setDel(null)} onConfirm={async () => { try { await api(`/api/admin/announcements/${del.id}`, { method: "DELETE" }); toast("حذف شد"); reload(true); } catch (e) { toast((e as Error).message, "error"); } }} />
    </div>
  );
}

export function SettingsTab({ me }: { me: Me }) {
  const toast = useToast();
  const { data, error, reload } = useGet<any>("/api/admin/settings");
  const [sup, setSup] = useState<any>(null);
  const [bill, setBill] = useState<any>(null);
  useEffect(() => { if (data) { setSup({ ...data.support }); setBill({ ...data.billing }); } }, [data]);
  if (error) return <ErrorState message={error} onRetry={() => reload()} />;
  if (!sup || !bill) return <Skeleton className="h-72 rounded-2xl" />;
  const save = async (key: string, value: any) => { try { await api("/api/admin/settings", { method: "POST", body: { key, value } }); toast("ذخیره شد"); reload(true); } catch (e) { toast((e as Error).message, "error"); } };
  const canS = me.perms.includes("settings");
  return (
    <div className="animate-fade-in space-y-5">
      <div><h1 className="text-xl font-extrabold sm:text-2xl">تنظیمات سامانه</h1><p className="mt-1 text-sm text-stone-500">اطلاعات تماس پشتیبانی (نمایش در بخش تیکت رستوران‌ها) و اطلاعات حساب برای فاکتورها</p></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4 p-5"><h3 className="font-bold"><IconText>{<EmojiIcon emoji="" />}</IconText> اطلاعات پشتیبانی</h3>
          <Field label="خط موبایل / تلفن پشتیبانی"><Input dir="ltr" className="text-left" value={sup.phone} disabled={!canS} onChange={(e) => setSup({ ...sup, phone: e.target.value })} /></Field>
          <Field label="ایمیل پشتیبانی"><Input dir="ltr" className="text-left" value={sup.email} disabled={!canS} onChange={(e) => setSup({ ...sup, email: e.target.value })} /></Field>
          <Field label="ساعت پاسخگویی"><Input value={sup.hours} disabled={!canS} onChange={(e) => setSup({ ...sup, hours: e.target.value })} /></Field>
          <Button disabled={!canS} onClick={() => save("support", sup)}>ذخیره</Button></Card>
        <Card className="space-y-4 p-5"><h3 className="font-bold"><IconText>{<EmojiIcon emoji="" />}</IconText> اطلاعات پرداخت (روی فاکتور اشتراک چاپ می‌شود)</h3>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="بانک"><Input value={bill.bank} onChange={(e) => setBill({ ...bill, bank: e.target.value })} /></Field><Field label="به نام"><Input value={bill.owner} onChange={(e) => setBill({ ...bill, owner: e.target.value })} /></Field></div>
          <Field label="شماره کارت"><Input dir="ltr" className="text-left" value={bill.card} onChange={(e) => setBill({ ...bill, card: e.target.value })} /></Field>
          <Field label="شماره شبا"><Input dir="ltr" className="text-left" value={bill.sheba} onChange={(e) => setBill({ ...bill, sheba: e.target.value })} /></Field>
          <Field label="توضیح پای فاکتور"><Textarea rows={2} value={bill.note} onChange={(e) => setBill({ ...bill, note: e.target.value })} /></Field>
          <Button onClick={() => save("billing", bill)}>ذخیره</Button></Card>
      </div>
      <p className="text-xs text-stone-400">قیمت پلن‌ها را از بخش «پلن‌ها و قیمت‌ها» تغییر دهید.</p>
    </div>
  );
}

export function AuditTab() {
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useGet<{ items: any[] }>(`/api/admin/audit?q=${encodeURIComponent(q)}`);
  return (
    <div className="animate-fade-in space-y-5">
      <div><h1 className="text-xl font-extrabold sm:text-2xl">گزارش فعالیت مدیران</h1><p className="mt-1 text-sm text-stone-500">ثبت همه‌ی اقدامات حساس: تغییر پلن، ورود به‌جای کاربر، فاکتور، حذف و…</p></div>
      <div className="relative w-72"><Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><Input className="ps-9" placeholder="جستجو در اقدام، توضیح یا نام مدیر…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <IconText>{error ? <ErrorState message={error} onRetry={() => reload()} /> : loading && !data ? <Skeleton className="h-64 rounded-2xl" /> : !data?.items.length ? <EmptyState emoji="" title="رویدادی ثبت نشده" /> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b bg-stone-50 text-xs text-stone-500"><th className="p-3 text-start">زمان</th><th className="p-3 text-start">مدیر</th><th className="p-3 text-start">اقدام</th><th className="p-3 text-start">توضیح</th></tr></thead>
          <tbody className="divide-y divide-stone-100">{data.items.map((a) => <tr key={a.id}><td className="whitespace-nowrap p-3 text-xs text-stone-500">{fmtJ(a.createdAt)} {formatTime(a.createdAt)}</td><td className="p-3 font-semibold">{a.adminName}</td><td className="p-3"><Badge color={a.action.includes("حذف") ? "rose" : a.action.includes("ورود") ? "violet" : "blue"}>{a.action}</Badge></td><td className="p-3 text-xs text-stone-600">{a.detail}{a.targetId && <span className="ms-2 text-stone-400">({a.targetType} {toFa(a.targetId)})</span>}</td></tr>)}</tbody></table></Card>
      )}</IconText>
    </div>
  );
}
void formatDate;
