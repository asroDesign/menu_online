"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: "error", event: "ui.route_error", message: error.message, digest: error.digest }));
  }, [error]);

  return (
    <main dir="rtl" className="grid min-h-dvh place-items-center bg-base-200/70 p-5 text-base-content">
      <section className="card w-full max-w-md border border-base-300 bg-base-100 p-8 text-center shadow-xl">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-error/10 text-error"><Icon name="warning" className="size-8" /></span>
        <h1 className="mt-5 text-xl font-extrabold">بارگذاری صفحه با خطا روبه‌رو شد</h1>
        <p className="mt-2 text-sm leading-7 text-base-content/60">می‌توانید دوباره تلاش کنید. اگر خطا ادامه داشت، شناسه‌ی زیر را به پشتیبانی بدهید.</p>
        {error.digest && <code className="mt-3 text-xs text-base-content/50">{error.digest}</code>}
        <button type="button" onClick={() => reset()} className="btn btn-primary mt-6 rounded-xl">تلاش دوباره</button>
      </section>
    </main>
  );
}
