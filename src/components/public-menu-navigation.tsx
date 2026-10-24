"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { BellRing, X } from "lucide-react";
import { formatPrice, toFa } from "@/lib/format";
import { readTrackedMenuOrders, trackedMenuOrdersUpdateEvent, type TrackedMenuOrder } from "@/lib/public-menu-orders";
import { publicMenuNotificationChanges, type PublicMenuNotificationSnapshot } from "@/lib/public-menu-notifications";
import { Button, cn, Icon, Input, Modal, Select, Textarea } from "@/components/ui";
import { LoyaltyWheelGraphic } from "@/components/loyalty-wheel-graphic";
import { wheelLandingRotation } from "@/lib/wheel-geometry";
import { OtpCodeInput } from "@/components/otp-code-input";
import type { Settings } from "@/lib/plans";
import type { CustomerRewardSnapshot } from "@/lib/loyalty-rewards-core";

type Template = NonNullable<Settings["menuTemplate"]>;
type WheelSegment = { id: number; title: string; prizeType: "fixed_amount" | "discount_code" | "free_items" | "no_prize" | "message"; weight: number };
type WheelSnapshot = { amount?: number; discountCode?: string; discountType?: "percent" | "fixed"; discountValue?: number; minOrder?: number; products?: { id: number; name: string; price: number }[]; message?: string };
export type ActiveWheelReward = { id: number; title: string; prizeType: string; snapshot: WheelSnapshot; expiresAt: string };
type WheelSpin = { id: number; title: string; prizeType: string; snapshot: WheelSnapshot; status: string; expiresAt: string | null; createdAt: string };
export type PublicCustomerProfile = {
  id: number;
  name: string;
  phone: string;
  points: number;
  walletBalance: number;
  pointValueToman: number;
  pointsValueToman: number;
  referralCode: string;
  activeReward: CustomerRewardSnapshot | null;
  recentOrders: { number: number; status: string; paymentStatus: string; deliveryStatus: string; total: number; type: string; createdAt: string }[];
  recentReservations: { id: number; status: string; depositStatus: string; depositAmount: number; guestCount: number; startsAt: string; tableName: string | null }[];
};
type CustomerFeedbackItem = { id: number; type: "suggestion" | "complaint"; message: string; status: "open" | "in_progress" | "resolved"; createdAt: string };

const statusNames: Record<string, string> = { awaiting_payment: "در انتظار پرداخت", pending: "ثبت‌شده", preparing: "در حال آماده‌سازی", ready: "آماده تحویل", served: "تحویل‌شده", paid: "تکمیل‌شده", canceled: "لغوشده" };
const paymentNames: Record<string, string> = { unpaid: "پرداخت‌نشده", pending: "در انتظار تأیید", paid: "پرداخت‌شده", failed: "پرداخت ناموفق", refunded: "بازپرداخت‌شده" };
const reservationNames: Record<string, string> = { requested: "درخواست‌شده", confirmed: "تأییدشده", cancelled: "لغوشده", completed: "انجام‌شده", no_show: "عدم مراجعه" };
const depositNames: Record<string, string> = { not_required: "بدون پیش‌پرداخت", pending: "پیش‌پرداخت در انتظار", paid: "پیش‌پرداخت‌شده", waived: "پیش‌پرداخت بخشیده‌شده" };
const navLabels: Record<string, { menu: string; cart: string; orders: string; profile: string; wheel: string }> = {
  fa: { menu: "منو", cart: "سبد خرید", orders: "سفارش‌ها", profile: "پروفایل", wheel: "گردونه شانس" },
  en: { menu: "Menu", cart: "Cart", orders: "Orders", profile: "Profile", wheel: "Lucky wheel" },
  ar: { menu: "القائمة", cart: "السلة", orders: "الطلبات", profile: "حسابي", wheel: "عجلة الحظ" },
  tr: { menu: "Menü", cart: "Sepet", orders: "Siparişler", profile: "Profil", wheel: "Şans çarkı" },
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

function initialNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !window.isSecureContext || !("Notification" in window)) return "unsupported";
  return window.Notification.permission;
}

function notificationSnapshot(profile: PublicCustomerProfile): PublicMenuNotificationSnapshot {
  return { walletBalance: profile.walletBalance, recentOrders: profile.recentOrders, recentReservations: profile.recentReservations };
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
  profileRequest = 0,
  onProfileChange,
  onProfileRequestHandled,
  wheelEnabled = false,
  onWheelRewardChange,
  customerFeedbackEnabled = false,
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
  profileRequest?: number;
  onProfileChange?: (profile: PublicCustomerProfile | null) => void;
  onProfileRequestHandled?: () => void;
  wheelEnabled?: boolean;
  onWheelRewardChange?: (reward: ActiveWheelReward | null) => void;
  customerFeedbackEnabled?: boolean;
}) {
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<PublicCustomerProfile | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(initialNotificationPermission);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationDismissed, setNotificationDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(`public-menu-notifications-dismissed:${slug}`) === "1"; } catch { return false; }
  });
  const [notificationError, setNotificationError] = useState("");
  const notificationBaselineRef = useRef<PublicMenuNotificationSnapshot | null>(null);
  const notificationOwnerRef = useRef("");
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
  const [redeemPoints, setRedeemPoints] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemRequestKey, setRedeemRequestKey] = useState("");
  const [redeemError, setRedeemError] = useState("");
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelLoading, setWheelLoading] = useState(false);
  const [wheelBusy, setWheelBusy] = useState(false);
  const [wheelError, setWheelError] = useState("");
  const [wheelSegments, setWheelSegments] = useState<WheelSegment[]>([]);
  const [wheelReward, setWheelReward] = useState<ActiveWheelReward | null>(null);
  const [wheelResult, setWheelResult] = useState<WheelSpin | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelAnimationMs, setWheelAnimationMs] = useState(5_200);
  const [wheelNextSpinAt, setWheelNextSpinAt] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [feedbackItems, setFeedbackItems] = useState<CustomerFeedbackItem[]>([]);
  const [feedbackType, setFeedbackType] = useState<CustomerFeedbackItem["type"]>("suggestion");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackSuccess, setFeedbackSuccess] = useState("");

  useEffect(() => {
    if (!wheelOpen || !wheelNextSpinAt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [wheelOpen, wheelNextSpinAt]);

  const refreshWheel = useCallback(async () => {
    if (readOnly) return;
    try {
      const result = await customerRequest<{ enabled: boolean; segments: WheelSegment[]; activeReward: (WheelSpin & { status: "active" }) | null; nextSpinAt: string | null }>(`/api/public/${encodeURIComponent(slug)}/loyalty-wheel`);
      setWheelSegments(result.segments ?? []);
      setWheelNextSpinAt(result.nextSpinAt);
      const active = result.activeReward?.expiresAt ? { id: result.activeReward.id, title: result.activeReward.title, prizeType: result.activeReward.prizeType, snapshot: result.activeReward.snapshot, expiresAt: result.activeReward.expiresAt } : null;
      setWheelReward(active);
      onWheelRewardChange?.(active);
    } catch { /* the menu stays usable if the optional wheel is temporarily unavailable */ }
  }, [readOnly, slug, onWheelRewardChange]);

  async function openWheel() {
    setWheelOpen(true);
    setWheelResult(null);
    setWheelError("");
    if (!profile) return;
    setWheelLoading(true);
    try { await refreshWheel(); }
    catch (cause) { setWheelError((cause as Error).message); }
    finally { setWheelLoading(false); }
  }

  async function spinWheel() {
    if (!profile || wheelBusy || wheelReward || wheelNextSpinAt && new Date(wheelNextSpinAt).getTime() > Date.now()) return;
    setWheelBusy(true);
    setWheelError("");
    setWheelResult(null);
    let animating = false;
    try {
      const requestKey = crypto.randomUUID().replaceAll("-", "");
      const result = await customerRequest<{ spin: WheelSpin; segments: WheelSegment[]; targetIndex: number }>(`/api/public/${encodeURIComponent(slug)}/loyalty-wheel`, "POST", { requestKey });
      setWheelSegments(result.segments);
      const totalWeight = result.segments.reduce((sum, segment) => sum + segment.weight, 0);
      const preceding = result.segments.slice(0, result.targetIndex).reduce((sum, segment) => sum + segment.weight, 0);
      const selected = result.segments[result.targetIndex];
      const sectorCenter = ((preceding + selected.weight / 2) / totalWeight) * 360;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const animationMs = reducedMotion ? 350 : 5_200;
      setWheelAnimationMs(animationMs);
      setWheelRotation((current) => wheelLandingRotation(current, sectorCenter, reducedMotion ? 0 : 7));
      animating = true;
      window.setTimeout(() => {
        setWheelResult(result.spin);
        setWheelNextSpinAt(null);
        void refreshWheel();
        if (result.spin.status === "active" && result.spin.expiresAt) {
          const reward = { id: result.spin.id, title: result.spin.title, prizeType: result.spin.prizeType, snapshot: result.spin.snapshot, expiresAt: result.spin.expiresAt };
          setWheelReward(reward);
          onWheelRewardChange?.(reward);
        } else {
          setWheelReward(null);
          onWheelRewardChange?.(null);
        }
        setWheelBusy(false);
      }, animationMs + 100);
    } catch (cause) {
      setWheelError((cause as Error).message);
      await refreshWheel();
    } finally { if (!animating) setWheelBusy(false); }
  }

  useEffect(() => {
    if (readOnly) return;
    let live = true;
    customerRequest<{ profile: PublicCustomerProfile }>(`/api/public/${encodeURIComponent(slug)}/customer/session`)
      .then(({ profile: next }) => { if (live) { setProfile(next); setName(next.name); setPhone(next.phone); onProfileChange?.(next); void refreshWheel(); } })
      .catch(() => { if (live) onProfileChange?.(null); });
    const refreshRecent = (event?: Event) => {
      const detail = (event as CustomEvent<{ slug?: string }> | undefined)?.detail;
      if (!detail?.slug || detail.slug === slug) setRecent(readTrackedMenuOrders(slug));
    };
    refreshRecent();
    window.addEventListener(trackedMenuOrdersUpdateEvent(), refreshRecent);
    return () => { live = false; window.removeEventListener(trackedMenuOrdersUpdateEvent(), refreshRecent); };
  }, [slug, readOnly, onProfileChange, onWheelRewardChange, refreshWheel]);

  useEffect(() => {
    const profileId = profile?.id;
    if (!profileOpen || !profileId || !customerFeedbackEnabled || readOnly) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setFeedbackLoading(true);
      customerRequest<{ items: CustomerFeedbackItem[] }>(`/api/public/${encodeURIComponent(slug)}/customer/feedback`)
        .then((result) => { if (active) { setFeedbackItems(result.items); setFeedbackError(""); } })
        .catch((cause) => { if (active) setFeedbackError((cause as Error).message); })
        .finally(() => { if (active) setFeedbackLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [profileOpen, profile?.id, customerFeedbackEnabled, readOnly, slug]);

  useEffect(() => {
    if (!profile) {
      notificationOwnerRef.current = "";
      notificationBaselineRef.current = null;
      return;
    }
    const owner = `${slug}:${profile.id}`;
    if (notificationOwnerRef.current !== owner) {
      notificationOwnerRef.current = owner;
      notificationBaselineRef.current = notificationSnapshot(profile);
    }
  }, [slug, profile]);

  useEffect(() => {
    if (!profile || notificationPermission !== "granted" || readOnly) return;
    let active = true;
    let polling = false;
    const checkChanges = async () => {
      if (!active || polling || document.visibilityState === "hidden") return;
      polling = true;
      try {
        const result = await customerRequest<{ profile: PublicCustomerProfile }>(`/api/public/${encodeURIComponent(slug)}/customer/session`);
        if (!active) return;
        const previous = notificationBaselineRef.current;
        const next = notificationSnapshot(result.profile);
        const changes = previous ? publicMenuNotificationChanges(previous, next) : [];
        notificationBaselineRef.current = next;
        setProfile(result.profile);
        onProfileChange?.(result.profile);
        for (const change of changes) {
          const title = change.kind === "wallet" ? "تغییر اعتبار کیف پول" : change.kind === "order" ? `سفارش #${toFa(change.number)}` : `رزرو میز #${toFa(change.id)}`;
          const body = change.kind === "wallet"
            ? `${change.current > change.previous ? "اعتبار کیف پول افزایش یافت" : "اعتبار کیف پول کاهش یافت"}؛ موجودی جدید ${formatPrice(change.current)} است.`
            : change.kind === "order"
              ? change.isNew
                ? `سفارش شما ثبت شد؛ وضعیت ${statusNames[change.status] ?? change.status}، ${paymentNames[change.paymentStatus] ?? change.paymentStatus}.`
                : `وضعیت ${statusNames[change.status] ?? change.status}؛ پرداخت ${paymentNames[change.paymentStatus] ?? change.paymentStatus}${change.deliveryStatus ? `؛ ارسال ${statusNames[change.deliveryStatus] ?? change.deliveryStatus}` : ""}.`
              : change.isNew
                ? `درخواست رزرو شما ثبت شد؛ وضعیت ${reservationNames[change.status] ?? change.status}.`
                : `وضعیت رزرو ${reservationNames[change.status] ?? change.status}؛ ${depositNames[change.depositStatus] ?? change.depositStatus}.`;
          try {
            const notice = new window.Notification(title, { body, tag: `menupeak:${slug}:${change.kind}:${change.kind === "wallet" ? "wallet" : change.kind === "order" ? change.number : change.id}`, dir: "rtl", lang: "fa" });
            notice.onclick = () => {
              window.focus();
              if (change.kind === "wallet") setProfileOpen(true);
              else setOrdersOpen(true);
              notice.close();
            };
          } catch { /* notification permission may change between polling and display */ }
        }
      } catch { /* profile and menu remain usable during a temporary polling failure */ }
      finally { polling = false; }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") void checkChanges(); };
    const timer = window.setInterval(() => void checkChanges(), 45_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [profile, notificationPermission, readOnly, slug, onProfileChange]);

  async function enableNotifications() {
    if (notificationPermission === "unsupported" || !window.isSecureContext || !("Notification" in window)) return;
    setNotificationBusy(true);
    setNotificationError("");
    try {
      const permission = await window.Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted" && profile) notificationBaselineRef.current = notificationSnapshot(profile);
      else if (permission === "denied") setNotificationError("اجازهٔ اعلان در مرورگر مسدود شد؛ آن را از تنظیمات سایت فعال کنید.");
    } catch {
      setNotificationError("فعال‌سازی اعلان در این مرورگر ممکن نشد.");
    } finally { setNotificationBusy(false); }
  }

  function dismissNotificationPrompt() {
    setNotificationDismissed(true);
    try { window.localStorage.setItem(`public-menu-notifications-dismissed:${slug}`, "1"); } catch { /* dismissal still applies for this page session */ }
  }

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
    const result = await customerRequest<{ profile: PublicCustomerProfile }>(`/api/public/${encodeURIComponent(slug)}/customer/session`);
    setProfile(result.profile);
    onProfileChange?.(result.profile);
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
      const result = await customerRequest<{ profile: PublicCustomerProfile }>(`/api/public/${encodeURIComponent(slug)}/customer/otp/verify`, "POST", { challengeId, code, name, referralCode });
      setProfile(result.profile);
      onProfileChange?.(result.profile);
      setPhone(result.profile.phone);
      setName(result.profile.name);
      setChallengeId("");
      setCode("");
      void refreshWheel();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function signOut() {
    await customerRequest(`/api/public/${encodeURIComponent(slug)}/customer/session`, "DELETE").catch(() => {});
    setProfile(null);
    onProfileChange?.(null);
    setWheelReward(null);
    onWheelRewardChange?.(null);
    setChallengeId("");
    setCode("");
    setInviteCopied(false);
  }

  async function submitRedeemPoints() {
    if (!profile) return;
    const points = Number(redeemPoints);
    if (!Number.isSafeInteger(points) || points < 1) { setRedeemError("تعداد امتیاز را وارد کنید"); return; }
    setRedeemBusy(true);
    setRedeemError("");
    const requestKey = redeemRequestKey || crypto.randomUUID().replaceAll("-", "");
    setRedeemRequestKey(requestKey);
    try {
      const result = await customerRequest<{ profile: PublicCustomerProfile }>(`/api/public/${encodeURIComponent(slug)}/customer/points/redeem`, "POST", { points, requestKey });
      setProfile(result.profile);
      onProfileChange?.(result.profile);
      setRedeemPoints("");
      setRedeemRequestKey("");
    } catch (cause) { setRedeemError((cause as Error).message); }
    finally { setRedeemBusy(false); }
  }

  async function submitCustomerFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || feedbackBusy) return;
    setFeedbackBusy(true);
    setFeedbackError("");
    setFeedbackSuccess("");
    try {
      const result = await customerRequest<{ item: CustomerFeedbackItem; message: string }>(`/api/public/${encodeURIComponent(slug)}/customer/feedback`, "POST", { type: feedbackType, message: feedbackMessage });
      setFeedbackItems((current) => [result.item, ...current].slice(0, 10));
      setFeedbackMessage("");
      setFeedbackSuccess(result.message);
    } catch (cause) { setFeedbackError((cause as Error).message); }
    finally { setFeedbackBusy(false); }
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
    orderino: "rounded-2xl border border-stone-200 bg-white/95 text-stone-700 shadow-[0_12px_36px_-16px_rgba(15,23,42,.28)] backdrop-blur-xl",
  } satisfies Record<Template, string>;
  const labels = navLabels[language] ?? navLabels.fa;
  const tabs = [
    { key: "menu", label: labels.menu, icon: "menu", action: onMenu, badge: "" },
    { key: "cart", label: labels.cart, icon: "cart", action: onCart, badge: cartCount > 0 ? toFa(cartCount) : "" },
    { key: "orders", label: labels.orders, icon: "orders", action: () => { void openOrders(); }, badge: "" },
    { key: "profile", label: labels.profile, icon: "waiter", action: () => setProfileOpen(true), badge: "" },
    ...(wheelEnabled && !readOnly ? [{ key: "wheel", label: labels.wheel, icon: "sparkles", action: () => { void openWheel(); }, badge: "" }] : []),
  ];

  return <>
    {profile && !readOnly && (notificationPermission === "default" || !!notificationError) && !notificationDismissed && <div dir="rtl" className="pointer-events-none fixed inset-x-3 top-[max(1rem,env(safe-area-inset-top))] z-[90] mx-auto grid max-w-lg">
      <section className="pointer-events-auto w-full rounded-2xl border border-[#BFE3D0] bg-white/95 p-3 text-right shadow-[0_18px_45px_rgba(3,97,65,0.16)] backdrop-blur" aria-label="فعال‌سازی اعلان سفارش و رزرو">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F0FAF5] text-[#036141]"><BellRing className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div><p className="text-sm font-bold text-[#14342A]">اعلان سفارش و رزرو</p><p className="mt-1 text-xs leading-6 text-[#6B8178]">وقتی وضعیت سفارش، رزرو یا کیف پول تغییر کند خبرتان می‌کنیم.</p></div>
              <button type="button" onClick={dismissNotificationPrompt} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F4F7F6] text-[#587269]" aria-label="بعداً"><X className="size-4" aria-hidden="true" /></button>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void enableNotifications()} disabled={notificationBusy || notificationPermission === "denied"} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#036141] px-4 text-xs font-bold text-white transition hover:bg-[#087653] disabled:cursor-wait disabled:opacity-70"><BellRing className="size-4" aria-hidden="true" />{notificationBusy ? "در حال فعال‌سازی…" : notificationPermission === "denied" ? "فعال‌سازی از تنظیمات مرورگر" : "فعال‌سازی اعلان"}</button>
              <button type="button" onClick={dismissNotificationPrompt} className="h-10 rounded-xl border border-[#DDE9E5] bg-white px-4 text-xs font-bold text-[#587269]">بعداً</button>
            </div>
            {notificationError && <p role="alert" className="mt-2 text-[11px] leading-5 text-rose-700">{notificationError}</p>}
          </div>
        </div>
      </section>
    </div>}
    <nav aria-label="ناوبری منوی مشتری" className={cn("fixed inset-x-0 bottom-0 z-40 mx-auto max-w-2xl px-3 pb-[max(.5rem,env(safe-area-inset-bottom))]", template === "compact" && "max-w-none px-0 pb-0")}>
      <div className={cn("grid p-1.5", tabs.length === 5 ? "grid-cols-5" : "grid-cols-4", navShell[template], template === "editorial" && "mx-2 rounded-full p-1", template === "compact" && "p-1")}>
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

    <Modal open={wheelOpen} onClose={() => setWheelOpen(false)} title="گردونهٔ شانس" description="یک چرخش؛ شاید سفارش بعدی‌تان با یک جایزهٔ ویژه همراه شود." size="md">
      {!profile ? <div className="space-y-4 text-center"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-violet-100 to-amber-100 text-violet-700"><Icon name="sparkles" className="size-8" /></div><p className="text-sm leading-7 text-stone-600">برای جلوگیری از چرخش‌های تکراری و نگهداری امن جایزه، ابتدا شماره موبایل خود را تأیید کنید.</p><Button className="w-full" onClick={() => setProfileOpen(true)}><Icon name="phone" className="size-4" /> ورود یا ثبت‌نام با شماره موبایل</Button></div>
        : wheelLoading ? <div className="grid min-h-72 place-items-center"><span className="loading loading-spinner loading-lg text-primary" /></div>
        : <div className="space-y-4">
          <LoyaltyWheelGraphic segments={wheelSegments} rotation={wheelRotation} duration={wheelAnimationMs} spinning={wheelBusy} won={wheelResult?.status === "active"} resultKey={wheelResult?.id} />
          {wheelResult ? <div role="status" className="motion-safe:animate-pop relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-fuchsia-50 p-4 text-center shadow-sm">

            <div className="pointer-events-none absolute inset-x-8 top-0 flex justify-between text-amber-400"><Icon name="sparkles" className="size-5"/><Icon name="sparkles" className="mt-3 size-4 text-fuchsia-400"/><Icon name="sparkles" className="size-5 text-violet-400"/></div>
            <Icon name={wheelResult.status === "no_prize" ? "circleX" : "award"} className={cn("mx-auto size-8", wheelResult.status === "no_prize" ? "text-stone-400" : "text-amber-500")} />
            <p className="mt-2 text-xs font-bold text-stone-500">{wheelResult.status === "no_prize" ? "این بار شانست نگرفت" : wheelResult.status === "message" ? "پیام ویژهٔ رستوران" : "تبریک! برنده شدی"}</p>
            <h3 className="mt-1 text-lg font-black text-stone-900">{wheelResult.title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{wheelResult.prizeType === "fixed_amount" ? `${formatPrice(wheelResult.snapshot.amount ?? 0)} تخفیف از فاکتور بعدی شما` : wheelResult.prizeType === "discount_code" ? `کد ${wheelResult.snapshot.discountCode ?? "تخفیف"} برای سفارش بعدی` : wheelResult.prizeType === "free_items" ? `${(wheelResult.snapshot.products ?? []).map((item) => item.name).join("، ")} رایگان در سفارش بعدی` : wheelResult.prizeType === "message" ? wheelResult.snapshot.message ?? "از همراهی شما سپاسگزاریم" : "دفعهٔ بعد دوباره امتحان کنید؛ یک جایزه در انتظار شماست."}</p>
            {wheelResult.expiresAt && <p className="mt-2 text-[11px] font-semibold text-amber-800">قابل استفاده تا {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(wheelResult.expiresAt))} · فقط در سفارش بعدی</p>}
          </div> : <p className="text-center text-xs leading-5 text-stone-500">هر مشتری پس از تأیید شماره موبایل می‌تواند در بازهٔ تعیین‌شده یک‌بار بچرخاند.</p>}
          {wheelNextSpinAt && !wheelReward && !wheelResult && <p className="rounded-xl bg-violet-50 px-3 py-2 text-center text-xs font-semibold text-violet-800">چرخش بعدی: {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(wheelNextSpinAt))}</p>}
          {wheelReward && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-semibold leading-6 text-emerald-900">جایزهٔ «{wheelReward.title}» برای سفارش بعدی فعال است. در مرحلهٔ پرداخت می‌توانید آن را انتخاب کنید.</p>}
          {wheelError && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{wheelError}</p>}
          <Button className="w-full" loading={wheelBusy} disabled={wheelBusy || wheelLoading || !wheelSegments.length || !!wheelReward || !!wheelResult || !!wheelNextSpinAt && new Date(wheelNextSpinAt).getTime() > clock} onClick={() => void spinWheel()}><Icon name="sparkles" className="size-4" />{wheelReward ? "جایزه برای سفارش بعدی فعال است" : wheelResult ? "نتیجه ثبت شد" : "گردونه را بچرخان"}</Button>
        </div>}
    </Modal>

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

    <Modal open={profileOpen || profileRequest > 0} onClose={() => { setProfileOpen(false); if (profileRequest > 0) onProfileRequestHandled?.(); }} title="پروفایل مشتری" description="ورود امن با شماره موبایل، مخصوص همین رستوران" size="sm">
      {readOnly ? <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">پروفایل در پیش‌نمایش منو فعال نیست.</div> : profile ? <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl bg-stone-50 p-4"><span className="flex size-12 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: accent }}><Icon name="users" /></span><div className="min-w-0"><p className="truncate font-extrabold">{profile.name}</p><p className="mt-1 text-sm text-stone-500" dir="ltr">{profile.phone}</p></div></div>
        <div className="grid grid-cols-2 gap-2"><div className="rounded-xl border border-stone-200 p-3"><p className="text-[11px] text-stone-500">سفارش‌های قبلی</p><p className="mt-1 font-extrabold">{toFa(profile.recentOrders.length)}{profile.recentOrders.length === 20 ? "+" : ""}</p></div><div className="rounded-xl border border-stone-200 p-3"><p className="text-[11px] text-stone-500">امتیاز باشگاه</p><p className="mt-1 font-extrabold">{toFa(profile.points)}</p></div></div>
        <div className="grid grid-cols-2 gap-2"><div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3"><p className="text-[11px] text-emerald-800">اعتبار کیف پول</p><p className="mt-1 font-extrabold text-emerald-950">{formatPrice(profile.walletBalance)}</p></div><div className="rounded-xl border border-stone-200 p-3"><p className="text-[11px] text-stone-500">ارزش امتیازها</p><p className="mt-1 font-extrabold">{profile.pointValueToman > 0 ? formatPrice(profile.pointsValueToman) : "تنظیم نشده"}</p></div></div>
        {profile.activeReward && <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-amber-700 shadow-sm"><Icon name="award" className="size-5" /></span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-amber-950">جایزهٔ فعال شما</p><p className="mt-1 text-sm font-extrabold text-amber-900">{profile.activeReward.rewardType === "discount_percent" ? `${toFa(profile.activeReward.discountPercent)}٪ تخفیف سفارش` : `${profile.activeReward.productName} رایگان`}</p><p className="mt-1 text-[11px] leading-5 text-amber-900/75">{profile.activeReward.campaignName} · فقط برای سفارش بعدی · انقضا {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(profile.activeReward.expiresAt))}</p></div></div>
        </div>}
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-emerald-950">تبدیل امتیاز به اعتبار</p><p className="mt-1 text-[11px] leading-5 text-emerald-900/70">{profile.pointValueToman > 0 ? `هر امتیاز ${formatPrice(profile.pointValueToman)} به کیف پول اضافه می‌کند.` : "رستوران هنوز ارزش تبدیل امتیاز را تنظیم نکرده است."}</p></div><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm"><Icon name="wallet" className="size-5" /></span></div>
          {profile.pointValueToman > 0 && <form className="mt-3 space-y-2" onSubmit={(event) => { event.preventDefault(); void submitRedeemPoints(); }}><label className="block space-y-1 text-xs font-semibold text-stone-600">امتیاز برای تبدیل<Input inputMode="numeric" type="number" min="1" max={profile.points} value={redeemPoints} onChange={(event) => { setRedeemPoints(event.target.value); setRedeemRequestKey(""); setRedeemError(""); }} placeholder={`حداکثر ${toFa(profile.points)}`} disabled={!profile.points || redeemBusy} /></label><p className="text-[11px] text-stone-500">اعتبار قابل دریافت: {formatPrice((Number(redeemPoints) || 0) * profile.pointValueToman)}</p><Button type="submit" size="sm" className="w-full" loading={redeemBusy} disabled={!profile.points || !redeemPoints}>تبدیل به کیف پول</Button>{redeemError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{redeemError}</p>}</form>}
        </div>
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-blue-900">دعوت از دوستان</p><p className="mt-1 text-[11px] leading-5 text-blue-800/70">با لینک خودتان، معرفی مشتری در باشگاه ثبت می‌شود.</p></div><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm"><Icon name="users" className="size-5" /></span></div>
          <div className="mt-3 flex items-center gap-2"><code dir="ltr" className="min-w-0 flex-1 truncate rounded-xl bg-white px-3 py-2.5 text-center text-sm font-extrabold tracking-widest text-blue-950 ring-1 ring-blue-100">{profile.referralCode}</code><Button type="button" size="sm" variant="secondary" onClick={async () => { const inviteUrl = `${window.location.origin}/m/${encodeURIComponent(slug)}?ref=${encodeURIComponent(profile.referralCode)}`; try { await navigator.clipboard.writeText(inviteUrl); setInviteCopied(true); window.setTimeout(() => setInviteCopied(false), 2200); } catch { setInviteCopied(false); } }}>{inviteCopied ? "کپی شد" : "کپی لینک"}</Button></div>
        </div>
        {customerFeedbackEnabled && <section className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50/80 to-white p-4">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-sky-700 shadow-sm"><Icon name="message" className="size-5" /></span><div><h3 className="text-sm font-extrabold text-sky-950">پیشنهاد و شکایت</h3><p className="mt-1 text-[11px] leading-5 text-sky-900/70">نظر یا مشکلی را مستقیم برای مدیریت رستوران بفرستید.</p></div></div>
          <form className="mt-3 space-y-2.5" onSubmit={(event) => void submitCustomerFeedback(event)}>
            <label className="block space-y-1 text-xs font-semibold text-stone-600">موضوع پیام
              <Select className="w-full bg-white" value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as CustomerFeedbackItem["type"])}><option value="suggestion">پیشنهاد</option><option value="complaint">شکایت</option></Select>
            </label>
            <label className="block space-y-1 text-xs font-semibold text-stone-600">متن پیام
              <Textarea className="min-h-24 bg-white text-sm" value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value)} minLength={10} maxLength={1500} placeholder="پیام خود را بنویسید (۱۰ تا ۱۵۰۰ نویسه)" required />
            </label>
            <div className="flex items-center justify-between gap-2"><span className="text-[10px] text-stone-400">{toFa(feedbackMessage.length)} / {toFa(1500)}</span><Button type="submit" size="sm" loading={feedbackBusy} disabled={feedbackBusy || feedbackMessage.trim().length < 10}><Icon name="arrowRight" className="size-3.5" /> ارسال پیام</Button></div>
          </form>
          {feedbackSuccess && <p role="status" className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">{feedbackSuccess}</p>}
          {feedbackError && <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{feedbackError}</p>}
          {feedbackLoading ? <p className="mt-3 text-xs text-stone-500">در حال دریافت پیام‌های شما…</p> : feedbackItems.length > 0 && <div className="mt-3 space-y-2 border-t border-sky-100 pt-3">
            <p className="text-[11px] font-bold text-stone-600">پیام‌های قبلی شما</p>
            {feedbackItems.map((item) => <article key={item.id} className="rounded-xl border border-stone-100 bg-white p-3"><div className="flex items-center justify-between gap-2"><b className="text-xs">{item.type === "complaint" ? "شکایت" : "پیشنهاد"}</b><span className="text-[10px] text-stone-400">{item.status === "resolved" ? "رسیدگی‌شده" : item.status === "in_progress" ? "در حال پیگیری" : "دریافت شد"}</span></div><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-6 text-stone-600">{item.message}</p></article>)}
          </div>}
        </section>}
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
