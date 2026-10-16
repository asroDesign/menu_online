"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: "error", event: "ui.global_error", message: error.message, digest: error.digest }));
  }, [error]);

  return <html lang="fa" dir="rtl"><body style={{ margin: 0, fontFamily: "sans-serif", background: "#f5f5f4", color: "#1c1917" }}>
    <main style={{ display: "grid", minHeight: "100dvh", placeItems: "center", padding: 20 }}>
      <section style={{ maxWidth: 420, borderRadius: 24, background: "white", padding: 32, textAlign: "center", boxShadow: "0 20px 50px #0001" }}>
        <h1>سامانه با خطا روبه‌رو شد</h1><p>صفحه را دوباره بارگذاری کنید. شناسه‌ی خطا: {error.digest ?? "—"}</p>
        <button onClick={() => reset()} style={{ border: 0, borderRadius: 12, padding: "12px 20px", background: "#f97316", color: "white", cursor: "pointer" }}>تلاش دوباره</button>
      </section>
    </main>
  </body></html>;
}
