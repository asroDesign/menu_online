"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, useCollection } from "@/lib/api";
import { JMONTHS, fmtJ } from "@/lib/jalali";
import { SEGMENTS, mergeSeg, segMeta, type SegCfg } from "@/lib/segments";
import { SmsSendModal } from "@/components/sms-send";
import { useFeatures } from "@/components/features";
import { formatDate, formatNumber, formatPrice, timeAgo, toFa } from "@/lib/format";
import { ResourcePage } from "@/components/resource-page";
import { SettingCard } from "@/components/setting-card";
import { CashbackSettingsCard } from "@/components/cashback-settings";
import { MembershipTierManager } from "@/components/membership-tier-manager";
import { CustomerAnalytics } from "@/components/customer-analytics";
import { normalizeCustomerRewards, type CustomerRewardSettings } from "@/lib/customer-rewards-core";
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, IconButton, Input, AmountInput, Modal, PageHeader, Select, Skeleton, Switch, Textarea, cn, useToast, iconGlyph, EmojiIcon, IconText} from "@/components/ui";

type Customer = { id: number; name: string; phone: string; note: string; points: number; walletBalance: number; totalSpent: number; ordersCount: number; birthMonth: number | null; birthDay: number | null; smsOptIn: boolean; lastOrderAt: string | null; segment: string; referredByCustomerId: number | null; isReferred: boolean; referralsCount: number };

function CustomerRewardsSettingsCard() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<CustomerRewardSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || settings) return;
    api<{ item: { settings: { customerRewards?: unknown } } }>("/api/business")
      .then((result) => setSettings(normalizeCustomerRewards(result.item.settings.customerRewards)))
      .catch((error) => toast((error as Error).message, "error"));
  }, [open, settings, toast]);

  function change<K extends keyof CustomerRewardSettings>(key: K, value: CustomerRewardSettings[K]) {
    setSettings((current) => current ? { ...current, [key]: value } : current);
  }

  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      const next = normalizeCustomerRewards(settings);
      await api("/api/business", { method: "PATCH", body: { settings: { customerRewards: next } } });
      setSettings(next);
      setOpen(false);
      toast("قواعد امتیاز و معرفی ذخیره شد");
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setBusy(false); }
  }

  return <>
    <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Icon name="settings" className="size-4"/> تنظیم امتیاز و معرفی</Button>
    <Modal open={open} onClose={() => { if (!busy) setOpen(false); }} title="تنظیم امتیازهای باشگاه" description="نرخ تبدیل، امتیاز نظر و پاداش خریدهای ارجاعی را تعیین کنید." size="lg" footer={<><Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>انصراف</Button><Button loading={busy || !settings} disabled={!settings} onClick={() => void save()}>ذخیره تنظیمات</Button></>}>
      {!settings ? <Skeleton className="h-56 rounded-xl"/> : <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ارزش هر امتیاز (تومان)" hint="مشتری می‌تواند امتیاز را در پروفایل به اعتبار کیف پول تبدیل کند. صفر یعنی تبدیل غیرفعال."><AmountInput value={settings.pointValueToman} onValueChange={(value) => change("pointValueToman", Number(value) || 0)} min={0}/></Field>
          <Field label="پیشنهاد امتیاز برای نظر تأییدشده" hint="مدیر پیش از تأیید می‌تواند مقدار این نظر را تغییر دهد."><Input type="number" inputMode="numeric" min={0} max={100000} value={settings.reviewPoints} onChange={(event) => change("reviewPoints", Number(event.target.value) || 0)}/></Field>
        </div>
        <div className="rounded-2xl border border-stone-200 p-4">
          <div className="mb-3"><h3 className="text-sm font-bold">پاداش معرفی دوست</h3><p className="mt-1 text-xs leading-5 text-stone-500">امتیاز فقط پس از تسویهٔ موفق سفارش مشتری معرفی‌شده ثبت می‌شود.</p></div>
          <Field label="روش محاسبه"><Select value={settings.referralMode} onChange={(event) => change("referralMode", event.target.value as CustomerRewardSettings["referralMode"])}><option value="fixed">امتیاز ثابت برای هر خرید</option><option value="purchase_based">متناسب با مبلغ خرید</option></Select></Field>
          {settings.referralMode === "fixed" ? <Field className="mt-3" label="امتیاز ثابت هر خرید"><Input type="number" min={0} max={100000} inputMode="numeric" value={settings.referralFixedPoints} onChange={(event) => change("referralFixedPoints", Number(event.target.value) || 0)}/></Field> : <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="به ازای هر مبلغ (تومان)"><AmountInput value={settings.referralStepToman} onValueChange={(value) => change("referralStepToman", Number(value) || 0)} min={1000}/></Field><Field label="چند امتیاز تعلق بگیرد"><Input type="number" min={0} max={100000} inputMode="numeric" value={settings.referralPointsPerStep} onChange={(event) => change("referralPointsPerStep", Number(event.target.value) || 0)}/></Field></div>}
        </div>
      </div>}
    </Modal>
  </>;
}

type RewardCampaign = {
  id: number; name: string; token: string; rewardType: "discount_percent" | "free_item";
  discountPercent: number; productId: number | null; productName: string; expiresAfterDays: number;
  maxClaims: number; isActive: boolean; claimCount: number;
};

type RewardProduct = { id: number; name: string; price: number; sellingMode: string; isAvailable: boolean };

function BarcodeRewardSettings() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [campaigns, setCampaigns] = useState<RewardCampaign[]>([]);
  const [products, setProducts] = useState<RewardProduct[]>([]);
  const [businessSlug, setBusinessSlug] = useState("");
  const [name, setName] = useState("");
  const [rewardType, setRewardType] = useState<RewardCampaign["rewardType"]>("discount_percent");
  const [discountPercent, setDiscountPercent] = useState("10");
  const [productId, setProductId] = useState("");
  const [expiresAfterDays, setExpiresAfterDays] = useState("7");
  const [maxClaims, setMaxClaims] = useState("0");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [campaignResult, productResult] = await Promise.all([
        api<{ items: RewardCampaign[]; businessSlug: string }>("/api/loyalty-reward-campaigns"),
        api<{ items: RewardProduct[] }>("/api/products"),
      ]);
      setCampaigns(campaignResult.items);
      setBusinessSlug(campaignResult.businessSlug);
      setProducts(productResult.items.filter((product) => product.isAvailable && product.price > 0 && product.sellingMode === "count"));
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }

  function rewardUrl(campaign: RewardCampaign) {
    return `${window.location.origin}/m/${encodeURIComponent(businessSlug)}?reward=${encodeURIComponent(campaign.token)}`;
  }

  function printCampaign(campaign: RewardCampaign) {
    const svg = document.getElementById(`loyalty-reward-qr-${campaign.id}`)?.innerHTML;
    if (!svg) { toast("تصویر بارکد آماده نیست؛ پنجره را دوباره باز کنید", "error"); return; }
    const popup = window.open("", "_blank", "width=720,height=900");
    if (!popup) { toast("مرورگر پنجرهٔ چاپ را مسدود کرد؛ اجازهٔ بازشدن پنجره را بدهید", "error"); return; }
    popup.opener = null;
    const escape = (value: string) => value.replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);
    const title = escape(campaign.name);
    const description = campaign.rewardType === "discount_percent" ? `${toFa(campaign.discountPercent)}٪ تخفیف در سفارش بعدی` : `${escape(campaign.productName)} رایگان در سفارش بعدی`;
    const url = escape(rewardUrl(campaign));
    popup.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f8fc;color:#10233e;font-family:Arial,sans-serif}.card{width:90mm;min-height:125mm;padding:12mm 9mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:white;border:1px solid #dbe8f5;border-radius:24px;box-shadow:0 20px 60px #16365c18}.brand{font-size:12px;font-weight:700;letter-spacing:.12em;color:#3976b9}.qr{margin:24px 0 16px;padding:12px;border:1px solid #dbe8f5;border-radius:20px}.qr svg{display:block;width:58mm;height:58mm}.pill{padding:7px 14px;border-radius:999px;background:#eff6ff;color:#1d5b9d;font-size:13px;font-weight:700}.title{margin:14px 0 5px;font-size:22px}.desc{font-size:15px;line-height:1.8;color:#50647a}.hint{margin-top:18px;font-size:12px;line-height:1.8;color:#708196}.site{margin-top:12px;font-size:9px;color:#91a0b2;word-break:break-all}@page{size:A6;margin:0}@media print{body{background:white}.card{border:0;box-shadow:none;border-radius:0;width:100vw;height:100vh}}</style></head><body><main class="card"><div class="brand">باشگاه مشتریان</div><div class="qr">${svg}</div><span class="pill">جایزهٔ ویژهٔ شما</span><h1 class="title">${title}</h1><div class="desc">${description}</div><p class="hint">بارکد را اسکن کنید، با شماره موبایل وارد شوید و جایزه را برای سفارش بعدی فعال کنید.<br>جایزه پس از فعال‌سازی ${toFa(campaign.expiresAfterDays)} روز اعتبار دارد.</p><div class="site">${url}</div></main><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }

  async function createCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ item: RewardCampaign; businessSlug: string }>("/api/loyalty-reward-campaigns", {
        method: "POST",
        body: { name, rewardType, discountPercent: Number(discountPercent), productId: Number(productId), expiresAfterDays: Number(expiresAfterDays), maxClaims: Number(maxClaims) },
      });
      setBusinessSlug(result.businessSlug);
      setCampaigns((current) => [result.item, ...current]);
      setName("");
      toast("جایزه ساخته شد؛ QR اختصاصی آن را چاپ و به مشتری بدهید");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function toggleCampaign(campaign: RewardCampaign) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ item: RewardCampaign }>(`/api/loyalty-reward-campaigns/${campaign.id}`, { method: "PATCH", body: { isActive: !campaign.isActive } });
      setCampaigns((current) => current.map((item) => item.id === campaign.id ? { ...item, ...result.item } : item));
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <>
    <Button size="sm" variant="secondary" onClick={() => { setOpen(true); void load(); }}><Icon name="qr" className="size-4"/> جایزه‌های بارکدی</Button>
    <Modal open={open} onClose={() => { if (!busy) setOpen(false); }} title="جایزهٔ وفاداری با بارکد" description="یک QR چاپ کنید؛ مشتری پس از ورود با شمارهٔ تأییدشده جایزه را فعال می‌کند." size="xl">
      <div className="space-y-5">
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <form onSubmit={(event) => void createCampaign(event)} className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm"><Icon name="award" className="size-5"/></span><div><h3 className="text-sm font-extrabold">ساخت کارت جایزه</h3><p className="mt-1 text-xs leading-5 text-stone-500">فعال‌سازی هر کد برای هر مشتری یک‌بار است و جایزه فقط در سفارش بعدی مصرف می‌شود.</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="نام طرح"><Input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="مثلاً هدیهٔ مشتریان وفادار"/></Field>
            <Field label="نوع جایزه"><Select value={rewardType} onChange={(event) => setRewardType(event.target.value as RewardCampaign["rewardType"])}><option value="discount_percent">درصد تخفیف سفارش</option><option value="free_item">یک آیتم رایگان از منو</option></Select></Field>
            {rewardType === "discount_percent" ? <Field label="درصد تخفیف"><Input type="number" min={1} max={100} required inputMode="numeric" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)}/></Field> : <Field label="آیتم رایگان"><Select required value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">انتخاب محصول موجود…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {formatPrice(product.price)}</option>)}</Select>{!products.length && <span className="text-[11px] text-amber-700">محصول موجود و قیمت‌دار برای جایزه پیدا نشد.</span>}</Field>}
            <Field label="اعتبار پس از فعال‌سازی (روز)" hint="پس از این مدت، جایزه قابل مصرف نیست."><Input type="number" min={1} max={365} required inputMode="numeric" value={expiresAfterDays} onChange={(event) => setExpiresAfterDays(event.target.value)}/></Field>
            <Field label="سقف فعال‌سازی" hint="صفر یعنی بدون سقف؛ هر مشتری فقط یک بار این کد را فعال می‌کند."><Input type="number" min={0} max={1000000} required inputMode="numeric" value={maxClaims} onChange={(event) => setMaxClaims(event.target.value)}/></Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-[11px] leading-5 text-stone-500">کد QR به منوی همین کسب‌وکار می‌رسد. مشتری برای فعال‌سازی حتماً باید با OTP وارد حساب همان رستوران شود.</p><Button type="submit" loading={busy}><Icon name="plus" className="size-4"/> ساخت بارکد و جایزه</Button></div>
        </form>
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-extrabold">طرح‌های ساخته‌شده</h3><p className="mt-1 text-xs text-stone-500">برای چاپ دوباره، QR هر طرح را باز کنید.</p></div><Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}><Icon name="refresh" className="size-4"/> تازه‌سازی</Button></div>
          {loading ? <Skeleton className="h-28 rounded-2xl"/> : campaigns.length === 0 ? <EmptyState title="هنوز جایزه‌ای نساخته‌اید" description="فرم بالا را کامل کنید تا بارکد آمادهٔ چاپ شود."/> : <div className="grid gap-3 md:grid-cols-2">
            {campaigns.map((campaign) => {
              const url = businessSlug ? rewardUrl(campaign) : "";
              const qrId = `loyalty-reward-qr-${campaign.id}`;
              return <article key={campaign.id} className="rounded-2xl border border-stone-200 bg-white p-3.5">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="truncate text-sm font-bold">{campaign.name}</h4><p className="mt-1 text-xs text-stone-500">{campaign.rewardType === "discount_percent" ? `${toFa(campaign.discountPercent)}٪ تخفیف` : `${campaign.productName} رایگان`} · {toFa(campaign.expiresAfterDays)} روز اعتبار</p><p className="mt-1 text-[11px] text-stone-400">{toFa(campaign.claimCount)} فعال‌سازی{campaign.maxClaims ? ` از ${toFa(campaign.maxClaims)}` : " · بدون سقف"}</p></div><Badge color={campaign.isActive ? "emerald" : "stone"}>{campaign.isActive ? "فعال" : "متوقف"}</Badge></div>
                <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={!campaign.isActive} onClick={() => printCampaign(campaign)}><Icon name="print" className="size-4"/> چاپ QR</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void toggleCampaign(campaign)}>{campaign.isActive ? "توقف کد" : "فعال‌سازی کد"}</Button>{url && <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-50" onClick={() => navigator.clipboard.writeText(url).then(() => toast("پیوند جایزه کپی شد")).catch(() => toast("کپی پیوند انجام نشد", "error"))}><Icon name="copy" className="size-3.5"/> کپی پیوند</button>}</div>
                {url && <div id={qrId} className="sr-only"><QRCodeSVG value={url} size={240} level="H" marginSize={2}/></div>}
              </article>;
            })}
          </div>}
        </section>
      </div>
    </Modal>
  </>;
}

type ProductReviewRow = { id: number; productId: number; productName: string; customerId: number; customerName: string; customerPhone: string; rating: number; body: string; status: "pending" | "approved" | "rejected"; awardedPoints: number; createdAt: string };

function ProductReviewManager() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState<ProductReviewRow[]>([]);
  const [defaultAwardPoints, setDefaultAwardPoints] = useState(0);
  const [awardDraft, setAwardDraft] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let live = true;
    api<{ items: ProductReviewRow[]; defaultAwardPoints: number }>(`/api/product-reviews?status=${status}`)
      .then((result) => {
        if (!live) return;
        setItems(result.items);
        setDefaultAwardPoints(result.defaultAwardPoints);
        setAwardDraft((current) => Object.fromEntries(result.items.map((item) => [item.id, current[item.id] ?? String(result.defaultAwardPoints)])));
      })
      .catch((cause) => { if (live) setError((cause as Error).message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, status]);

  async function decide(item: ProductReviewRow, nextStatus: "approved" | "rejected") {
    const awardPoints = nextStatus === "approved" ? Number(awardDraft[item.id] ?? defaultAwardPoints) : 0;
    setBusyId(item.id);
    setError("");
    try {
      const result = await api<{ item: ProductReviewRow }>(`/api/product-reviews/${item.id}`, { method: "PATCH", body: { status: nextStatus, awardPoints } });
      setItems((current) => status === "pending" ? current.filter((row) => row.id !== item.id) : current.map((row) => row.id === item.id ? { ...row, ...result.item } : row));
      toast(nextStatus === "approved" ? (awardPoints ? `نظر تأیید شد و ${toFa(awardPoints)} امتیاز ثبت شد` : "نظر تأیید و منتشر شد") : "نظر رد شد");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusyId(0); }
  }

  function toggleReviews() {
    const next = !open;
    if (next) { setLoading(true); setError(""); }
    setOpen(next);
  }

  return <Card className="mb-4 overflow-hidden p-0">
    <button type="button" aria-expanded={open} onClick={toggleReviews} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-start">
      <span className="flex items-center gap-2"><Icon name="message" className="size-4 text-brand-700"/><span><b className="block text-sm">نظرات محصولات</b><small className="mt-0.5 block text-[11px] text-stone-500">تأیید انتشار و ثبت امتیاز هدیه</small></span></span>
      {status === "pending" && items.length > 0 && <Badge color="amber">{toFa(items.length)} در انتظار</Badge>}
    </button>
    {open && <div className="space-y-3 border-t border-stone-100 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs leading-5 text-stone-500">نظر فقط پس از تأیید مدیر در منوی مشتری دیده می‌شود. امتیاز هدیه به دفتر امتیاز مشتری ثبت و برای تبدیل به اعتبار قابل استفاده است.</p><Select className="w-36" value={status} onChange={(event) => { setLoading(true); setError(""); setStatus(event.target.value); }}><option value="pending">در انتظار بررسی</option><option value="approved">تأییدشده‌ها</option><option value="rejected">ردشده‌ها</option><option value="all">همه</option></Select></div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700">{error}</p>}
      {loading ? <Skeleton className="h-36 rounded-xl"/> : !items.length ? <EmptyState title={status === "pending" ? "نظر در انتظاری نیست" : "نظری برای نمایش نیست"} description="نظرهای ثبت‌شدهٔ مشتریان در این بخش می‌آیند."/> : <div className="space-y-3">
        {items.map((item) => <article key={item.id} className="rounded-2xl border border-stone-200 p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><b>{item.productName}</b><Badge color={item.status === "approved" ? "emerald" : item.status === "rejected" ? "rose" : "amber"}>{item.status === "approved" ? "تأییدشده" : item.status === "rejected" ? "ردشده" : "در انتظار"}</Badge></div><p className="mt-1 text-[11px] text-stone-500">{item.customerName} · <span dir="ltr">{item.customerPhone}</span> · {formatDate(item.createdAt)}</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{toFa(item.rating)} از ۵ ★</span></div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">{item.body}</p>
          {item.status === "pending" ? <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3"><Field className="w-40" label="امتیاز هدیه (اختیاری)" hint={`پیشنهاد: ${toFa(defaultAwardPoints)}`}><Input type="number" min={0} max={100000} inputMode="numeric" value={awardDraft[item.id] ?? String(defaultAwardPoints)} onChange={(event) => setAwardDraft((current) => ({ ...current, [item.id]: event.target.value }))}/></Field><Button size="sm" loading={busyId === item.id} disabled={busyId > 0} onClick={() => void decide(item, "approved")}>تأیید و انتشار</Button><Button size="sm" variant="ghost" disabled={busyId > 0} onClick={() => void decide(item, "rejected")}>رد نظر</Button></div> : item.awardedPoints > 0 ? <p className="mt-3 border-t border-stone-100 pt-2 text-xs text-emerald-700">{toFa(item.awardedPoints)} امتیاز برای این نظر ثبت شده است.</p> : null}
        </article>)}
      </div>}
    </div>}
  </Card>;
}

function SegmentSettings() {
  const toast = useToast();
  const [v, setV] = useState<Record<string, string> | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open && !v) api<{ item: { settings: { segments?: Partial<SegCfg> } } }>("/api/business").then((r) => { const c = mergeSeg(r.item.settings.segments); setV(Object.fromEntries(Object.entries(c).map(([k, x]) => [k, String(x)]))); }); }, [open, v]);
  const F: [keyof SegCfg, string, string][] = [["vipOrders", "VIP: حداقل تعداد خرید", "بار"], ["vipSpent", "VIP: حداقل مبلغ کل خرید", "تومان"], ["loyalOrders", "وفادار: حداقل تعداد خرید", "بار"], ["loyalSpent", "وفادار: یا حداقل مبلغ خرید", "تومان"], ["atRiskDays", "در خطر ریزش: روز از آخرین خرید", "روز"], ["lostDays", "ازدست‌رفته: روز از آخرین خرید", "روز"]];
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><IconText>{<EmojiIcon emoji="" />}</IconText> قوانین طبقه‌بندی</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="قوانین طبقه‌بندی خودکار مشتریان" size="md" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button><Button onClick={async () => { try { await api("/api/business", { method: "PATCH", body: { settings: { segments: Object.fromEntries(Object.entries(v ?? {}).map(([k, x]) => [k, Number(x.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, ""))])) } } }); toast("قوانین ذخیره شد؛ طبقه‌بندی به‌روز می‌شود"); setOpen(false); location.reload(); } catch (e) { toast((e as Error).message, "error"); } }}>ذخیره</Button></>}>
        {!v ? <div className="skeleton h-40" /> : <div className="grid gap-4 sm:grid-cols-2">{F.map(([k, l, u]) => <Field key={k} label={l} hint={u}>{k.endsWith("Spent") ? <AmountInput value={v[k]} onValueChange={(value) => setV({ ...v, [k]: value })} /> : <Input inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}</Field>)}</div>}
        <p className="mt-4 text-xs leading-6 text-stone-500">طبقه‌بندی به‌صورت خودکار و بر اساس سفارش‌های پرداخت‌شده محاسبه می‌شود؛ نیازی به ثبت دستی نیست.</p>
      </Modal>
    </>
  );
}

export function Customers() {
  const f = useFeatures();
  const [seg, setSeg] = useState("all");
  const [sms, setSms] = useState<{ audience: string; numbers?: string; count: number; title: string } | null>(null);
  const canSms = f.has("sms") && f.isManager;
  return (
    <>
      {f.isManager && <CustomerAnalytics />}
      {f.isManager && f.has("loyalty") && <ProductReviewManager />}
      <ResourcePage<Customer>
        title="باشگاه مشتریان"
        subtitle="مشتریان به‌صورت خودکار بر اساس تعداد و مبلغ خرید و زمان آخرین خرید طبقه‌بندی می‌شوند"
        endpoint="/api/r/customers"
        emoji=""
        emptyTitle="هنوز مشتری ثبت نشده"
        emptyDesc="مشتریان با ثبت شماره موبایل در سفارش‌ها به‌صورت خودکار به باشگاه اضافه می‌شوند؛ می‌توانید دستی هم اضافه کنید."
        addLabel="مشتری جدید"
        selectable={canSms}
        optimisticExtra={{ points: 0, walletBalance: 0, totalSpent: 0, ordersCount: 0, birthMonth: null, birthDay: null, lastOrderAt: null, segment: "none" }}
        rowFilter={(r) => seg === "all" || (seg === "referred" ? r.isReferred : r.segment === seg)}
        fields={[
          { key: "name", label: "نام", required: true },
          { key: "phone", label: "موبایل", required: true, ltr: true, placeholder: "09121234567" },
          { key: "birthMonth", label: "ماه تولد (شمسی)", type: "select", options: [{ value: "", label: "—" }, ...JMONTHS.map((m, i) => ({ value: String(i + 1), label: m }))] },
          { key: "birthDay", label: "روز تولد", type: "number", placeholder: "۱ تا ۳۱" },
          { key: "smsOptIn", label: "دریافت پیامک تبلیغاتی و مناسبتی", type: "bool" },
          { key: "note", label: "یادداشت", type: "textarea" },
        ]}
        search={(r, t) => r.name.includes(t) || r.phone.includes(t)}
        header={({ items }) => (
          <div className="mb-4 space-y-3">
            {f.isManager && <div className="flex flex-wrap justify-end gap-2"><MembershipTierManager /><CustomerRewardsSettingsCard /><BarcodeRewardSettings /><Button size="sm" variant="secondary" onClick={() => window.location.assign("/api/customers/export")}><Icon name="download" className="size-4"/> خروجی CSV همه مشتریان</Button></div>}
            <SettingCard title="نرخ کسب امتیاز" desc="به ازای هر چند تومان خرید، ۱ امتیاز به مشتری تعلق می‌گیرد." k="pointsPerToman" suffix="تومان = ۱ امتیاز" />
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              <IconText>{[{ key: "all", label: "همه", emoji: "" }, ...SEGMENTS].map((s) => {
                const n = s.key === "all" ? items.length : items.filter((c) => c.segment === s.key).length;
                return <button key={s.key} onClick={() => setSeg(s.key)} title={"desc" in s ? s.desc : undefined} className={cn("flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition", seg === s.key ? "bg-stone-900 text-white shadow" : "bg-white ring-1 ring-stone-200 hover:bg-stone-50")}><span>{<EmojiIcon emoji={s.emoji} /> }</span>{s.label}<span className={cn("rounded-md px-1.5 text-[11px]", seg === s.key ? "bg-white/20" : "bg-stone-100 text-stone-500")}>{toFa(n)}</span></button>;
              })}<button onClick={() => setSeg("referred")} className={cn("flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition", seg === "referred" ? "bg-stone-900 text-white shadow" : "bg-white ring-1 ring-stone-200 hover:bg-stone-50")}><Icon name="users" className="size-4" /> معرفی‌شده<span className={cn("rounded-md px-1.5 text-[11px]", seg === "referred" ? "bg-white/20" : "bg-stone-100 text-stone-500")}>{toFa(items.filter((c) => c.isReferred).length)}</span></button></IconText>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
              <span>{seg === "referred" ? "مشتریانی که با کد دعوت عضو همین رستوران شده‌اند" : seg !== "all" ? segMeta(seg).desc : "برای فیلتر، یک گروه را انتخاب کنید"}</span>
              {f.isManager && f.has("loyalty") && <SegmentSettings />}
            </div>
          </div>
        )}
        renderBar={({ filtered, selected, clear }) => canSms && (filtered.length > 0) ? (
          <div className="no-print mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-brand-50 p-3 ring-1 ring-brand-200">
            <span className="text-sm font-semibold text-brand-900"><IconText>{<EmojiIcon emoji="" />}</IconText> ارسال پیامک:</span>
            {seg !== "all" && seg !== "none" && <Button size="sm" onClick={() => setSms({ audience: `seg:${seg}`, count: filtered.filter((c) => c.smsOptIn).length, title: `گروه ${seg === "referred" ? "معرفی‌شده" : segMeta(seg).label}` })}>به کل گروه «{seg === "referred" ? "معرفی‌شده" : segMeta(seg).label}» ({toFa(filtered.filter((c) => c.smsOptIn).length)})</Button>}
            <Button size="sm" variant="secondary" disabled={selected.length === 0} onClick={() => setSms({ audience: "manual", numbers: selected.filter((c) => c.smsOptIn).map((c) => c.phone).join(","), count: selected.filter((c) => c.smsOptIn).length, title: "مشتریان انتخاب‌شده" })}>به انتخاب‌شده‌ها ({toFa(selected.length)})</Button>
            {selected.length > 0 && <button className="text-xs text-stone-500 underline" onClick={clear}>لغو انتخاب</button>}
          </div>
        ) : null}
        columns={[
          { label: "مشتری", render: (r) => <div><p className="font-bold">{r.name}</p><p className="text-xs text-stone-400" dir="ltr">{r.phone}</p></div> },
          { label: "دعوت و معرفی", render: (r) => <div className="space-y-1">{r.isReferred ? <Badge color="emerald">معرفی‌شده</Badge> : <span className="text-xs text-stone-400">مستقیم / بدون کد</span>}<p className="text-[11px] text-stone-500">{toFa(r.referralsCount)} نفر دعوت‌شده</p></div> },
          { label: "طبقه", render: (r) => <Badge color={segMeta(r.segment).color}><EmojiIcon emoji={segMeta(r.segment).emoji} /> {segMeta(r.segment).label}</Badge> },
          { label: "تعداد خرید", render: (r) => toFa(r.ordersCount) },
          { label: "مجموع خرید", render: (r) => formatPrice(r.totalSpent) },
          { label: "آخرین خرید", render: (r) => (r.lastOrderAt ? <span className="whitespace-nowrap text-xs">{fmtJ(r.lastOrderAt)} <span className="text-stone-400">({toFa(Math.floor((Date.now() - new Date(r.lastOrderAt).getTime()) / 86400_000))} روز پیش)</span></span> : "—") },
          { label: "امتیاز", render: (r) => <b>{formatNumber(r.points)}</b> },
          { label: "تولد", render: (r) => (r.birthMonth && r.birthDay ? `${toFa(r.birthDay)} ${JMONTHS[r.birthMonth - 1]}` : "—") },
        ]}
      />
      <SmsSendModal open={!!sms} onClose={() => setSms(null)} audience={sms?.audience ?? ""} numbers={sms?.numbers} count={sms?.count ?? 0} title={sms?.title ?? ""} />
    </>
  );
}

type WalletRow = { id: number; customerName: string; phone: string; kind: string; amount: number; note: string; createdAt: string };
const kindLabel: Record<string, [string, string]> = { earn: ["دریافت کش‌بک", "emerald"], spend: ["استفاده", "amber"], refund: ["بازگشت", "blue"], adjust: ["تعدیل دستی", "stone"] };

export function Cashback() {
  const toast = useToast();
  const ledger = useCollection<WalletRow>("/api/r/walletlog");
  return (
    <ResourcePage<Customer>
      title="تخفیف کش‌بک"
      subtitle="بخشی از مبلغ هر خرید به‌صورت اعتبار به کیف پول مشتری برمی‌گردد و در خرید بعدی قابل استفاده است"
      endpoint="/api/r/customers"
      emoji=""
      emptyTitle="مشتری‌ای برای کش‌بک وجود ندارد"
      emptyDesc="با ثبت سفارش همراه شماره موبایل، مشتریان ساخته می‌شوند."
      fields={[]}
      canDelete={false}
      search={(r, t) => r.name.includes(t) || r.phone.includes(t)}
      header={() => <div className="mb-5"><CashbackSettingsCard /></div>}
      columns={[
        { label: "مشتری", render: (r) => <div><p className="font-bold">{r.name}</p><p className="text-xs text-stone-400" dir="ltr">{r.phone}</p></div> },
        { label: "اعتبار فعلی", render: (r) => <b className={r.walletBalance ? "text-emerald-600" : "text-stone-400"}>{formatPrice(r.walletBalance)}</b> },
        { label: "مجموع خرید", render: (r) => formatPrice(r.totalSpent) },
      ]}
      rowActions={(r, ctx) => (
        <Button size="sm" variant="secondary" onClick={async () => {
          const v = window.prompt(`مبلغ اعتبار برای ${r.name} (تومان). برای کسر عدد منفی وارد کنید:`, "50000");
          if (!v) return;
          try {
            await api("/api/r/walletlog", { method: "POST", body: { customerId: r.id, amount: Number(v.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))), note: "تعدیل دستی توسط مدیر", idempotencyKey: crypto.randomUUID() } });
            ctx.reload();
            ledger.reload(true);
            toast("اعتبار ثبت شد");
          } catch (e) { toast((e as Error).message, "error"); }
        }}>± اعتبار</Button>
      )}
      footer={
        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-stone-100 p-4 font-bold">گردش اعتبار کش‌بک</div>
          {ledger.loading ? <Skeleton className="m-4 h-24" /> : ledger.items.length === 0 ? <p className="p-8 text-center text-sm text-stone-400">هنوز تراکنشی ثبت نشده است</p> : (
            <ul className="divide-y divide-stone-100">
              {ledger.items.slice(0, 30).map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Badge color={kindLabel[e.kind]?.[1]}>{kindLabel[e.kind]?.[0] ?? e.kind}</Badge>
                  <span className="min-w-0 flex-1 truncate">{e.customerName} <span className="text-xs text-stone-400">· {e.note}</span></span>
                  <b className={e.amount >= 0 ? "text-emerald-600" : "text-rose-600"} dir="ltr">{e.amount >= 0 ? "+" : "-"}{formatNumber(Math.abs(e.amount))}</b>
                  <span className="hidden text-xs text-stone-400 sm:block">{timeAgo(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      }
    />
  );
}

type Discount = { id: number; code: string; type: string; value: number; minOrder: number; maxUses: number; usedCount: number; expiresAt: string | null; isActive: boolean };

export function Discounts() {
  return (
    <ResourcePage<Discount>
      title="کدهای تخفیف"
      subtitle="کد تخفیف درصدی یا مبلغ ثابت برای کمپین‌ها؛ مشتری در منو، گارسون و صندوق می‌توانند آن را اعمال کنند"
      endpoint="/api/r/discounts"
      emoji=""
      emptyTitle="هنوز کد تخفیفی نساخته‌اید"
      emptyDesc="مثلاً WELCOME10 برای ۱۰٪ تخفیف اولین خرید."
      addLabel="کد جدید"
      optimisticExtra={{ usedCount: 0 }}
      fields={[
        { key: "code", label: "کد (انگلیسی)", required: true, ltr: true, placeholder: "WELCOME10" },
        { key: "type", label: "نوع تخفیف", type: "select", options: [{ value: "percent", label: "درصدی" }, { value: "fixed", label: "مبلغ ثابت (تومان)" }] },
        { key: "value", label: "مقدار", type: "number", required: true, hint: "درصد یا تومان، بسته به نوع" },
        { key: "minOrder", label: "حداقل مبلغ سفارش", type: "money", initial: "0" },
        { key: "maxUses", label: "حداکثر دفعات استفاده", type: "number", initial: "0", hint: "۰ = نامحدود" },
        { key: "expiresAt", label: "تاریخ انقضا", type: "date" },
        { key: "isActive", label: "فعال", type: "bool" },
      ]}
      columns={[
        { label: "کد", render: (r) => <code className="rounded-lg bg-stone-100 px-2 py-1 font-bold tracking-wider" dir="ltr">{r.code}</code> },
        { label: "تخفیف", render: (r) => <b>{r.type === "percent" ? `${toFa(r.value)}٪` : formatPrice(r.value)}</b> },
        { label: "حداقل سفارش", render: (r) => (r.minOrder ? formatPrice(r.minOrder) : "—") },
        { label: "استفاده", render: (r) => <span>{toFa(r.usedCount)}{r.maxUses ? ` از ${toFa(r.maxUses)}` : ""}</span> },
        { label: "انقضا", render: (r) => (r.expiresAt ? formatDate(r.expiresAt) : "بدون انقضا") },
        { label: "وضعیت", render: (r) => {
          const expired = r.expiresAt && new Date(r.expiresAt).getTime() < Date.now();
          const full = r.maxUses > 0 && r.usedCount >= r.maxUses;
          return expired ? <Badge color="rose">منقضی</Badge> : full ? <Badge color="amber">تکمیل ظرفیت</Badge> : r.isActive ? <Badge color="emerald">فعال</Badge> : <Badge>غیرفعال</Badge>;
        } },
      ]}
    />
  );
}

/* ---------------- Surveys ---------------- */
type Q = { id: string; text: string; type: "rating" | "choice" | "text"; options?: string[] };
type Survey = { id: number; title: string; description: string; questions: Q[]; isActive: boolean; responseCount: number; createdAt: string };
type Response_ = { id: number; customerName: string; answers: Record<string, string | number>; createdAt: string };
type QDraft = { id: string; text: string; type: Q["type"]; options: string };

export function Surveys() {
  const sv = useCollection<Survey>("/api/r/surveys");
  const toast = useToast();
  const [origin, setOrigin] = useState("");
  const [editing, setEditing] = useState<Survey | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [qs, setQs] = useState<QDraft[]>([]);
  const [results, setResults] = useState<{ survey: Survey; responses: Response_[] } | null>(null);
  const [share, setShare] = useState<Survey | null>(null);
  const [del, setDel] = useState<Survey | null>(null);

  const blankQ = (n: number): QDraft => ({ id: `q${n}`, text: "", type: "rating", options: "" });
  function openNew() { setTitle(""); setDesc(""); setQs([blankQ(1)]); setEditing("new"); }
  function openEdit(s: Survey) { setTitle(s.title); setDesc(s.description); setQs(s.questions.map((q) => ({ id: q.id, text: q.text, type: q.type, options: (q.options ?? []).join("، ") }))); setEditing(s); }

  async function save() {
    const questions = qs.filter((q) => q.text.trim()).map((q) => ({ id: q.id, text: q.text.trim(), type: q.type, ...(q.type === "choice" ? { options: q.options.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean) } : {}) }));
    if (!title.trim()) return toast("عنوان را وارد کنید", "error");
    if (!questions.length) return toast("حداقل یک سؤال اضافه کنید", "error");
    if (questions.some((q) => q.type === "choice" && (q.options?.length ?? 0) < 2)) return toast("سؤال‌های چندگزینه‌ای حداقل ۲ گزینه نیاز دارند", "error");
    const target = editing;
    setEditing(null);
    const payload = { title: title.trim(), description: desc.trim(), questions };
    try {
      if (target === "new") { await sv.create({ ...payload, isActive: true }, { ...payload, isActive: true, responseCount: 0, createdAt: new Date().toISOString() } as never); toast("نظرسنجی ساخته شد"); }
      else if (target) { await sv.update(target.id, payload); toast("ذخیره شد"); }
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function openResults(s: Survey) {
    try { setResults(await api(`/api/r/surveys/${s.id}`)); } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="نظرسنجی مشتریان" subtitle="فرم بازخورد بسازید، لینک یا QR آن را به اشتراک بگذارید و نتایج را ببینید" actions={<Button onClick={openNew}><Icon name="plus" className="size-4" /> نظرسنجی جدید</Button>} />
      <IconText>{sv.loading ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
        : sv.error ? <ErrorState message={sv.error} onRetry={() => sv.reload()} />
        : sv.items.length === 0 ? <EmptyState emoji="" title="هنوز نظرسنجی‌ای ندارید" description="با چند سؤال ساده از مشتریان بازخورد بگیرید." action={<Button onClick={openNew}>ساخت نظرسنجی</Button>} />
        : <div className="grid gap-4 md:grid-cols-2">
          {sv.items.map((s) => (
            <Card key={s.id} className={cn("flex flex-col p-5 animate-pop", s.id < 0 && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h3 className="font-bold">{s.title}</h3><p className="mt-1 line-clamp-2 text-xs leading-6 text-stone-500">{s.description || "—"}</p></div>
                <Switch checked={s.isActive} label="فعال" onChange={(v) => sv.update(s.id, { isActive: v }).catch((e) => toast(e.message, "error"))} />
              </div>
              <div className="mt-4 flex gap-2 text-xs"><Badge color="brand">{toFa(s.questions.length)} سؤال</Badge><Badge color="emerald">{toFa(s.responseCount)} پاسخ</Badge>{!s.isActive && <Badge>غیرفعال</Badge>}</div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
                <Button size="sm" onClick={() => openResults(s)}>{<EmojiIcon emoji="" />} نتایج</Button>
                <Button size="sm" variant="secondary" onClick={() => { setOrigin(location.origin); setShare(s); }}><Icon name="qr" className="size-4" /> اشتراک‌گذاری</Button>
                <span className="ms-auto flex"><IconButton icon="edit" label="ویرایش" onClick={() => openEdit(s)} /><IconButton icon="trash" label="حذف" className="hover:bg-rose-50 hover:text-rose-600" onClick={() => setDel(s)} /></span>
              </div>
            </Card>
          ))}
        </div>}</IconText>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "نظرسنجی جدید" : "ویرایش نظرسنجی"} size="lg" footer={<><Button variant="ghost" onClick={() => setEditing(null)}>انصراف</Button><Button onClick={save}>ذخیره</Button></>}>
        <div className="space-y-4">
          <Field label="عنوان *"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="توضیح"><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <div className="space-y-3">
            {qs.map((q, i) => (
              <div key={q.id} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
                <div className="flex gap-2">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold">{toFa(i + 1)}</span>
                  <Input value={q.text} placeholder="متن سؤال" onChange={(e) => setQs(qs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                  <Select className="w-36" value={q.type} onChange={(e) => setQs(qs.map((x, j) => (j === i ? { ...x, type: e.target.value as Q["type"] } : x)))}>
                    <option value="rating">امتیاز ۱ تا ۵</option><option value="choice">چندگزینه‌ای</option><option value="text">پاسخ متنی</option>
                  </Select>
                  <IconButton icon="trash" label="حذف سؤال" disabled={qs.length === 1} onClick={() => setQs(qs.filter((_, j) => j !== i))} />
                </div>
                {q.type === "choice" && <Input className="mt-2" placeholder="گزینه‌ها را با ویرگول جدا کنید: اینستاگرام، دوستان، گوگل" value={q.options} onChange={(e) => setQs(qs.map((x, j) => (j === i ? { ...x, options: e.target.value } : x)))} />}
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setQs([...qs, blankQ(Math.max(0, ...qs.map((x) => Number(x.id.slice(1)) || 0)) + 1)])}><Icon name="plus" className="size-4" /> افزودن سؤال</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!share} onClose={() => setShare(null)} title="اشتراک‌گذاری نظرسنجی" size="sm" footer={share && <><Button variant="secondary" onClick={() => navigator.clipboard.writeText(`${origin}/survey/${share.id}`).then(() => toast("لینک کپی شد"))}><Icon name="copy" className="size-4" /> کپی لینک</Button><a href={`/survey/${share.id}`} target="_blank"><Button>باز کردن</Button></a></>}>
        {share && <div className="text-center"><div className="inline-block rounded-2xl border-2 border-dashed border-brand-300 p-4"><QRCodeSVG value={`${origin}/survey/${share.id}`} size={190} marginSize={0} /></div><p className="mt-3 break-all text-xs text-stone-500" dir="ltr">{origin}/survey/{share.id}</p></div>}
      </Modal>

      <Modal open={!!results} onClose={() => setResults(null)} title={results ? `نتایج: ${results.survey.title}` : ""} size="lg">
        <IconText>{results && (results.responses.length === 0 ? <p className="py-10 text-center text-sm text-stone-400">هنوز پاسخی ثبت نشده است.</p> : (
          <div className="space-y-6">
            <p className="text-sm text-stone-500">مجموع پاسخ‌ها: <b className="text-stone-800">{toFa(results.responses.length)}</b></p>
            {results.survey.questions.map((q) => {
              const vals = results.responses.map((r) => r.answers[q.id]).filter((v) => v !== undefined);
              return (
                <div key={q.id}>
                  <p className="mb-2 text-sm font-bold">{q.text} <span className="text-xs font-normal text-stone-400">({toFa(vals.length)} پاسخ)</span></p>
                  {q.type === "rating" && (() => {
                    const nums = vals.map(Number); const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
                    return <div><p className="mb-2 text-2xl font-extrabold text-brand-600">{toFa(avg.toFixed(1))} <span className="text-sm text-stone-400">از ۵</span></p>{[5, 4, 3, 2, 1].map((n) => { const c = nums.filter((x) => x === n).length; return <div key={n} className="mb-1 flex items-center gap-2 text-xs"><span className="w-6">{toFa(n)}{<EmojiIcon emoji="" />}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${nums.length ? (c / nums.length) * 100 : 0}%` }} /></div><span className="w-6 text-stone-500">{toFa(c)}</span></div>; })}</div>;
                  })()}
                  {q.type === "choice" && (q.options ?? []).map((o) => { const c = vals.filter((v) => v === o).length; return <div key={o} className="mb-1.5 flex items-center gap-2 text-xs"><span className="w-28 truncate">{o}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-brand-400" style={{ width: `${vals.length ? (c / vals.length) * 100 : 0}%` }} /></div><span className="w-6 text-stone-500">{toFa(c)}</span></div>; })}
                  {q.type === "text" && <ul className="space-y-1.5">{vals.slice(0, 12).map((v, i) => <li key={i} className="rounded-lg bg-stone-50 px-3 py-2 text-sm">{<EmojiIcon emoji="" />} {String(v)}</li>)}{vals.length === 0 && <li className="text-xs text-stone-400">پاسخی نیست</li>}</ul>}
                </div>
              );
            })}
          </div>
        ))}</IconText>
      </Modal>
      <ConfirmDialog open={!!del} title="حذف نظرسنجی" message="نظرسنجی و همه‌ی پاسخ‌های آن حذف می‌شود." onConfirm={() => del && sv.remove(del.id).catch((e) => toast(e.message, "error"))} onClose={() => setDel(null)} />
    </div>
  );
}
