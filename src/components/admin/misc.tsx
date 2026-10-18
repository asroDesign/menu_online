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
import { ImageUpload } from "@/components/image-upload";
import { notifyPlatformBrandingUpdated } from "@/components/brand";

const LEVEL: Record<string, [string, string]> = { info: ["اطلاع‌رسانی", "blue"], warning: ["هشدار", "amber"], success: ["خبر خوب", "emerald"] };
const PLATFORM_SMS_KIND: Record<string, string> = { otp: "کد ورود", renewal: "یادآوری تمدید", occasion: "مناسبتی", manager_demo: "اعلان درخواست دمو", manager_plan_request: "اعلان درخواست پلن", manager_plan_sale: "اعلان فروش پلن" };
const PLATFORM_SMS_GUIDES = {
  otp: { title: "کد ورود", sample: "کد ورود شما: {code}", variables: ["code: کد یک‌بارمصرف ورود"], note: "متغیر code را به عنوان تنها پارامتر الگو تعریف کنید." },
  renewal: { title: "یادآوری تمدید", sample: "مدیر گرامی {business}، اشتراک پلن {plan} شما {days} روز دیگر پایان می‌یابد.", variables: ["business: نام کسب‌وکار", "plan: نام پلن", "days: تعداد روز تا پایان اشتراک"], note: "متغیرها را با همان ترتیب فیلد پارامترها بسازید. اگر متن الگوی شما متغیری ندارد، فیلد پارامترها را خالی بگذارید." },
  occasion: { title: "طرح مناسبتی", sample: "مدیر گرامی {business}، {occasion} مبارک! پلن شما: {plan}", variables: ["business: نام کسب‌وکار", "plan: نام پلن", "occasion: عنوان مناسبت"], note: "عنوانی که هنگام ساخت طرح وارد می‌کنید جایگزین occasion می‌شود." },
  adminAlert: { title: "اعلان مدیر", sample: "{event} جدید\nنام: {name}\nتماس: {phone}\nجزئیات: {details}", variables: ["event: درخواست دمو، درخواست پلن یا فروش پلن", "name: نام متقاضی یا کسب‌وکار", "phone: شماره تماس مشتری", "details: نام پلن، نام کسب‌وکار یا مشخصات درخواست"], note: "این الگو برای اطلاع‌رسانی به شماره مدیر استفاده می‌شود. ترتیب متغیرها را مطابق فهرست پارامترها وارد کنید." },
} as const;

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
          // eslint-disable-next-line react-hooks/purity
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
  const [branding, setBranding] = useState<any>(null);
  const [manager, setManager] = useState<any>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (data) { setSup({ ...data.support }); setBill({ ...data.billing }); setBranding({ ...data.platformBranding }); setManager({ ...data.managerNotifications }); } }, [data]);
  if (error) return <ErrorState message={error} onRetry={() => reload()} />;
  if (!sup || !bill || !branding || !manager) return <Skeleton className="h-72 rounded-2xl" />;
  const save = async (key: string, value: any) => { try { await api("/api/admin/settings", { method: "POST", body: { key, value } }); if (key === "platformBranding") notifyPlatformBrandingUpdated(); toast("ذخیره شد"); reload(true); } catch (e) { toast((e as Error).message, "error"); } };
  const canS = me.perms.includes("settings");
  return (
    <div className="animate-fade-in space-y-5">
      <div><h1 className="text-xl font-extrabold sm:text-2xl">تنظیمات سامانه</h1><p className="mt-1 text-sm text-stone-500">اطلاعات تماس پشتیبانی (نمایش در بخش تیکت رستوران‌ها) و اطلاعات حساب برای فاکتورها</p></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4 p-5 lg:col-span-2"><div><h3 className="font-bold">نام و لوگوی سامانه</h3><p className="mt-1 text-xs leading-6 text-stone-500">این برند در سربرگ سایت، صفحه ورود و بخش‌های عمومی نمایش داده می‌شود.</p></div>
          <Field label="نام سایت *"><Input value={branding.siteName} disabled={!canS} maxLength={80} onChange={(e) => setBranding({ ...branding, siteName: e.target.value })} /></Field>
          <ImageUpload value={branding.logoUrl} emoji="" uploadUrl="/api/admin/branding/logo" label="لوگوی سامانه" description="تصویر مربعی یا افقی JPG، PNG، WebP یا GIF بارگذاری کنید؛ حداکثر ۲٫۵ مگابایت." disabled={!canS} onChange={(logoUrl) => setBranding({ ...branding, logoUrl })} />
          <Button disabled={!canS} onClick={() => save("platformBranding", branding)}>ذخیره برند سامانه</Button>
        </Card>
        <Card className="space-y-4 p-5"><h3 className="font-bold"><IconText>{<EmojiIcon emoji="" />}</IconText> اطلاعات پشتیبانی</h3>
          <Field label="خط موبایل / تلفن پشتیبانی"><Input dir="ltr" className="text-left" value={sup.phone} disabled={!canS} onChange={(e) => setSup({ ...sup, phone: e.target.value })} /></Field>
          <Field label="ایمیل پشتیبانی"><Input dir="ltr" className="text-left" value={sup.email} disabled={!canS} onChange={(e) => setSup({ ...sup, email: e.target.value })} /></Field>
          <Field label="ساعت پاسخگویی"><Input value={sup.hours} disabled={!canS} onChange={(e) => setSup({ ...sup, hours: e.target.value })} /></Field>
          <Button disabled={!canS} onClick={() => save("support", sup)}>ذخیره</Button></Card>
        <Card className="space-y-4 p-5"><div><h3 className="font-bold">شماره اطلاع‌رسانی مدیر</h3><p className="mt-1 text-xs leading-6 text-stone-500">درخواست دموی رایگان، درخواست خرید پلن و فروش موفق اشتراک به این شماره پیامک می‌شود. ارسال از الگوی «اعلان مدیر» در پنل پیامک مرکزی انجام می‌شود.</p></div>
          <Field label="شماره موبایل مدیر"><Input dir="ltr" className="text-left" inputMode="tel" placeholder="09xxxxxxxxx" value={manager.phone} disabled={!canS} onChange={(e) => setManager({ ...manager, phone: e.target.value })} /></Field>
          <Button disabled={!canS} onClick={() => save("managerNotifications", manager)}>ذخیره شماره اطلاع‌رسانی</Button></Card>
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

export function PlatformChannelsTab() {
  const toast = useToast();
  const { data, error, loading, reload } = useGet<any>("/api/admin/settings");
  const campaigns = useGet<any>("/api/admin/platform-sms");
  const [payments, setPayments] = useState<any>(null);
  const [sms, setSms] = useState<any>(null);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDate, setCampaignDate] = useState("");
  const [saving, setSaving] = useState("");
  const [guide, setGuide] = useState<keyof typeof PLATFORM_SMS_GUIDES | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (data) { setPayments({ ...data.platformPayments }); setSms({ ...data.platformSms, clearSmsirKey: false, clearKavenegarKey: false }); } }, [data]);
  async function save(key: string, value: any) {
    setSaving(key);
    try { await api("/api/admin/settings", { method: "POST", body: { key, value } }); toast("تنظیمات ذخیره شد"); await reload(true); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(""); }
  }
  async function createCampaign() {
    if (!campaignTitle.trim() || !sms?.enabled) return;
    setSaving("campaign");
    try { await api("/api/admin/platform-sms", { method: "POST", body: { title: campaignTitle, scheduledAt: campaignDate || new Date().toISOString() } }); toast(campaignDate ? "طرح مناسبتی زمان‌بندی شد" : "ارسال طرح مناسبتی شروع شد"); setCampaignTitle(""); setCampaignDate(""); await campaigns.reload(true); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(""); }
  }
  if (error) return <ErrorState message={error} onRetry={() => reload()} />;
  if (loading && !data || !sms || !payments) return <Skeleton className="h-80 rounded-2xl" />;
  const template = (key: keyof typeof PLATFORM_SMS_GUIDES, field: string, value: any) => setSms((s: any) => ({ ...s, templates: { ...s.templates, [key]: { ...s.templates[key], [field]: value } } }));
  const patternFields = (key: "otp" | "renewal" | "occasion" | "adminAlert", title: string) => (
    <div className="space-y-3 rounded-2xl border border-base-300 bg-base-100 p-4">
      <div className="flex items-center justify-between gap-2"><h4 className="font-bold">الگوی {title}</h4><IconButton type="button" icon="book" label={`راهنمای الگوی ${title}`} onClick={() => setGuide(key)} /></div>
      <Field label={`شناسه الگوی ${sms.provider === "smsir" ? "sms.ir" : "کاوه‌نگار"}`}><Input dir="ltr" className="text-left" value={sms.templates[key][sms.provider === "smsir" ? "smsirId" : "kavenegarId"]} onChange={(e) => template(key, sms.provider === "smsir" ? "smsirId" : "kavenegarId", e.target.value)} /></Field>
      <Field label="نام پارامترهای الگو، به ترتیب (با ویرگول جدا شود)" hint={key === "otp" ? "متغیر: code" : key === "renewal" ? "متغیرها: business, plan, days" : key === "occasion" ? "متغیرها: business, plan, occasion" : "متغیرها: event, name, phone, details"}><Input dir="ltr" className="text-left" value={sms.templates[key].params.join(", ")} onChange={(e) => template(key, "params", e.target.value.split(",").map((x: string) => x.trim()).filter(Boolean))} /></Field>
      <p className="text-[11px] leading-6 text-base-content/55">ترتیب این نام‌ها باید با ترتیب متغیرهای الگوی تأییدشده در پنل پیامکی یکسان باشد.</p>
    </div>
  );
  return (
    <div className="animate-fade-in space-y-5">
      <div><h1 className="text-xl font-extrabold sm:text-2xl">درگاه پرداخت و پیامک سامانه</h1><p className="mt-1 text-sm text-stone-500">اتصال فروش اشتراک به درگاه‌ها، ورود پیامکی و یادآوری‌های سراسری مشتریان فعال</p></div>
      <Card className="space-y-4 p-5"><div><h3 className="font-bold">درگاه‌های فروش اشتراک</h3><p className="mt-1 text-xs leading-6 text-stone-500">شناسه پذیرنده را از پنل درگاه وارد کنید. کاربر هنگام پرداخت یکی از درگاه‌های فعال را انتخاب می‌کند.</p></div>
        <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-3 rounded-2xl border border-base-300 p-4"><div className="flex items-center justify-between"><b>زرین‌پال</b><Switch checked={payments.zarinpalEnabled} label="فعال" onChange={(v) => setPayments({ ...payments, zarinpalEnabled: v })} /></div><Field label="شناسه پذیرنده"><Input dir="ltr" className="text-left" value={payments.zarinpalMerchantId} onChange={(e) => setPayments({ ...payments, zarinpalMerchantId: e.target.value })} /></Field></div>
          <div className="space-y-3 rounded-2xl border border-base-300 p-4"><div className="flex items-center justify-between"><b>زیبال</b><Switch checked={payments.zibalEnabled} label="فعال" onChange={(v) => setPayments({ ...payments, zibalEnabled: v })} /></div><Field label="شناسه پذیرنده"><Input dir="ltr" className="text-left" value={payments.zibalMerchantId} onChange={(e) => setPayments({ ...payments, zibalMerchantId: e.target.value })} /></Field></div></div>
        <Button loading={saving === "platformPayments"} onClick={() => save("platformPayments", payments)}>ذخیره تنظیمات درگاه</Button>
      </Card>

      <Card className="space-y-4 p-5"><div><h3 className="font-bold">پنل پیامک مرکزی</h3><p className="mt-1 text-xs leading-6 text-stone-500">این اتصال برای ورود و ثبت‌نام، یادآوری تمدید و پیامک‌های مناسبتی سامانه است و از پنل پیامک مستقل هر رستوران جدا می‌ماند.</p></div>
        <p className="text-sm font-semibold">پنل پیامک فعال را انتخاب کنید</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([ ["kavenegar", "کاوه‌نگار", "ارسال الگو با Verify / Lookup"], ["smsir", "ایده‌پردازان · sms.ir", "ارسال الگوی تأییدشده با API پیامک"] ] as const).map(([provider, title, description]) => {
            const active = sms.enabled && sms.provider === provider;
            return <div key={provider} className={cn("rounded-2xl border p-4 transition", active ? "border-emerald-300 bg-emerald-50/60" : "border-base-300 bg-base-100 hover:border-primary/40")}>
              <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Icon name="message" className={cn("size-5", active ? "text-emerald-700" : "text-base-content/50")} /><b>{title}</b></div><Button type="button" size="sm" variant={active ? "secondary" : "primary"} aria-pressed={active} onClick={() => setSms((s: any) => s.provider === provider ? { ...s, enabled: !s.enabled } : { ...s, provider, enabled: true })}>{active ? "فعال" : "غیرفعال"}</Button></div>
              <p className="mt-2 text-xs leading-6 text-base-content/60">{description}</p>
              <p className={cn("mt-1 text-[11px]", active ? "text-emerald-700" : "text-base-content/45")}>{active ? "تنظیمات این پنل باز است" : "برای فعال‌سازی و باز کردن تنظیمات کلیک کنید"}</p>
            </div>;
          })}
        </div>
        {sms.enabled ? <div className="space-y-4 rounded-2xl border border-primary/20 bg-base-200/35 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-bold">تنظیمات {sms.provider === "smsir" ? "sms.ir" : "کاوه‌نگار"}</h4><p className="mt-1 text-xs text-base-content/55">با غیرفعال‌کردن پنل، ورود پیامکی و ارسال‌های خودکار متوقف می‌شوند.</p></div><Badge color="emerald"><Icon name="circleCheck" className="me-1 size-3.5" /> فعال</Badge></div>
          {(() => {
            const key = sms.provider === "smsir" ? "smsirApiKey" : "kavenegarApiKey";
            const hasKey = sms.provider === "smsir" ? sms.hasSmsirKey : sms.hasKavenegarKey;
            const hasKeyField = sms.provider === "smsir" ? "hasSmsirKey" : "hasKavenegarKey";
            const clearKey = sms.provider === "smsir" ? "clearSmsirKey" : "clearKavenegarKey";
            return <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><Field label={`کلید API${hasKey ? " · ذخیره شده؛ برای حفظ آن خالی بگذارید" : ""}`}><Input type="password" dir="ltr" autoComplete="new-password" className="text-left" value={sms[key]} onChange={(e) => setSms({ ...sms, [key]: e.target.value, [clearKey]: false })} placeholder={hasKey ? "برای جایگزینی وارد کنید" : "کلید API"} /></Field><Button type="button" variant="ghost" disabled={!hasKey} onClick={() => setSms({ ...sms, [key]: "", [hasKeyField]: false, [clearKey]: true })}>پاک‌کردن کلید</Button></div>;
          })()}
          <Field label="چند روز مانده به پایان اشتراک پیامک یادآوری شود"><Input type="number" min="1" max="60" value={sms.renewalDays} onChange={(e) => setSms({ ...sms, renewalDays: Number(e.target.value) })} /></Field>
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">{patternFields("otp", "کد ورود")} {patternFields("renewal", "یادآوری تمدید")} {patternFields("occasion", "طرح مناسبتی")} {patternFields("adminAlert", "اعلان مدیر")}</div>
          <Button loading={saving === "platformSms"} onClick={() => save("platformSms", sms)}>ذخیره تنظیمات پیامک</Button>
        </div> : <div className="rounded-2xl border border-dashed border-base-300 bg-base-200/30 p-5 text-center"><Icon name="lock" className="mx-auto size-5 text-base-content/45" /><p className="mt-2 text-sm font-semibold">تنظیمات پنل بسته است</p><p className="mt-1 text-xs leading-6 text-base-content/55">برای بازشدن تنظیمات، یکی از پنل‌های غیرفعال را فعال کنید.</p><Button className="mt-3" loading={saving === "platformSms"} onClick={() => save("platformSms", sms)}>ذخیره وضعیت غیرفعال</Button></div>}
      </Card>

      <Modal open={!!guide} onClose={() => setGuide(null)} title={guide ? `راهنمای الگوی ${PLATFORM_SMS_GUIDES[guide].title}` : "راهنمای الگو"} size="md" footer={<Button onClick={() => setGuide(null)}>بستن</Button>}>
        {guide && <div className="space-y-4 text-sm leading-7">
          <p className="text-base-content/65">این متن نمونه را در پنل پیامکی بسازید و پس از تأیید، شناسه الگو را در همین صفحه وارد کنید. متن نهایی را می‌توانید متناسب با برند خود تغییر دهید.</p>
          <div><h4 className="mb-2 font-bold">متن نمونه الگو</h4><div dir="rtl" className="rounded-2xl bg-base-200 p-4 font-semibold">{PLATFORM_SMS_GUIDES[guide].sample}</div></div>
          <div><h4 className="mb-2 font-bold">متغیرها</h4><ul className="space-y-1 text-base-content/70">{PLATFORM_SMS_GUIDES[guide].variables.map((item) => <li key={item} className="flex gap-2"><Icon name="check" className="mt-1 size-4 shrink-0 text-emerald-600" />{item}</li>)}</ul></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-950">{PLATFORM_SMS_GUIDES[guide].note} در sms.ir نام متغیرها باید با فهرست پارامترها یکی باشد؛ در کاوه‌نگار ترتیب فهرست به‌ترتیب token، token2 و token3 ارسال می‌شود.</div>
        </div>}
      </Modal>

      <Card className="space-y-4 p-5"><div><h3 className="font-bold">ارسال طرح مناسبتی</h3><p className="mt-1 text-xs leading-6 text-stone-500">پیام با الگوی مناسبتی به مدیران کسب‌وکارهای فعال ارسال می‌شود. عنوان، مقدار متغیر occasion است؛ زمان‌بندی با تاریخ شمسی انجام می‌شود.</p></div>
        {!sms.enabled && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">برای زمان‌بندی یا ارسال طرح، ابتدا یک پنل پیامک را فعال و تنظیمات آن را ذخیره کنید.</p>}
        <div className="grid items-end gap-3 md:grid-cols-[1fr_220px_auto]"><Field label="عنوان مناسبتی"><Input value={campaignTitle} onChange={(e) => setCampaignTitle(e.target.value)} placeholder="مثلاً پیشنهاد ویژه نوروز" /></Field><Field label="تاریخ ارسال شمسی (خالی = اکنون)"><JalaliInput value={campaignDate} onChange={setCampaignDate} /></Field><Button loading={saving === "campaign"} disabled={!campaignTitle.trim() || !sms.enabled} onClick={createCampaign}>زمان‌بندی / ارسال</Button></div>
        {campaigns.error ? <ErrorState message={campaigns.error} onRetry={() => campaigns.reload()} /> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr className="border-b bg-base-200/50 text-xs text-base-content/60"><th className="p-3 text-start">طرح</th><th className="p-3 text-start">زمان اجرا</th><th className="p-3 text-start">وضعیت</th><th className="p-3 text-end">ارسال / ناموفق</th></tr></thead><tbody className="divide-y divide-base-200">{(campaigns.data?.items ?? []).map((c: any) => <tr key={c.id}><td className="p-3 font-semibold">{c.title}</td><td className="p-3 text-xs">{c.scheduledAt ? fmtJ(c.scheduledAt) : "—"}</td><td className="p-3">{c.status === "sent" ? <Badge color="emerald">ارسال شد</Badge> : c.status === "failed" ? <Badge color="rose">ناموفق</Badge> : <Badge color="amber">در انتظار / در حال ارسال</Badge>}</td><td className="p-3 text-end">{toFa(c.sentCount)} / {toFa(c.failedCount)}</td></tr>)}</tbody></table></div>}
        {campaigns.data?.logs?.length > 0 && <div className="space-y-2"><h4 className="text-sm font-bold">گزارش ارسال‌های اخیر</h4><div className="max-h-72 overflow-auto rounded-xl border border-base-300"><table className="w-full min-w-[600px] text-xs"><thead className="sticky top-0 bg-base-200 text-base-content/60"><tr><th className="p-2 text-start">زمان</th><th className="p-2 text-start">نوع پیام</th><th className="p-2 text-start">شماره</th><th className="p-2 text-start">درگاه</th><th className="p-2 text-start">نتیجه</th></tr></thead><tbody className="divide-y divide-base-200">{campaigns.data.logs.map((l: any) => <tr key={l.id}><td className="whitespace-nowrap p-2">{fmtJ(l.createdAt)} {formatTime(l.createdAt)}</td><td className="p-2">{PLATFORM_SMS_KIND[String(l.kind)] ?? l.kind}</td><td dir="ltr" className="p-2 text-left">{l.phone}</td><td className="p-2">{l.provider === "smsir" ? "sms.ir" : "کاوه‌نگار"}</td><td className="p-2">{l.status === "sent" ? <Badge color="emerald">ارسال شد</Badge> : l.status === "sending" ? <Badge color="amber">در حال ارسال</Badge> : l.status === "skipped" ? <Badge>تکراری</Badge> : <span title={l.detail}><Badge color="rose">ناموفق</Badge></span>}</td></tr>)}</tbody></table></div></div>}
      </Card>
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
