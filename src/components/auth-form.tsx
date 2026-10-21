"use client";

import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import "@/components/marketing/marketing.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Field, Input, Icon, Select } from "@/components/ui";
import { BrandLogo, usePlatformBranding } from "@/components/brand";
import { trackPlatformEvent } from "@/lib/platform-analytics";

const BUSINESS_TYPES = { cafe: "کافه", restaurant: "رستوران", fastfood: "فست‌فود", bakery: "نان و شیرینی", shop: "فروشگاه / کاتالوگ" } as const;

export function AuthForm({ mode, nextPath = "/dashboard", freeTrialSignup = false }: { mode: "login" | "register"; nextPath?: string; freeTrialSignup?: boolean }) {
  const router = useRouter();
  const branding = usePlatformBranding();
  const isLogin = mode === "login";
  const [form, setForm] = useState({ name: "", businessName: "", businessType: "cafe", address: "", phone: "", email: "", password: "" });
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"phone" | "code" | "details">("phone");
  const [passwordMode, setPasswordMode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [registrationCountdown, setRegistrationCountdown] = useState<number | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [clockNow, setClockNow] = useState(0);
  const otpStorageKey = `menudigital:otp:${mode}`;
  const registrationParams = new URLSearchParams({ next: nextPath });
  if (freeTrialSignup) registrationParams.set("trial", "demo");
  const registrationUrl = `/register?${registrationParams.toString()}`;
  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.sessionStorage.getItem(otpStorageKey) ?? "null") as { challengeId?: unknown; phone?: unknown; expiresAt?: unknown; resendAvailableAt?: unknown; flowPhase?: unknown } | null;
        const now = Date.now();
        if (saved && typeof saved.challengeId === "string" && typeof saved.phone === "string" && Number.isFinite(saved.expiresAt) && Number(saved.expiresAt) > now && Number.isFinite(saved.resendAvailableAt)) {
          setChallengeId(saved.challengeId);
          setForm((current) => ({ ...current, phone: saved.phone as string }));
          setOtpExpiresAt(Number(saved.expiresAt));
          setResendAvailableAt(Number(saved.resendAvailableAt));
          setClockNow(now);
          setPhase(saved.flowPhase === "details" && !isLogin ? "details" : "code");
        } else if (saved) {
          try { window.sessionStorage.removeItem(otpStorageKey); } catch {}
        }
      } catch {}
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [otpStorageKey, isLogin]);
  useEffect(() => {
    if (phase !== "code") return;
    const updateClock = () => setClockNow(Date.now());
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (registrationCountdown === null) return;
    if (registrationCountdown <= 0) {
      router.replace(registrationUrl);
      return;
    }
    const timer = window.setTimeout(() => setRegistrationCountdown((current) => current === null ? null : current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [registrationCountdown, registrationUrl, router]);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function showAuthError(err: unknown) {
    const message = err instanceof Error ? err.message : "خطایی رخ داد";
    setError(message);
    if (isLogin && message.includes("حسابی با این شماره پیدا نشد")) setRegistrationCountdown(3);
  }

  const secondsUntilExpiry = otpExpiresAt === null || clockNow === 0 ? null : Math.max(0, Math.ceil((otpExpiresAt - clockNow) / 1000));
  const secondsUntilResend = resendAvailableAt === null || !Number.isFinite(resendAvailableAt) || clockNow === 0 ? null : Math.max(0, Math.ceil((resendAvailableAt - clockNow) / 1000));
  const resendCountdown = secondsUntilResend ?? 60;
  const canResend = phase === "code" && secondsUntilResend === 0 && !busy && registrationCountdown === null;
  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  };

  async function requestCode(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy("request");
    if (!isLogin) trackPlatformEvent("signup_start");
    try {
      const result = await api<{ challengeId: string; expiresIn: number; resendAfter: number }>("/api/auth/otp/request", { method: "POST", body: { phone: form.phone, purpose: mode } });
      const sentAt = Date.now();
      const expiresAt = sentAt + (Number.isFinite(result.expiresIn) && result.expiresIn > 0 ? result.expiresIn : 300) * 1000;
      const nextResendAt = sentAt + Math.max(60, Number.isFinite(result.resendAfter) && result.resendAfter > 0 ? result.resendAfter : 60) * 1000;
      setChallengeId(result.challengeId); setCode("");
      setOtpExpiresAt(expiresAt);
      setResendAvailableAt(nextResendAt);
      setClockNow(sentAt); setPhase("code");
      try { window.sessionStorage.setItem(otpStorageKey, JSON.stringify({ challengeId: result.challengeId, phone: form.phone, expiresAt, resendAvailableAt: nextResendAt, flowPhase: "code" })); } catch {}
    } catch (err) { showAuthError(err); }
    finally { setBusy(""); }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy("verify");
    try {
      const result = await api<{ admin?: boolean; registrationRequired?: boolean; trialGranted?: boolean }>("/api/auth/otp/verify", { method: "POST", body: { challengeId, code } });
      if (!isLogin && result.registrationRequired) {
        const now = Date.now();
        setCode(""); setPhase("details"); setError(""); setClockNow(now); setBusy("");
        try { window.sessionStorage.setItem(otpStorageKey, JSON.stringify({ challengeId, phone: form.phone, expiresAt: now + 15 * 60_000, resendAvailableAt: resendAvailableAt ?? now, flowPhase: "details" })); } catch {}
        return;
      }
      try { window.sessionStorage.removeItem(otpStorageKey); } catch {}
      if (result.trialGranted) {
        if (nextPath !== "/dashboard") {
          try { window.sessionStorage.setItem("menudigital:post-setup-next", nextPath); } catch {}
        }
        router.push("/dashboard");
      } else router.push(result.admin ? "/admin" : nextPath);
      router.refresh();
    } catch (err) { showAuthError(err); setBusy(""); }
  }

  async function completeRegistration(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy("complete");
    try {
      const result = await api<{ trialGranted: boolean }>("/api/auth/register/complete", { method: "POST", body: { name: form.name, businessName: form.businessName, businessType: form.businessType, address: form.address } });
      try { window.sessionStorage.removeItem(otpStorageKey); } catch {}
      if (result.trialGranted) {
        if (nextPath !== "/dashboard") {
          try { window.sessionStorage.setItem("menudigital:post-setup-next", nextPath); } catch {}
        }
        router.push("/dashboard");
      } else {
        router.push(nextPath);
      }
      router.refresh();
    } catch (err) { showAuthError(err); setBusy(""); }
  }

  async function passwordLogin(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy("password");
    try { await api("/api/auth/login", { method: "POST", body: { email: form.email, password: form.password } }); router.push(nextPath); router.refresh(); }
    catch (err) { setError((err as Error).message); setBusy(""); }
  }


  return (
    <div className="marketing-site auth-layout grid min-h-dvh lg:grid-cols-[1fr_0.95fr]">
      <div className="flex flex-col justify-center px-5 py-10 sm:px-12 lg:px-16">
        <div className="card mx-auto w-full max-w-md border border-base-300/80 bg-base-100 p-6 shadow-xl shadow-base-content/5 sm:p-9">
          <Link href="/" className="mb-8 flex items-center gap-2.5"><span className="flex size-10 items-center justify-center rounded-xl bg-brand-500 text-xl text-white shadow-lg shadow-brand-500/30"><BrandLogo url={branding.logoUrl} alt="" className="size-7 object-contain" fallback={<Icon name="utensils" className="size-5" />} /></span><span className="text-lg font-extrabold">{branding.siteName}</span></Link>
          <h1 className="text-2xl font-extrabold">{isLogin ? "ورود به داشبورد" : "ساخت منوی دیجیتال شما"}</h1>
          <p className="mt-2 text-sm text-stone-500">{isLogin ? "شماره موبایل خود را وارد کنید تا کد ورود برایتان پیامک شود." : phase === "details" ? "شماره شما تأیید شد؛ اطلاعات اولیه فروشگاه را وارد کنید تا حساب ساخته شود." : "ابتدا شماره موبایل را تأیید کنید، سپس اطلاعات اولیه فروشگاه را ثبت کنید."}</p>

          {registrationCountdown !== null && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status" aria-live="polite">
            <p className="font-bold">حسابی با این شماره پیدا نشد.</p>
            <p className="mt-1">شما در حال انتقال به صفحه ثبت نام هستید</p>
            <p className="mt-2 font-extrabold tabular-nums" aria-label={`انتقال تا ${registrationCountdown} ثانیه دیگر`}>{registrationCountdown.toLocaleString("fa-IR")} ثانیه</p>
          </div>}

          {isLogin && passwordMode ? (
            <form onSubmit={passwordLogin} className="mt-7 space-y-4">
              <Field label="ایمیل"><Input type="email" dir="ltr" className="text-left" value={form.email} onChange={set("email")} required autoComplete="email" /></Field>
              <Field label="رمز عبور"><Input type="password" dir="ltr" className="text-left" value={form.password} onChange={set("password")} required autoComplete="current-password" /></Field>
              {error && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{error}</p>}
              <Button type="submit" size="lg" className="w-full" loading={busy === "password"}>ورود با ایمیل</Button>
              <button type="button" className="w-full text-sm font-bold text-brand-700" onClick={() => { setPasswordMode(false); setError(""); }}>ورود با کد پیامکی</button>
            </form>
          ) : phase === "phone" ? (
            <form onSubmit={requestCode} className="mt-7 space-y-4">
              <Field label="شماره موبایل"><Input type="tel" dir="ltr" className="text-left" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} required placeholder="09123456789" disabled={registrationCountdown !== null} /></Field>
              {error && registrationCountdown === null && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{error}</p>}
              <Button type="submit" size="lg" className="w-full" loading={busy === "request"} disabled={registrationCountdown !== null}>{isLogin ? "ارسال کد ورود" : "ارسال کد تأیید شماره"}</Button>
              {isLogin && <button type="button" className="w-full text-sm font-bold text-brand-700" disabled={registrationCountdown !== null} onClick={() => { setPasswordMode(true); setError(""); }}>ورود با ایمیل و رمز عبور</button>}
            </form>
          ) : phase === "code" ? (
            <form onSubmit={verifyCode} className="mt-7 space-y-4">
              <Field label={`کد پیامک‌شده به ${form.phone}`}><Input dir="ltr" className="text-center text-xl tracking-[0.35em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "").slice(0, 6))} required /></Field>
              <div className="space-y-2 rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-3 text-sm leading-6 text-base-content/75" aria-live="off">
                <p className="flex items-center justify-between gap-3" role="timer"><span className="inline-flex items-center gap-2"><Icon name="clock" className="size-4 text-primary" />اعتبار کد</span><span className="font-extrabold tabular-nums text-primary">{formatTime(secondsUntilExpiry ?? 300)}</span></p>
                {secondsUntilExpiry === 0 && <p className="text-xs font-semibold text-error">کد منقضی شده است؛ کد تازه درخواست کنید.</p>}
              </div>
              {error && registrationCountdown === null && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{error}</p>}
              <Button type="submit" size="lg" className="w-full" loading={busy === "verify"} disabled={code.length !== 6 || secondsUntilExpiry === 0 || registrationCountdown !== null}>تأیید و ادامه</Button>
              <div className="flex justify-between text-sm"><button type="button" className="font-bold text-brand-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={registrationCountdown !== null} onClick={() => { try { window.sessionStorage.removeItem(otpStorageKey); } catch {} setPhase("phone"); setChallengeId(""); setCode(""); setError(""); setOtpExpiresAt(null); setResendAvailableAt(null); }}>ویرایش شماره</button><button type="button" className="font-bold text-brand-700 transition disabled:cursor-not-allowed disabled:text-base-content/35 disabled:opacity-50" disabled={!canResend} onClick={requestCode}>{canResend ? "ارسال دوباره کد" : `ارسال دوباره کد تا ${formatTime(resendCountdown)}`}</button></div>
            </form>
          ) : (
            <form onSubmit={completeRegistration} className="mt-7 space-y-4">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm leading-6"><b className="text-primary">دوره آزمایشی رایگان Premium Plus</b><p className="mt-1 text-base-content/70">پس از ثبت اطلاعات فروشگاه، دوره آزمایشی با مدت تعیین‌شده در تنظیمات سامانه فعال می‌شود و تور راه‌اندازی را در پنل می‌بینید.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="نام و نام خانوادگی"><Input value={form.name} onChange={set("name")} required maxLength={100} autoComplete="name" placeholder="مثلاً سارا احمدی" /></Field>
                <Field label="نام فروشگاه"><Input value={form.businessName} onChange={set("businessName")} required minLength={2} maxLength={120} autoComplete="organization" placeholder="مثلاً کافه نیلوفر" /></Field>
                <Field label="نوع کسب‌وکار"><Select required value={form.businessType} onChange={(event) => setForm((current) => ({ ...current, businessType: event.target.value }))}>{Object.entries(BUSINESS_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
                <Field label="نشانی فروشگاه (اختیاری)"><Input value={form.address} onChange={set("address")} maxLength={240} autoComplete="street-address" placeholder="شهر، خیابان یا نشانی کوتاه" /></Field>
              </div>
              <p className="rounded-xl bg-base-200 px-3.5 py-2.5 text-xs text-base-content/70">شماره تأییدشده: <b dir="ltr">{form.phone}</b></p>
              {error && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{error}</p>}
              <Button type="submit" size="lg" className="w-full" loading={busy === "complete"}>ثبت فروشگاه و ورود به پنل</Button>
              <button type="button" className="w-full text-sm font-bold text-brand-700" disabled={busy === "complete"} onClick={() => { try { window.sessionStorage.removeItem(otpStorageKey); } catch {} setPhase("phone"); setChallengeId(""); setCode(""); setError(""); }}>تغییر شماره موبایل</button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-stone-500">{isLogin ? "حساب ندارید؟ " : "قبلاً ثبت‌نام کرده‌اید؟ "}<Link href={`${isLogin ? "/register" : "/login"}${(nextPath !== "/dashboard" || freeTrialSignup) ? `?${new URLSearchParams({ ...(nextPath !== "/dashboard" ? { next: nextPath } : {}), ...(freeTrialSignup ? { trial: "demo" } : {}) }).toString()}` : ""}`} className="font-bold text-brand-600 hover:underline">{isLogin ? "ثبت‌نام کنید" : "وارد شوید"}</Link></p>
        </div>
      </div>
      <aside className="auth-story"><span className="eyebrow">همراه هر روز رستوران شما</span><h2>برای مهمان‌ها وقت بگذارید؛<br /><em>کارها را به جریان بسپارید.</em></h2><p>منو، سفارش‌ها و مدیریت کسب‌وکار؛ در یک محیط یکپارچه.</p><DashboardPreview /><Link href="/plans">تعرفه‌ها و تمام امکانات را ببینید ←</Link></aside>
    </div>
  );
}
