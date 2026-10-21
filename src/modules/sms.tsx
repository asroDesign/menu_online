"use client";

import { useCallback, useEffect, useState } from "react";
import { api, useCollection } from "@/lib/api";
import { JalaliInput } from "@/components/jalali-input";
import { formatDate, formatPrice, formatTime, timeAgo, toFa } from "@/lib/format";
import { fromJ, fmtJ, toJ } from "@/lib/jalali";
import { OCCASIONS, SMS_VARS } from "@/lib/sms-meta";
import type { Settings } from "@/lib/plans";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, PageHeader, Select, Skeleton, Switch, Textarea, cn, useToast , EmojiIcon, IconText} from "@/components/ui";

type Tpl = { id: number; purpose: string; title: string; templateId: string; params: { name: string; var: string }[]; sampleText: string; isActive: boolean };
type Camp = { id: number; title: string; templateTitle: string; audience: string; recipients: number; sentCount: number; failedCount: number; status: string; scheduledAt: string | null; createdAt: string };
type Log = { id: number; kind: string; phone: string; customerName: string; provider: string; status: string; detail: string; createdAt: string };
type SmsCfg = NonNullable<Settings["sms"]> & { apiKeySet?: boolean };

const PURPOSE: Record<string, string> = { birthday: "تولد", occasion: "مناسبتی", promo: "تبلیغاتی", service: "خدماتی", reservation_confirmed: "تأیید رزرو", reservation_rejected: "رد رزرو" };
const AUD: Record<string, string> = { "seg:vip": "گروه ویژه (VIP)", "seg:loyal": "گروه وفادار", "seg:regular": "گروه عادی", "seg:new": "گروه جدید", "seg:at_risk": "گروه در خطر ریزش", "seg:lost": "گروه ازدست‌رفته", all: "همه مشتریان باشگاه", vip: "مشتریان ویژه (امتیاز ۸۰۰+)", inactive: "کم‌سفارش (۱ سفارش یا کمتر)", birthday_month: "متولدین این ماه", manual: "شماره‌های دستی" };
const CST: Record<string, [string, string]> = { scheduled: ["زمان‌بندی‌شده", "violet"], sending: ["در حال ارسال", "amber"], sent: ["ارسال شد", "emerald"], failed: ["ناموفق", "rose"] };

export function SmsPanel() {
  const [tab, setTab] = useState<"settings" | "templates" | "campaigns" | "auto" | "retention" | "logs">("campaigns");
  const [cfg, setCfg] = useState<SmsCfg | null>(null);
  const [err, setErr] = useState("");
  const tpls = useCollection<Tpl>("/api/r/smstemplates");
  const loadCfg = useCallback(() => api<{ item: { settings: Settings & { sms?: SmsCfg } } }>("/api/business").then((r) => setCfg(r.item.settings.sms ?? { provider: "kavenegar", apiKey: "" })).catch((e) => setErr(e.message)), []);
  useEffect(() => { loadCfg(); }, [loadCfg]);
  if (err) return <ErrorState message={err} />;
  if (!cfg) return <Skeleton className="h-96 rounded-2xl" />;
  const connected = !!cfg.apiKeySet;
  const tabs: [typeof tab, string][] = [["campaigns", " کمپین‌ها"], ["retention", "بازگشت مشتری"], ["templates", " قالب‌ها (پترن)"], ["auto", " خودکار (تولد)"], ["settings", " اتصال پنل"], ["logs", " گزارش ارسال"]];
  return (
    <div className="animate-fade-in">
      <PageHeader title="پنل پیامک باشگاه مشتریان" subtitle="ارسال پیامک مناسبتی، تبلیغاتی و تولد با روش پترن (قالب‌های تأییدشده) از طریق کاوه‌نگار یا sms.ir" actions={<Badge color={connected ? "emerald" : "amber"}>{connected ? `متصل: ${cfg.provider === "smsir" ? "sms.ir" : "کاوه‌نگار"}` : "متصل نیست"}</Badge>} />
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold", tab === k ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200")}><IconText>{l}</IconText></button>)}</div>
      <IconText>{!connected && tab !== "settings" && <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 p-4 text-sm leading-7 text-amber-900 ring-1 ring-amber-200">{<EmojiIcon emoji="" />} کلید API پنل پیامک تنظیم نشده؛ تا زمان اتصال، ارسال پیامک انجام نمی‌شود. <button className="font-bold underline" onClick={() => setTab("settings")}>اتصال پنل</button></div>}</IconText>
      {tab === "settings" && <SettingsTab cfg={cfg} templates={tpls.items} saved={loadCfg} />}
      {tab === "templates" && <TemplatesTab col={tpls} provider={cfg.provider} />}
      {tab === "campaigns" && <CampaignsTab templates={tpls.items.filter((t) => t.purpose !== "reservation_confirmed" && t.purpose !== "reservation_rejected")} />}
      {tab === "retention" && <RetentionTab templates={tpls.items.filter((t) => t.isActive && (t.purpose === "promo" || t.purpose === "occasion"))} />}
      {tab === "auto" && <AutoTab cfg={cfg} templates={tpls.items} saved={loadCfg} />}
      {tab === "logs" && <LogsTab />}
    </div>
  );
}

async function saveCfg(cfg: SmsCfg, patch: Partial<SmsCfg>, apiKey?: string) {
  const body = { ...cfg, ...patch, apiKey: apiKey ?? "", origin: location.origin };
  await api("/api/business", { method: "PATCH", body: { settings: { sms: body } } });
}

function SettingsTab({ cfg, templates, saved }: { cfg: SmsCfg; templates: Tpl[]; saved: () => void }) {
  const toast = useToast();
  const [provider, setProvider] = useState(cfg.provider);
  const [key, setKey] = useState("");
  const [sender, setSender] = useState(cfg.sender ?? "");
  const [busy, setBusy] = useState(false);
  const [tplId, setTplId] = useState("");
  const [phone, setPhone] = useState("");
  async function save() {
    setBusy(true);
    try { await saveCfg(cfg, { provider, sender }, key); toast("تنظیمات اتصال ذخیره شد"); setKey(""); saved(); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  async function test() {
    try { const r = await api<{ item: { sent: number; failed: number } }>("/api/r/smstest", { method: "POST", body: { templateId: Number(tplId || templates[0]?.id), phone } }); toast(r.item.failed ? "ارسال ناموفق بود؛ گزارش را ببینید" : "پیامک آزمایشی ارسال/ثبت شد"); } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <h3 className="font-bold">اتصال به سرویس‌دهنده</h3>
        <Field label="سرویس‌دهنده پیامک"><Select value={provider} onChange={(e) => setProvider(e.target.value as SmsCfg["provider"])}><option value="kavenegar">کاوه‌نگار (Verify / Lookup)</option><option value="smsir">sms.ir (ارسال سریع / Verify)</option></Select></Field>
        <Field label="کلید API (API Key)" hint={cfg.apiKeySet ? "کلید ذخیره شده است؛ برای تغییر، کلید جدید را وارد کنید" : "از پنل کاربری سرویس‌دهنده دریافت کنید"}><Input type="password" dir="ltr" className="text-left" value={key} onChange={(e) => setKey(e.target.value)} placeholder={cfg.apiKeySet ? "••••••••••••" : "API Key"} autoComplete="off" /></Field>
        <Field label="شماره خط (اختیاری)"><Input dir="ltr" className="text-left" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="3000xxxx" /></Field>
        <Button onClick={save} loading={busy}>ذخیره</Button>
      </Card>
      <Card className="space-y-4 p-5">
        <h3 className="font-bold">ارسال آزمایشی</h3>
        {templates.length === 0 ? <p className="text-sm text-stone-400">ابتدا یک قالب بسازید.</p> : (
          <>
            <Field label="قالب"><Select value={tplId || String(templates[0].id)} onChange={(e) => setTplId(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></Field>
            <Field label="موبایل گیرنده"><Input dir="ltr" className="text-left" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09121234567" /></Field>
            <Button variant="secondary" onClick={test} disabled={!phone.trim()}>ارسال تست</Button>
          </>
        )}
        <div className="rounded-xl bg-stone-50 p-4 text-xs leading-7 text-stone-600">
          <b>روش پترن چیست؟</b> متن پیامک را یک‌بار در پنل سرویس‌دهنده می‌سازید و تأیید می‌گیرید؛ سپس فقط «نام/شناسه قالب» و مقدار متغیرها ارسال می‌شود. در کاوه‌نگار نام قالب و متغیرها <code dir="ltr">%token %token2 %token3</code> و در sms.ir شناسه‌ی عددی قالب و متغیرهای <code dir="ltr">#NAME#</code> هستند.
        </div>
      </Card>
    </div>
  );
}

function TemplatesTab({ col, provider }: { col: ReturnType<typeof useCollection<Tpl>>; provider: string }) {
  const toast = useToast();
  const [edit, setEdit] = useState<Tpl | "new" | null>(null);
  const [f, setF] = useState({ purpose: "promo", title: "", templateId: "", sampleText: "", params: [] as { name: string; var: string }[] });
  const [del, setDel] = useState<Tpl | null>(null);
  const open = (t: Tpl | "new") => { setF(t === "new" ? { purpose: "promo", title: "", templateId: "", sampleText: "", params: [{ name: provider === "smsir" ? "NAME" : "token", var: "customer_name" }] } : { purpose: t.purpose, title: t.title, templateId: t.templateId, sampleText: t.sampleText, params: t.params }); setEdit(t); };
  async function save() {
    if (!f.title.trim() || !f.templateId.trim()) return toast("عنوان و نام/شناسه قالب را وارد کنید", "error");
    const target = edit; setEdit(null);
    try {
      if (target === "new") { await col.create(f, { ...f, isActive: true } as never); toast("قالب اضافه شد"); }
      else if (target) { await col.update(target.id, f); toast("ذخیره شد"); }
    } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm leading-6 text-stone-500">هر قالب به یک پترن تأییدشده در پنل پیامک شما اشاره می‌کند. برای پیامک رزرو، دو پترن ثابتِ تأیید و رد بسازید؛ متن وضعیت از همان پترن ارسال می‌شود.</p><Button onClick={() => open("new")}><Icon name="plus" className="size-4" /> قالب جدید</Button></div>
      <IconText>{col.loading ? <Skeleton className="h-48 rounded-2xl" /> : col.items.length === 0 ? <EmptyState emoji="" title="هنوز قالبی تعریف نشده" description="برای هر مناسبت (تولد، یلدا، تخفیف…) یک قالب بسازید." action={<Button onClick={() => open("new")}>ساخت قالب</Button>} /> : (
        <div className="grid gap-4 md:grid-cols-2">{col.items.map((t) => (
          <Card key={t.id} className={cn("p-4 animate-pop", t.id < 0 && "opacity-60")}>
            <div className="flex items-start justify-between gap-2"><div><p className="font-bold">{t.title}</p><div className="mt-1 flex gap-1.5"><Badge color="brand">{PURPOSE[t.purpose]}</Badge><Badge><span dir="ltr">{t.templateId}</span></Badge></div></div><div className="flex"><IconButton icon="edit" label="ویرایش" onClick={() => open(t)} /><IconButton icon="trash" label="حذف" className="hover:text-rose-600" onClick={() => setDel(t)} /></div></div>
            <p className="mt-3 rounded-xl bg-stone-50 p-3 text-xs leading-7 text-stone-600">{t.sampleText || "—"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{t.params.map((p, i) => <Badge key={i} color="blue">{p.name} ← {SMS_VARS[p.var]}</Badge>)}</div>
          </Card>
        ))}</div>
      )}</IconText>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "قالب جدید" : "ویرایش قالب"} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>انصراف</Button><Button onClick={save}>ذخیره</Button></>}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2"><Field label="کاربرد"><Select value={f.purpose} onChange={(e) => {
            const purpose = e.target.value;
            const isReservation = purpose === "reservation_confirmed" || purpose === "reservation_rejected";
            const sampleText = purpose === "reservation_confirmed" ? "رزرو میز شما تأیید شد." : "متأسفانه امکان تأیید رزرو میز شما وجود ندارد.";
            setF({ ...f, purpose, ...(isReservation ? { params: [], sampleText } : {}) });
          }}>{Object.entries(PURPOSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field><Field label="عنوان داخلی"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="تبریک تولد" /></Field></div>
          <Field label={provider === "smsir" ? "شناسه قالب (TemplateId عددی)" : "نام قالب (Template) در کاوه‌نگار"}><Input dir="ltr" className="text-left" value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })} placeholder={provider === "smsir" ? "123456" : "birthday"} /></Field>
          <Field label="متن نمونه‌ی قالب (برای پیش‌نمایش و گزارش)" hint="مثال: %token عزیز، تولدت مبارک! کد تخفیف %token2 در %token3"><Textarea rows={3} value={f.sampleText} onChange={(e) => setF({ ...f, sampleText: e.target.value })} /></Field>
          <div>
            <p className="mb-2 text-xs font-semibold text-stone-600">پارامترهای قالب (به ترتیب) — حداکثر ۵</p>
            <div className="space-y-2">{f.params.map((p, i) => (
              <div key={i} className="flex gap-2"><Input dir="ltr" className="w-32 text-left" value={p.name} onChange={(e) => setF({ ...f, params: f.params.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder={provider === "smsir" ? "NAME" : `token${i ? i + 1 : ""}`} /><Select value={p.var} onChange={(e) => setF({ ...f, params: f.params.map((x, j) => (j === i ? { ...x, var: e.target.value } : x)) })}>{Object.entries(SMS_VARS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select><IconButton icon="x" label="حذف" onClick={() => setF({ ...f, params: f.params.filter((_, j) => j !== i) })} /></div>
            ))}{f.params.length < 5 && <Button size="sm" variant="secondary" onClick={() => setF({ ...f, params: [...f.params, { name: provider === "smsir" ? "" : `token${f.params.length ? f.params.length + 1 : ""}`, var: "customer_name" }] })}><Icon name="plus" className="size-4" /> پارامتر</Button>}</div>
            <p className="mt-2 text-[11px] leading-6 text-stone-400">{provider === "smsir" ? "نام پارامتر باید دقیقاً مطابق متغیر قالب در sms.ir باشد (بدون #). مقدار هر پارامتر حداکثر ۲۵ کاراکتر." : "در کاوه‌نگار ترتیب پارامترها مهم است: اولی token، دومی token2، سومی token3 (بدون فاصله) و چهارمی/پنجمی token10/token20 (فاصله‌دار)."}</p>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} title="حذف قالب" message={`قالب «${del?.title}» حذف می‌شود.`} onClose={() => setDel(null)} onConfirm={() => del && col.remove(del.id).catch((e) => toast(e.message, "error"))} />
    </div>
  );
}

function nextOccurrence(m: number, d: number) {
  const now = new Date();
  const { jy } = toJ(now);
  let t = fromJ(jy, m, d, 10);
  if (t.getTime() < now.getTime()) t = fromJ(jy + 1, m, d, 10);
  return t;
}

function CampaignsTab({ templates }: { templates: Tpl[] }) {
  const toast = useToast();
  const col = useCollection<Camp>("/api/r/smscampaigns", { poll: 5000 });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", templateId: "", audience: "all", numbers: "", code: "", discount: "", when: "now" as "now" | "later", date: "", time: "10:00" });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<Camp | null>(null);
  const tplId = f.templateId || String(templates[0]?.id ?? "");
  async function send() {
    setBusy(true);
    try {
      let scheduleAt: string | null = null;
      if (f.when === "later") {
        if (!f.date) throw new Error("تاریخ ارسال را وارد کنید");
        const [h, mi] = f.time.split(":").map(Number);
        const { jy, jm, jd } = toJ(f.date);
        scheduleAt = fromJ(jy, jm, jd, h || 0, mi || 0).toISOString();
      }
      const { item } = await api<{ item: Camp }>("/api/r/smscampaigns", { method: "POST", body: { ...f, templateId: Number(tplId), scheduleAt, origin: location.origin } });
      col.setItems((x) => [item, ...x]);
      setOpen(false);
      toast(scheduleAt ? "کمپین زمان‌بندی شد" : "ارسال کمپین آغاز شد");
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><p className="text-sm text-stone-500">کمپین تبلیغاتی، مناسبتی یا خدماتی بسازید و همین حالا یا در تاریخ شمسی دلخواه ارسال کنید.</p><Button onClick={() => { setF({ title: "", templateId: "", audience: "all", numbers: "", code: "", discount: "", when: "now", date: "", time: "10:00" }); setOpen(true); }} disabled={!templates.length}><Icon name="plus" className="size-4" /> کمپین جدید</Button></div>
      <IconText>{templates.length === 0 && <EmptyState emoji="" title="ابتدا یک قالب بسازید" description="بدون قالب (پترن) امکان ارسال نیست؛ از تب «قالب‌ها» شروع کنید." />}</IconText>
      <IconText>{templates.length > 0 && (col.loading ? <Skeleton className="h-48 rounded-2xl" /> : col.items.length === 0 ? <EmptyState emoji="" title="هنوز کمپینی ارسال نشده" description="برای نوروز، یلدا یا تخفیف ویژه کمپین بسازید." action={<Button onClick={() => setOpen(true)}>کمپین جدید</Button>} /> : (
        <div className="space-y-2.5">{col.items.map((c) => (
          <Card key={c.id} className="flex flex-wrap items-center gap-3 p-4 animate-pop">
            <div className="min-w-48 flex-1"><p className="font-bold">{c.title}</p><p className="text-xs text-stone-500">{c.templateTitle} · {AUD[c.audience]} · {toFa(c.recipients)} نفر</p></div>
            <Badge color={CST[c.status]?.[1]}>{CST[c.status]?.[0]}</Badge>
            {c.status === "scheduled" && c.scheduledAt && <span className="text-xs text-violet-700">{<EmojiIcon emoji="" />} {fmtJ(c.scheduledAt)} {formatTime(c.scheduledAt)}</span>}
            {(c.status === "sent" || c.status === "failed") && <span className="text-xs text-stone-500">{<EmojiIcon emoji="" />} {toFa(c.sentCount)} · ✘ {toFa(c.failedCount)}</span>}
            <span className="text-xs text-stone-400">{timeAgo(c.createdAt)}</span>
            {c.status === "scheduled" && <IconButton icon="trash" label="لغو" className="hover:text-rose-600" onClick={() => setDel(c)} />}
          </Card>
        ))}</div>
      ))}</IconText>
      <Modal open={open} onClose={() => setOpen(false)} title="کمپین پیامکی جدید" size="lg" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button><Button loading={busy} onClick={send}>{f.when === "now" ? "ارسال اکنون" : "زمان‌بندی"}</Button></>}>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-stone-600">کمپین مناسبتی (انتخاب سریع)</p>
            <div className="flex flex-wrap gap-1.5">{OCCASIONS.map((o) => <button key={o.key} onClick={() => setF({ ...f, title: `کمپین ${o.title}`, when: "later", date: nextOccurrence(o.m, o.d).toISOString() })} className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100">{o.title}</button>)}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="عنوان کمپین"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="تخفیف شب یلدا" /></Field>
            <Field label="قالب (پترن)"><Select value={tplId} onChange={(e) => setF({ ...f, templateId: e.target.value })}>{templates.filter((t) => t.isActive).map((t) => <option key={t.id} value={t.id}>{PURPOSE[t.purpose]} — {t.title}</option>)}</Select></Field>
            <Field label="گیرندگان"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{Object.entries(AUD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="کد تخفیف (متغیر «کد تخفیف»)"><Input dir="ltr" className="text-left uppercase" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="YALDA25" /></Field>
            <Field label="مقدار تخفیف (متغیر «مقدار تخفیف»)"><Input value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} placeholder="۲۵٪" /></Field>
            {f.audience === "manual" && <Field label="شماره‌ها" className="sm:col-span-2"><Textarea rows={2} dir="ltr" value={f.numbers} onChange={(e) => setF({ ...f, numbers: e.target.value })} placeholder="09121234567, 09351234567" /></Field>}
          </div>
          <div className="rounded-xl bg-stone-50 p-3">
            <div className="flex gap-2 text-sm">{([["now", "ارسال فوری"], ["later", "زمان‌بندی (تاریخ شمسی)"]] as const).map(([k, l]) => <button key={k} onClick={() => setF({ ...f, when: k })} className={cn("rounded-lg px-3.5 py-2 font-semibold", f.when === k ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200")}>{l}</button>)}</div>
            {f.when === "later" && <div className="mt-3 grid grid-cols-2 gap-3"><Field label="تاریخ"><JalaliInput value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field><Field label="ساعت"><Input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field></div>}
            {f.when === "later" && f.date && <p className="mt-2 text-xs text-violet-700">ارسال در {fmtJ(f.date)} ساعت {toFa(f.time)}</p>}
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} title="لغو کمپین" message="کمپین زمان‌بندی‌شده حذف می‌شود." confirmLabel="لغو کمپین" onClose={() => setDel(null)} onConfirm={() => del && col.remove(del.id).catch((e) => toast(e.message, "error"))} />
    </div>
  );
}

function AutoTab({ cfg, templates, saved }: { cfg: SmsCfg; templates: Tpl[]; saved: () => void }) {
  const toast = useToast();
  const [on, setOn] = useState(!!cfg.birthdayAuto);
  const [tpl, setTpl] = useState(String(cfg.birthdayTemplateId ?? ""));
  const [code, setCode] = useState(cfg.birthdayCode ?? "");
  const [disc, setDisc] = useState(cfg.birthdayDiscount ?? "");
  const [busy, setBusy] = useState("");
  async function save() {
    setBusy("s");
    try { await saveCfg(cfg, { birthdayAuto: on, birthdayTemplateId: tpl ? Number(tpl) : undefined, birthdayCode: code, birthdayDiscount: disc }); toast("تنظیمات ذخیره شد"); saved(); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(""); }
  }
  async function run() {
    setBusy("r");
    try { const r = await api<{ item: { campaigns: number; birthdays: number; retention?: number } }>("/api/r/smsauto", { method: "POST", body: {} }); toast(`اجرا شد: ${toFa(r.item.birthdays)} تولد، ${toFa(r.item.campaigns)} کمپین زمان‌بندی‌شده، ${toFa(r.item.retention ?? 0)} پیام بازگشت مشتری`); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(""); }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between"><div><h3 className="font-bold"><IconText>{<EmojiIcon emoji="" />}</IconText> تبریک خودکار تولد</h3><p className="mt-1 text-xs leading-6 text-stone-500">در روز تولد شمسی هر مشتری، پیامک پترن ارسال می‌شود (سالی یک‌بار برای هر مشتری).</p></div><Switch checked={on} onChange={setOn} label="تولد خودکار" /></div>
        <Field label="قالب تولد"><Select value={tpl} onChange={(e) => setTpl(e.target.value)}><option value="">— انتخاب قالب —</option>{templates.filter((t) => t.purpose === "birthday" || true).map((t) => <option key={t.id} value={t.id}>{PURPOSE[t.purpose]} — {t.title}</option>)}</Select></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="کد تخفیف هدیه"><Input dir="ltr" className="text-left uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BDAY20" /></Field><Field label="مقدار تخفیف (متن)"><Input value={disc} onChange={(e) => setDisc(e.target.value)} placeholder="۲۰٪" /></Field></div>
        <Button onClick={save} loading={busy === "s"}>ذخیره</Button>
      </Card>
      <Card className="space-y-3 p-5">
        <h3 className="font-bold"><IconText>{<EmojiIcon emoji="" />}</IconText> اجرای خودکار</h3>
        <p className="text-sm leading-7 text-stone-600">سرور کمپین‌های زمان‌بندی‌شده، پیامک‌های تولد و صف بازگشت مشتری را بررسی می‌کند. برای اجرای بیرونی (Cron) آدرس <code dir="ltr" className="rounded bg-stone-100 px-1.5">/api/cron/sms?key=CRON_SECRET</code> را فراخوانی کنید.</p>
        <Button variant="secondary" onClick={run} loading={busy === "r"}><IconText>{<EmojiIcon emoji="" />}</IconText> اجرای فوری</Button>
        <div className="rounded-xl bg-stone-50 p-4 text-xs leading-7 text-stone-600"><b>تاریخ تولد مشتری</b> را در بخش «باشگاه مشتریان» (ماه و روز شمسی) ثبت کنید. مشتریانی که «دریافت پیامک» را خاموش کرده‌اند پیامی دریافت نمی‌کنند.</div>
      </Card>
    </div>
  );
}

function LogsTab() {
  const [d, setD] = useState<{ items: Log[]; stats: { sent: number; sim: number; failed: number } } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { const load = () => api<NonNullable<typeof d>>("/api/r/smslogs").then(setD).catch((e) => setErr(e.message)); load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);
  if (err) return <ErrorState message={err} />;
  if (!d) return <Skeleton className="h-64 rounded-2xl" />;
  const KIND: Record<string, string> = { campaign: "کمپین", retention: "بازگشت مشتری", birthday: "تولد", test: "تست", reservation_confirmed: "تأیید رزرو", reservation_rejected: "رد رزرو" };
  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">{[["ارسال موفق", d.stats.sent, "text-emerald-600"], ["ناموفق", d.stats.failed, "text-rose-600"]].map(([l, v, c]) => <Card key={l as string} className="p-4"><p className="text-xs text-stone-500">{l as string}</p><p className={cn("mt-1 text-2xl font-black", c as string)}>{toFa(v as number)}</p></Card>)}</div>
      <IconText>{d.items.length === 0 ? <EmptyState emoji="" title="هنوز پیامکی ارسال نشده" /> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b bg-stone-50/70 text-xs text-stone-500"><th className="p-3 text-start">زمان</th><th className="p-3 text-start">نوع</th><th className="p-3 text-start">گیرنده</th><th className="p-3 text-start">وضعیت</th><th className="p-3 text-start">جزئیات</th></tr></thead>
          <tbody className="divide-y divide-stone-100">{d.items.map((l) => <tr key={l.id}><td className="whitespace-nowrap p-3 text-xs text-stone-500">{formatDate(l.createdAt)} {formatTime(l.createdAt)}</td><td className="p-3"><Badge>{KIND[l.kind]}</Badge></td><td className="p-3"><span dir="ltr">{l.phone}</span> <span className="text-xs text-stone-400">{l.customerName}</span></td><td className="p-3"><Badge color={l.status === "sent" ? "emerald" : "rose"}>{l.status === "sent" ? "ارسال شد" : "ناموفق"}</Badge></td><td className="max-w-72 truncate p-3 text-xs text-stone-500" title={l.detail}>{l.detail}</td></tr>)}</tbody></table></Card>
      )}</IconText>
    </div>
  );
}

type RetentionRuleView = {
  id: number; title: string; triggerType: "inactive_days" | "segment_enter" | "segment_exit"; inactiveDays: number | null;
  segmentKey: string | null; templateId: number; cooldownDays: number; maxMarketingSms30Days: number; sendHourTehran: number;
  attributionDays: number; discountCode: string; discountLabel: string; isActive: boolean;
  counts: Record<string, number>; conversions: number; attributedRevenue: number;
};
const SEGMENT_LABELS: Record<string, string> = { vip: "ویژه", loyal: "وفادار", regular: "عادی", new: "جدید", at_risk: "در خطر ریزش", lost: "ازدست‌رفته", none: "بدون خرید" };
const DELIVERY_LABELS: Record<string, string> = { queued: "در صف", sending: "در حال ارسال", sent: "موفق", skipped: "ردشده طبق شرط", failed: "ناموفق", uncertain: "نتیجه نامشخص" };

function RetentionTab({ templates }: { templates: Tpl[] }) {
  const toast = useToast();
  const [items, setItems] = useState<RetentionRuleView[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: "", triggerType: "inactive_days", inactiveDays: "30", segmentKey: "at_risk", templateId: "", cooldownDays: "30", maxMarketingSms30Days: "4", sendHourTehran: "10", attributionDays: "7", discountCode: "", discountLabel: "" });
  const selectedTemplate = f.templateId || String(templates[0]?.id ?? "");
  const load = useCallback(() => api<{ items: RetentionRuleView[] }>("/api/sms-retention").then((r) => { setItems(r.items); setError(""); }).catch((e) => setError((e as Error).message)), []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!templates.length) return toast("ابتدا یک قالب فعال تبلیغاتی بسازید", "error");
    setBusy(true);
    try {
      await api("/api/sms-retention", { method: "POST", body: { ...f, templateId: Number(selectedTemplate), inactiveDays: Number(f.inactiveDays), cooldownDays: Number(f.cooldownDays), maxMarketingSms30Days: Number(f.maxMarketingSms30Days), sendHourTehran: Number(f.sendHourTehran), attributionDays: Number(f.attributionDays) } });
      toast("اتوماسیون بازگشت مشتری ساخته شد؛ ارزیابی در نوبت Cron انجام می‌شود");
      setF({ ...f, title: "" });
      await load();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function toggle(item: RetentionRuleView) {
    try {
      await api(`/api/sms-retention/${item.id}`, { method: "PATCH", body: { isActive: !item.isActive } });
      await load();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  if (error && !items) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!items) return <Skeleton className="h-72 rounded-2xl" />;

  return <div className="space-y-5">
    <Card className="p-4 text-sm leading-7 text-stone-600">
      <b>اتوماسیون بازگشت مشتری</b> با همان قالب‌های پترن و درگاه پیامک کار می‌کند. محرک می‌تواند بی‌خرید ماندن یا ورود/خروج از یک گروه مشتری باشد. رضایت پیامک و شماره در لحظهٔ ارسال دوباره بررسی می‌شود؛ خرید تازه، cooldown و سقف ماهانه پیام بازگشت را متوقف می‌کند. درآمد منتسب فقط جمع سفارش‌های پرداخت‌شده در پنجرهٔ انتخابی و با آخرین پیام موفق پیش از خرید است؛ این شاخص اثر علّی کمپین را اثبات نمی‌کند.
    </Card>
    {templates.length === 0 ? <EmptyState emoji="" title="قالب تبلیغاتی فعالی نیست" description="از تب قالب‌ها یک پترن فعال با کاربرد تبلیغاتی یا مناسبتی بسازید." /> : <Card className="space-y-4 p-5">
      <h3 className="font-bold">ساخت اتوماسیون</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="نام اتوماسیون"><Input maxLength={100} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="یادآوری به مشتریان غیرفعال" /></Field>
        <Field label="محرک"><Select value={f.triggerType} onChange={(e) => setF({ ...f, triggerType: e.target.value })}><option value="inactive_days">بدون خرید برای چند روز</option><option value="segment_enter">ورود به گروه مشتری</option><option value="segment_exit">خروج از گروه مشتری</option></Select></Field>
        {f.triggerType === "inactive_days" ? <Field label="تعداد روز بدون خرید"><Input type="number" min={1} max={365} value={f.inactiveDays} onChange={(e) => setF({ ...f, inactiveDays: e.target.value })} /></Field> : <Field label="گروه هدف"><Select value={f.segmentKey} onChange={(e) => setF({ ...f, segmentKey: e.target.value })}>{Object.entries(SEGMENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>}
        <Field label="قالب (پترن)"><Select value={selectedTemplate} onChange={(e) => setF({ ...f, templateId: e.target.value })}>{templates.map((t) => <option key={t.id} value={t.id}>{PURPOSE[t.purpose]} — {t.title}</option>)}</Select></Field>
        <Field label="فاصله ارسال مجدد (روز)"><Input type="number" min={1} max={90} value={f.cooldownDays} onChange={(e) => setF({ ...f, cooldownDays: e.target.value })} /></Field>
        <Field label="سقف پیام بازاریابی در ۳۰ روز"><Input type="number" min={1} max={20} value={f.maxMarketingSms30Days} onChange={(e) => setF({ ...f, maxMarketingSms30Days: e.target.value })} /></Field>
        <Field label="ساعت ارسال به وقت تهران"><Input type="number" min={0} max={23} value={f.sendHourTehran} onChange={(e) => setF({ ...f, sendHourTehran: e.target.value })} /></Field>
        <Field label="پنجره انتساب فروش (روز)"><Input type="number" min={1} max={30} value={f.attributionDays} onChange={(e) => setF({ ...f, attributionDays: e.target.value })} /></Field>
        <Field label="کد تخفیف فعال (اختیاری)"><Input dir="ltr" className="text-left uppercase" maxLength={30} value={f.discountCode} onChange={(e) => setF({ ...f, discountCode: e.target.value.toUpperCase() })} placeholder="WELCOME10" /></Field>
        <Field label="متن تخفیف برای پترن (اختیاری)"><Input maxLength={40} value={f.discountLabel} onChange={(e) => setF({ ...f, discountLabel: e.target.value })} placeholder="۱۰٪ تخفیف" /></Field>
      </div>
      <p className="text-xs leading-6 text-stone-500">کد باید از قبل در تخفیف‌های همین کسب‌وکار فعال باشد؛ سیستم اینجا کد تازه یا مصرف تکراری ایجاد نمی‌کند. گروه مشتری در Cron دوره‌ای نمونه‌برداری می‌شود.</p>
      <Button onClick={create} loading={busy}><Icon name="plus" className="size-4" /> ساخت اتوماسیون</Button>
    </Card>}
    {items.length === 0 ? <EmptyState emoji="" title="اتوماسیونی تعریف نشده" description="برای بازگشت مشتری، اولین قاعده را ایجاد کنید." /> : <div className="space-y-3">{items.map((item) => <Card key={item.id} className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-48 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{item.title}</h3><Badge color={item.isActive ? "emerald" : "stone"}>{item.isActive ? "فعال" : "متوقف"}</Badge></div><p className="mt-1 text-xs text-stone-500">{item.triggerType === "inactive_days" ? `${toFa(item.inactiveDays ?? 0)} روز بدون خرید` : `${item.triggerType === "segment_enter" ? "ورود به" : "خروج از"} گروه ${SEGMENT_LABELS[item.segmentKey ?? ""] ?? "—"}`} · هر {toFa(item.cooldownDays)} روز · ساعت {toFa(item.sendHourTehran)} تهران · پنجره {toFa(item.attributionDays)} روز</p></div><Button size="sm" variant={item.isActive ? "secondary" : "primary"} onClick={() => void toggle(item)}>{item.isActive ? "توقف" : "فعال‌سازی"}</Button></div>
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">{["queued", "sending", "sent", "skipped", "failed", "uncertain"].map((key) => <div key={key} className="rounded-xl bg-base-200/60 p-2.5"><span className="block text-[11px] text-base-content/55">{DELIVERY_LABELS[key]}</span><b>{toFa(item.counts[key] ?? 0)}</b></div>)}</div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-stone-600"><span>تبدیل پرداخت‌شده منتسب به آخرین لمس: <b>{toFa(item.conversions)}</b></span><span>درآمد منتسب: <b>{formatPrice(item.attributedRevenue)}</b></span></div>
    </Card>)}</div>}
  </div>;
}
