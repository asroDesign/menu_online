"use client";

import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import "@/components/marketing/marketing.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Field, Input, Icon, IconText } from "@/components/ui";
import { BrandLogo, usePlatformBranding } from "@/components/brand";

export function AuthForm({ mode, nextPath = "/dashboard" }: { mode: "login" | "register"; nextPath?: string }) {
  const router = useRouter();
  const branding = usePlatformBranding();
  const isLogin = mode === "login";
  const [form, setForm] = useState({ name: "", businessName: "", phone: "", email: "", password: "" });
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"phone" | "code">("phone");
  const [passwordMode, setPasswordMode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [registrationCountdown, setRegistrationCountdown] = useState<number | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [clockNow, setClockNow] = useState(0);
  const otpStorageKey = `menudigital:otp:${mode}`;
  const registrationUrl = `/register?next=${encodeURIComponent(nextPath)}`;
  useEffect(() => { api<{ enabled: boolean }>("/api/public/demo-mode").then((r) => setDemoEnabled(r.enabled)).catch(() => {}); }, []);
  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.sessionStorage.getItem(otpStorageKey) ?? "null") as { challengeId?: unknown; phone?: unknown; expiresAt?: unknown; resendAvailableAt?: unknown } | null;
        const now = Date.now();
        if (saved && typeof saved.challengeId === "string" && typeof saved.phone === "string" && Number.isFinite(saved.expiresAt) && Number(saved.expiresAt) > now && Number.isFinite(saved.resendAvailableAt)) {
          setChallengeId(saved.challengeId);
          setForm((current) => ({ ...current, phone: saved.phone as string }));
          setOtpExpiresAt(Number(saved.expiresAt));
          setResendAvailableAt(Number(saved.resendAvailableAt));
          setClockNow(now);
          setPhase("code");
        } else if (saved) {
          try { window.sessionStorage.removeItem(otpStorageKey); } catch {}
        }
      } catch {}
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [otpStorageKey]);
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
    try {
      const result = await api<{ challengeId: string; expiresIn: number; resendAfter: number }>("/api/auth/otp/request", { method: "POST", body: { phone: form.phone, purpose: mode, name: form.name, businessName: form.businessName } });
      const sentAt = Date.now();
      const expiresAt = sentAt + (Number.isFinite(result.expiresIn) && result.expiresIn > 0 ? result.expiresIn : 300) * 1000;
      const nextResendAt = sentAt + Math.max(60, Number.isFinite(result.resendAfter) && result.resendAfter > 0 ? result.resendAfter : 60) * 1000;
      setChallengeId(result.challengeId); setCode("");
      setOtpExpiresAt(expiresAt);
      setResendAvailableAt(nextResendAt);
      setClockNow(sentAt); setPhase("code");
      try { window.sessionStorage.setItem(otpStorageKey, JSON.stringify({ challengeId: result.challengeId, phone: form.phone, expiresAt, resendAvailableAt: nextResendAt })); } catch {}
    } catch (err) { showAuthError(err); }
    finally { setBusy(""); }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy("verify");
    try {
      const result = await api<{ admin?: boolean }>("/api/auth/otp/verify", { method: "POST", body: { challengeId, code } });
      try { window.sessionStorage.removeItem(otpStorageKey); } catch {}
      router.push(result.admin ? "/admin" : nextPath); router.refresh();
    } catch (err) { showAuthError(err); setBusy(""); }
  }

  async function passwordLogin(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy("password");
    try { await api("/api/auth/login", { method: "POST", body: { email: form.email, password: form.password } }); router.push(nextPath); router.refresh(); }
    catch (err) { setError((err as Error).message); setBusy(""); }
  }

  async function demo(account: string) {
    setError(""); setBusy(account);
    try { const r = await api<{ admin?: boolean }>("/api/auth/demo", { method: "POST", body: { account } }); router.push(r.admin ? "/admin" : nextPath); router.refresh(); }
    catch (err) { setError((err as Error).message); setBusy(""); }
  }

  const accountButtons = [["plus", " دمو پرمیوم پلاس (همه امکانات)"], ["premium", " دمو پرمیوم"], ["basic", " دمو پایه (کاتالوگ)"], ["admin", " مدیر کل سامانه"], ["support", " پشتیبان سامانه"], ["finance", " مالی سامانه"]] as const;
  const staffButtons = [["waiter", " گارسون"], ["cashier", " صندوق"], ["kitchen", " آشپزخانه"], ["warehouse", " انبار"], ["accountant", " حسابداری"], ["courier", " پیک"]] as const;

  return (
    <div className="marketing-site auth-layout grid min-h-dvh lg:grid-cols-[1fr_0.95fr]">
      <div className="flex flex-col justify-center px-5 py-10 sm:px-12 lg:px-16">
        <div className="card mx-auto w-full max-w-md border border-base-300/80 bg-base-100 p-6 shadow-xl shadow-base-content/5 sm:p-9">
          <Link href="/" className="mb-8 flex items-center gap-2.5"><span className="flex size-10 items-center justify-center rounded-xl bg-brand-500 text-xl text-white shadow-lg shadow-brand-500/30"><BrandLogo url={branding.logoUrl} alt="" className="size-7 object-contain" fallback={<Icon name="utensils" className="size-5" />} /></span><span className="text-lg font-extrabold">{branding.siteName}</span></Link>
          <h1 className="text-2xl font-extrabold">{isLogin ? "ورود به داشبورد" : "ساخت منوی دیجیتال شما"}</h1>
          <p className="mt-2 text-sm text-stone-500">{isLogin ? "شماره موبایل خود را وارد کنید تا کد ورود برایتان پیامک شود." : "با شماره موبایل و کد اعتبارسنجی، حساب کسب‌وکار خود را بسازید."}</p>

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
              {!isLogin && <><Field label="نام و نام خانوادگی"><Input value={form.name} onChange={set("name")} required placeholder="مثلاً سارا احمدی" /></Field><Field label="نام کسب‌وکار"><Input value={form.businessName} onChange={set("businessName")} required placeholder="مثلاً کافه نیلوفر" /></Field></>}
              <Field label="شماره موبایل"><Input type="tel" dir="ltr" className="text-left" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} required placeholder="09123456789" disabled={registrationCountdown !== null} /></Field>
              {error && registrationCountdown === null && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{error}</p>}
              <Button type="submit" size="lg" className="w-full" loading={busy === "request"} disabled={registrationCountdown !== null}>{isLogin ? "ارسال کد ورود" : "ارسال کد و ساخت حساب"}</Button>
              {isLogin && <button type="button" className="w-full text-sm font-bold text-brand-700" disabled={registrationCountdown !== null} onClick={() => { setPasswordMode(true); setError(""); }}>ورود با ایمیل و رمز عبور</button>}
            </form>
          ) : (
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
          )}

          {demoEnabled && <div className="my-6 flex items-center gap-3 text-xs text-stone-400"><span className="h-px flex-1 bg-stone-200" /> یا ورود آزمایشی <span className="h-px flex-1 bg-stone-200" /></div>}
          {demoEnabled && <div className="grid gap-2"><IconText>{accountButtons.map(([key, label]) => <Button key={key} variant="secondary" className="w-full justify-between" onClick={() => demo(key)} loading={busy === key} disabled={!!busy || registrationCountdown !== null}><span>{label}</span></Button>)}</IconText></div>}
          {demoEnabled && <p className="mb-2 mt-5 text-xs font-bold text-stone-500">ورود به‌عنوان کارمند (دمو رستوران نیلوفر):</p>}
          {demoEnabled && <div className="grid grid-cols-3 gap-2"><IconText>{staffButtons.map(([key, label]) => <Button key={key} size="sm" variant="secondary" onClick={() => demo(key)} loading={busy === key} disabled={!!busy || registrationCountdown !== null}>{label}</Button>)}</IconText></div>}
          <p className="mt-6 text-center text-sm text-stone-500">{isLogin ? "حساب ندارید؟ " : "قبلاً ثبت‌نام کرده‌اید؟ "}<Link href={`${isLogin ? "/register" : "/login"}${nextPath !== "/dashboard" ? `?next=${encodeURIComponent(nextPath)}` : ""}`} className="font-bold text-brand-600 hover:underline">{isLogin ? "ثبت‌نام کنید" : "وارد شوید"}</Link></p>
          {demoEnabled && isLogin && <p className="mt-4 rounded-xl bg-stone-100 px-3 py-2 text-center text-[11px] text-stone-500" dir="ltr">رمز همه‌ی حساب‌های دمو: demo1234 (مدیر: admin1234)</p>}
        </div>
      </div>
      <aside className="auth-story"><span className="eyebrow">همراه هر روز رستوران شما</span><h2>برای مهمان‌ها وقت بگذارید؛<br /><em>کارها را به جریان بسپارید.</em></h2><p>منو، سفارش‌ها و مدیریت کسب‌وکار؛ در یک محیط یکپارچه.</p><DashboardPreview /><Link href="/plans">تعرفه‌ها و تمام امکانات را ببینید ←</Link></aside>
    </div>
  );
}
