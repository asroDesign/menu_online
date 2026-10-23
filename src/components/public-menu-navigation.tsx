"use client";

import { useEffect, useState } from "react";
import { formatPrice, toFa } from "@/lib/format";
import { readTrackedMenuOrders, trackedMenuOrdersUpdateEvent, type TrackedMenuOrder } from "@/lib/public-menu-orders";
import { Button, cn, Icon, Input, Modal } from "@/components/ui";
import { OtpCodeInput } from "@/components/otp-code-input";
import type { Settings } from "@/lib/plans";

type Template = NonNullable<Settings["menuTemplate"]>;
type CustomerProfile = {
  id: number;
  name: string;
  phone: string;
  points: number;
  referralCode: string;
  recentOrders: { number: number; status: string; paymentStatus: string; deliveryStatus: string; total: number; type: string; createdAt: string }[];
};

const statusNames: Record<string, string> = { awaiting_payment: "در انتظار پرداخت", pending: "ثبت‌شده", preparing: "در حال آماده‌سازی", ready: "آماده تحویل", served: "تحویل‌شده", paid: "تکمیل‌شده", canceled: "لغوشده" };
const paymentNames: Record<string, string> = { unpaid: "پرداخت‌نشده", pending: "در انتظار تأیید", paid: "پرداخت‌شده", failed: "پرداخت ناموفق", refunded: "بازپرداخت‌شده" };
const navLabels: Record<string, { menu: string; cart: string; orders: string; profile: string }> = {
  fa: { menu: "منو", cart: "سبد خرید", orders: "سفارش‌ها", profile: "پروفایل" },
  en: { menu: "Menu", cart: "Cart", orders: "Orders", profile: "Profile" },
  ar: { menu: "القائمة", cart: "السلة", orders: "الطلبات", profile: "حسابي" },
  tr: { menu: "Menü", cart: "Sepet", orders: "Siparişler", profile: "Profil" },
};
async function customerRequest<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "درخواست انجام نشد");
  return result as T;
}

export function PublicMenuNavigation({
  slug,
  accent,
  template,
  language,
  cartCount,
  subtotal,
  onMenu,
  onCart,
  canOrder,
  readOnly = false,
}: {
  slug: string;
  accent: string;
  template: Template;
  language: string;
  cartCount: number;
  subtotal: number;
  onMenu: () => void;
  onCart: () => void;
  canOrder: boolean;
  readOnly?: boolean;
}) {
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [recent, setRecent] = useState<TrackedMenuOrder[]>([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("ref")?.slice(0, 32) ?? "");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (readOnly) return;
    let live = true;
    customerRequest<{ profile: CustomerProfile }>(`/api/public/${encodeURIComponent(slug)}/customer/session`)
      .then(({ profile: next }) => { if (live) { setProfile(next); setName(next.name); setPhone(next.phone); } })
      .catch(() => {});
    const refreshRecent = (event?: Event) => {
      const detail = (event as CustomEvent<{ slug?: string }> | undefined)?.detail;
      if (!detail?.slug || detail.slug === slug) setRecent(readTrackedMenuOrders(slug));
    };
    refreshRecent();
    window.addEventListener(trackedMenuOrdersUpdateEvent(), refreshRecent);
    return () => { live = false; window.removeEventListener(trackedMenuOrdersUpdateEvent(), refreshRecent); };
  }, [slug, readOnly]);

  useEffect(() => {
    if (!challengeId) return;
    const update = () => {
      setSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
      setRetrySeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [challengeId, expiresAt, resendAt]);

  async function refreshProfile() {
    const result = await customerRequest<{ profile: CustomerProfile }>(`/api/public/${encodeURIComponent(slug)}/customer/session`);
    setProfile(result.profile);
    setName(result.profile.name);
    setPhone(result.profile.phone);
  }

  async function requestCode() {
    setBusy(true);
    setError("");
    try {
      const result = await customerRequest<{ challengeId: string; expiresIn: number; resendAfter: number }>(`/api/public/${encodeURIComponent(slug)}/customer/otp/request`, "POST", { phone });
      setChallengeId(result.challengeId);
      setCode("");
      setExpiresAt(Date.now() + result.expiresIn * 1000);
      setResendAt(Date.now() + result.resendAfter * 1000);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function verifyCode() {
    setBusy(true);
    setError("");
    try {
      const result = await customerRequest<{ profile: CustomerProfile }>(`/api/public/${encodeURIComponent(slug)}/customer/otp/verify`, "POST", { challengeId, code, name, referralCode });
      setProfile(result.profile);
      setPhone(result.profile.phone);
      setName(result.profile.name);
      setChallengeId("");
      setCode("");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function signOut() {
    await customerRequest(`/api/public/${encodeURIComponent(slug)}/customer/session`, "DELETE").catch(() => {});
    setProfile(null);
    setChallengeId("");
    setCode("");
    setInviteCopied(false);
  }

  async function openOrders() {
    setOrdersOpen(true);
    if (!readOnly) await refreshProfile().catch(() => setProfile(null));
  }

  const navShell = {
    classic: "rounded-2xl border border-stone-200 bg-white/95 shadow-[0_12px_36px_-16px_rgba(15,23,42,.36)] backdrop-blur-xl",
    editorial: "rounded-full border border-white/70 bg-white/75 shadow-[0_16px_40px_-18px_rgba(15,23,42,.4)] backdrop-blur-2xl",
    compact: "rounded-none border-x-0 border-b-0 border-t border-stone-200 bg-white shadow-[0_-8px_24px_-18px_rgba(15,23,42,.4)]",
    bistro: "rounded-2xl border border-stone-700 bg-[#26231f] text-white shadow-[0_16px_36px_-16px_rgba(0,0,0,.55)]",
    minimal: "rounded-xl border border-stone-200/80 bg-[#faf9f7]/95 shadow-sm backdrop-blur-xl",
    "softmenu-test3": "rounded-2xl border border-emerald-950/10 bg-[#fffefa]/95 text-stone-800 shadow-[0_12px_36px_-16px_rgba(15,23,42,.36)] backdrop-blur-xl",
    "softmenu-test": "rounded-2xl border border-violet-950/15 bg-[#332344]/95 text-white shadow-[0_16px_40px_-18px_rgba(30,20,45,.5)] backdrop-blur-xl",
    captainm: "rounded-2xl border border-indigo-200/20 bg-[#101a32]/95 text-white shadow-[0_16px_36px_-16px_rgba(8,12,32,.7)] backdrop-blur-xl",
    haftkhan: "rounded-2xl border border-rose-950/15 bg-[#fffafa]/95 text-[#641c27] shadow-[0_12px_36px_-16px_rgba(100,28,39,.25)] backdrop-blur-xl",
  } satisfies Record<Template, string>;
  const labels = navLabels[language] ?? navLabels.fa;
  const tabs = [
    { key: "menu", label: labels.menu, icon: "menu", action: onMenu, badge: "" },
    { key: "cart", label: labels.cart, icon: "cart", action: onCart, badge: cartCount > 0 ? toFa(cartCount) : "" },
    { key: "orders", label: labels.orders, icon: "orders", action: () => { void openOrders(); }, badge: "" },
    { key: "profile", label: labels.profile, icon: "waiter", action: () => setProfileOpen(true), badge: "" },
  ];

  return <>
    <nav aria-label="ناوبری منوی مشتری" className={cn("fixed inset-x-0 bottom-0 z-40 mx-auto max-w-2xl px-3 pb-[max(.5rem,env(safe-area-inset-bottom))]", template === "compact" && "max-w-none px-0 pb-0")}>
      <div className={cn("grid grid-cols-4 p-1.5", navShell[template], template === "editorial" && "mx-2 rounded-full p-1", template === "compact" && "p-1")}>
        {tabs.map((tab) => <button key={tab.key} type="button" onClick={tab.action} aria-label={tab.key === "cart" && cartCount ? `${tab.label}، ${toFa(cartCount)} قلم، ${formatPrice(subtotal)}` : tab.label} className={cn("relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition active:scale-95 sm:min-h-14 sm:text-[11px]", template === "editorial" && "rounded-full", (template === "bistro" || template === "softmenu-test" || template === "captainm") && "text-white/75", template === "haftkhan" && "text-[#641c27]", template === "minimal" && "rounded-lg", template === "compact" && "min-h-11")}>
          <span className={cn("relative flex size-7 items-center justify-center rounded-full transition sm:size-8", template === "classic" && "bg-stone-100", template === "editorial" && "size-8", template === "compact" && "size-6", (template === "bistro" || template === "captainm") && "size-8", template === "minimal" && "size-7", template === "haftkhan" && "bg-rose-50")} style={{ color: tab.key === "menu" ? accent : undefined, backgroundColor: tab.key === "menu" && template !== "bistro" && template !== "softmenu-test" && template !== "captainm" ? `${accent}18` : undefined }}>
            <Icon name={tab.icon} className="size-[17px] sm:size-[18px]" />
            {tab.badge && <span className="absolute -end-2 -top-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-extrabold text-white" style={{ backgroundColor: accent }}>{tab.badge}</span>}
          </span>
          <span className={cn(template === "bistro" && "text-white/80")}>{tab.label}</span>
        </button>)}
      </div>
      {cartCount > 0 && <span className="sr-only">جمع سبد خرید: {formatPrice(subtotal)}</span>}
      {!canOrder && <span className="sr-only">ثبت سفارش در این پیش‌نمایش غیرفعال است</span>}
    </nav>

    <Modal open={ordersOpen} onClose={() => setOrdersOpen(false)} title="سفارش‌های من" description="پیگیری سفارش‌هایی که برای این رستوران ثبت کرده‌اید" size="md">
      <div className="space-y-3">
        {profile?.recentOrders.length ? profile.recentOrders.map((order) => <article key={`${order.number}-${order.createdAt}`} className="rounded-2xl border border-stone-200 bg-white p-3.5">
          <div className="flex items-center justify-between gap-2"><b className="text-sm">سفارش #{toFa(order.number)}</b><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-800">{statusNames[order.status] ?? "در حال بررسی"}</span></div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500"><span>{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.createdAt))}</span><span>{paymentNames[order.paymentStatus] ?? "وضعیت پرداخت نامشخص"}</span></div>
          <div className="mt-2 border-t border-stone-100 pt-2 text-sm font-extrabold">{formatPrice(order.total)}</div>
        </article>) : recent.length ? recent.map((order) => <article key={order.trackingUrl} className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3.5">
          <div><b className="text-sm">سفارش #{toFa(order.number)}</b><p className="mt-1 text-[11px] text-stone-500">ذخیره‌شده در همین مرورگر</p></div>
          <a href={order.trackingUrl} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-white" style={{ backgroundColor: accent }}><Icon name="search" className="size-3.5" /> پیگیری</a>
        </article>) : <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white text-stone-500 shadow-sm"><Icon name="orders" /></span><p className="mt-3 text-sm font-bold">هنوز سفارشی برای نمایش ندارید</p><p className="mt-1 text-xs leading-5 text-stone-500">بعد از ثبت سفارش، پیوند پیگیری در این بخش می‌ماند. برای دیدن همه سفارش‌های گذشته با کد پیامکی وارد شوید.</p></div>}
        {!profile && <Button type="button" className="w-full" onClick={() => { setOrdersOpen(false); setProfileOpen(true); }}><Icon name="users" className="size-4" /> ورود برای مشاهده سفارش‌های قبلی</Button>}
      </div>
    </Modal>

    <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="پروفایل مشتری" description="ورود امن با شماره موبایل، مخصوص همین رستوران" size="sm">
      {readOnly ? <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">پروفایل در پیش‌نمایش منو فعال نیست.</div> : profile ? <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl bg-stone-50 p-4"><span className="flex size-12 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: accent }}><Icon name="users" /></span><div className="min-w-0"><p className="truncate font-extrabold">{profile.name}</p><p className="mt-1 text-sm text-stone-500" dir="ltr">{profile.phone}</p></div></div>
        <div className="grid grid-cols-2 gap-2"><div className="rounded-xl border border-stone-200 p-3"><p className="text-[11px] text-stone-500">سفارش‌های قبلی</p><p className="mt-1 font-extrabold">{toFa(profile.recentOrders.length)}{profile.recentOrders.length === 20 ? "+" : ""}</p></div><div className="rounded-xl border border-stone-200 p-3"><p className="text-[11px] text-stone-500">امتیاز باشگاه</p><p className="mt-1 font-extrabold">{toFa(profile.points)}</p></div></div>
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-blue-900">دعوت از دوستان</p><p className="mt-1 text-[11px] leading-5 text-blue-800/70">با لینک خودتان، معرفی مشتری در باشگاه ثبت می‌شود.</p></div><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm"><Icon name="users" className="size-5" /></span></div>
          <div className="mt-3 flex items-center gap-2"><code dir="ltr" className="min-w-0 flex-1 truncate rounded-xl bg-white px-3 py-2.5 text-center text-sm font-extrabold tracking-widest text-blue-950 ring-1 ring-blue-100">{profile.referralCode}</code><Button type="button" size="sm" variant="secondary" onClick={async () => { const inviteUrl = `${window.location.origin}/m/${encodeURIComponent(slug)}?ref=${encodeURIComponent(profile.referralCode)}`; try { await navigator.clipboard.writeText(inviteUrl); setInviteCopied(true); window.setTimeout(() => setInviteCopied(false), 2200); } catch { setInviteCopied(false); } }}>{inviteCopied ? "کپی شد" : "کپی لینک"}</Button></div>
        </div>
        <Button type="button" variant="secondary" className="w-full" onClick={() => { void signOut(); }}>خروج از پروفایل</Button>
      </div> : <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void (challengeId ? verifyCode() : requestCode()); }}>
        {!challengeId ? <>
          <div className="rounded-2xl bg-blue-50 p-3.5 text-xs leading-6 text-blue-900">با تأیید شماره موبایل، سفارش‌های ثبت‌شده و امتیازهای همین رستوران را می‌بینید. اگر نخستین بار است، حساب مشتری پس از تأیید ساخته می‌شود.</div>
          <label className="block space-y-1.5 text-xs font-semibold text-stone-600">شماره موبایل<Input autoComplete="tel" inputMode="tel" dir="ltr" className="text-left" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="09۱۲۳۴۵۶۷۸۹" required /></label>
          <label className="block space-y-1.5 text-xs font-semibold text-stone-600">نام نمایشی (اختیاری)<Input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="نام شما" maxLength={80} /></label>
          <label className="block space-y-1.5 text-xs font-semibold text-stone-600">کد معرفی (اختیاری)<Input dir="ltr" className="text-left uppercase" autoComplete="off" value={referralCode} onChange={(event) => setReferralCode(event.target.value.slice(0, 32))} placeholder="کد دوست شما" maxLength={32} /><span className="block text-[10px] font-normal leading-5 text-stone-400">برای حساب تازه؛ ثبت کد بعد از تأیید شماره انجام می‌شود.</span></label>
          <Button type="submit" className="w-full" loading={busy} disabled={!phone.trim()}>ارسال کد ورود</Button>
        </> : <>
          <div className="text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Icon name="mobile" /></span><p className="mt-3 text-sm font-bold">کد ورود برای {phone} ارسال شد</p><p className="mt-1 text-xs text-stone-500">کد تا {toFa(Math.floor(seconds / 60))}:{toFa(String(seconds % 60).padStart(2, "0"))} اعتبار دارد.</p></div>
          <OtpCodeInput value={code} onChange={setCode} ariaLabel="کد ورود شش‌رقمی" required disabled={busy} />
          <label className="block space-y-1.5 text-xs font-semibold text-stone-600">نام نمایشی (برای حساب تازه)<Input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="نام شما" maxLength={80} /></label>
          <label className="block space-y-1.5 text-xs font-semibold text-stone-600">کد معرفی (اختیاری)<Input dir="ltr" className="text-left uppercase" autoComplete="off" value={referralCode} onChange={(event) => setReferralCode(event.target.value.slice(0, 32))} placeholder="کد دوست شما" maxLength={32} /></label>
          <Button type="submit" className="w-full" loading={busy} disabled={code.length !== 6 || seconds === 0}>تأیید و ورود</Button>
          <div className="flex items-center justify-between gap-2 text-xs"><button type="button" onClick={() => { setChallengeId(""); setCode(""); setError(""); }} className="font-semibold text-stone-500">تغییر شماره</button><button type="button" disabled={retrySeconds > 0 || busy} onClick={() => { void requestCode(); }} className="font-bold text-blue-700 disabled:text-stone-400">{retrySeconds ? `ارسال دوباره تا ${toFa(retrySeconds)} ثانیه` : "ارسال دوباره کد"}</button></div>
        </>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{error}</p>}
      </form>}
    </Modal>
  </>;
}
