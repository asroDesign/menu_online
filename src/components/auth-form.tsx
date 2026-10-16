"use client";

import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { DEMO_ENABLED } from "@/lib/demo-mode";
import "@/components/marketing/marketing.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button, Field, Input , EmojiIcon, IconText} from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", businessName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy("form");
    try {
      await api(`/api/auth/${mode}`, { method: "POST", body: form });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function demo(account: string) {
    setError("");
    setBusy(account);
    try {
      const r = await api<{ admin?: boolean }>("/api/auth/demo", { method: "POST", body: { account } });
      router.push(r.admin ? "/admin" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  const isLogin = mode === "login";
  return (
    <div className="marketing-site auth-layout grid min-h-dvh lg:grid-cols-[1fr_0.95fr]">
      <div className="flex flex-col justify-center px-5 py-10 sm:px-12 lg:px-16">
        <div className="card mx-auto w-full max-w-md border border-base-300/80 bg-base-100 p-6 shadow-xl shadow-base-content/5 sm:p-9">
          <Link href="/" className="mb-8 flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-500 text-xl text-white shadow-lg shadow-brand-500/30"><IconText>{<EmojiIcon emoji="" />}</IconText></span>
            <span className="text-lg font-extrabold">منوی دیجیتال</span>
          </Link>
          <h1 className="text-2xl font-extrabold">{isLogin ? "ورود به داشبورد" : "ساخت منوی دیجیتال شما"}</h1>
          <p className="mt-2 text-sm text-stone-500">
            {isLogin ? "برای مدیریت منو و سفارش‌ها وارد شوید." : "در کمتر از یک دقیقه کافه یا رستوران خود را آنلاین کنید."}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {!isLogin && (
              <>
                <Field label="نام و نام خانوادگی">
                  <Input value={form.name} onChange={set("name")} required placeholder="مثلاً سارا احمدی" />
                </Field>
                <Field label="نام کسب‌وکار">
                  <Input value={form.businessName} onChange={set("businessName")} required placeholder="مثلاً کافه نیلوفر" />
                </Field>
              </>
            )}
            <Field label="ایمیل">
              <Input type="email" dir="ltr" className="text-left" value={form.email} onChange={set("email")} required placeholder="you@example.com" autoComplete="email" />
            </Field>
            <Field label="رمز عبور" hint={isLogin ? undefined : "حداقل ۶ کاراکتر"}>
              <Input type="password" dir="ltr" className="text-left" value={form.password} onChange={set("password")} required minLength={isLogin ? undefined : 6} placeholder="••••••••" autoComplete={isLogin ? "current-password" : "new-password"} />
            </Field>
            {error && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy === "form"}>
              {isLogin ? "ورود" : "ساخت حساب رایگان"}
            </Button>
          </form>

          {DEMO_ENABLED && <div className="my-6 flex items-center gap-3 text-xs text-stone-400">
            <span className="h-px flex-1 bg-stone-200" /> یا <span className="h-px flex-1 bg-stone-200" />
          </div>}
          {DEMO_ENABLED && <div className="grid gap-2">
            <IconText>{([["plus", " دمو پرمیوم پلاس (همه امکانات)", "demo@menudigital.ir"], ["premium", " دمو پرمیوم", "premium@menudigital.ir"], ["basic", " دمو پایه (کاتالوگ)", "basic@menudigital.ir"], ["admin", " مدیر کل سامانه", "admin@menudigital.ir"], ["support", " پشتیبان سامانه", "support@menudigital.ir"], ["finance", " مالی سامانه", "finance@menudigital.ir"]] as const).map(([k, l]) => (
              <Button key={k} variant="secondary" className="w-full justify-between" onClick={() => demo(k)} loading={busy === k} disabled={!!busy}>
                <span>{l}</span>
              </Button>
            ))}</IconText>
          </div>}
          {DEMO_ENABLED && <p className="mb-2 mt-5 text-xs font-bold text-stone-500">ورود به‌عنوان کارمند (دمو رستوران نیلوفر):</p>}
          {DEMO_ENABLED && <div className="grid grid-cols-3 gap-2">
            <IconText>{([["waiter", " گارسون"], ["cashier", " صندوق"], ["kitchen", " آشپزخانه"], ["warehouse", " انبار"], ["accountant", " حسابداری"], ["courier", " پیک"]] as const).map(([k, l]) => (
              <Button key={k} size="sm" variant="secondary" onClick={() => demo(k)} loading={busy === k} disabled={!!busy}>{l}</Button>
            ))}</IconText>
          </div>}
          <p className="mt-6 text-center text-sm text-stone-500">
            {isLogin ? "حساب ندارید؟ " : "قبلاً ثبت‌نام کرده‌اید؟ "}
            <Link href={isLogin ? "/register" : "/login"} className="font-bold text-brand-600 hover:underline">
              {isLogin ? "ثبت‌نام کنید" : "وارد شوید"}
            </Link>
          </p>
          {DEMO_ENABLED && isLogin && (
            <p className="mt-4 rounded-xl bg-stone-100 px-3 py-2 text-center text-[11px] text-stone-500" dir="ltr">
              رمز همه‌ی حساب‌های دمو: demo1234 (مدیر: admin1234)
            </p>
          )}
        </div>
      </div>

      <aside className="auth-story"><span className="eyebrow">همراه هر روز رستوران شما</span><h2>برای مهمان‌ها وقت بگذارید؛<br/><em>کارها را به جریان بسپارید.</em></h2><p>منو، سفارش‌ها و مدیریت کسب‌وکار؛ در یک محیط یکپارچه.</p><DashboardPreview/><Link href="/plans">تعرفه‌ها و تمام امکانات را ببینید ←</Link></aside>
    </div>
  );
}
