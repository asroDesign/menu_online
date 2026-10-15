"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toFa } from "@/lib/format";
import { Button, cn, Input, Textarea } from "@/components/ui";

type Q = { id: string; text: string; type: "rating" | "choice" | "text"; options?: string[] };

export function SurveyForm({ id, title, description, questions, business }: { id: number; title: string; description: string; questions: Q[]; business: { name: string; emoji: string; color: string } }) {
  const [a, setA] = useState<Record<string, string | number>>({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  async function submit() {
    setBusy(true);
    setErr("");
    try { await api(`/api/public/survey/${id}`, { method: "POST", body: { answers: a, customerName: name } }); setDone(true); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="min-h-dvh bg-[#f6f5f3] px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="rounded-3xl p-6 text-white shadow-xl" style={{ background: `linear-gradient(135deg, ${business.color}, #1c1917)` }}>
          <div className="flex items-center gap-3"><span className="flex size-12 items-center justify-center rounded-2xl bg-white text-2xl">{business.emoji}</span><p className="font-bold">{business.name}</p></div>
          <h1 className="mt-5 text-xl font-extrabold">{title}</h1>
          {description && <p className="mt-2 text-sm leading-7 text-white/85">{description}</p>}
        </div>
        {done ? (
          <div className="mt-5 rounded-3xl bg-white p-10 text-center shadow-sm"><div className="text-6xl">🙏</div><h2 className="mt-4 text-xl font-extrabold">از بازخورد شما سپاسگزاریم</h2><p className="mt-2 text-sm text-stone-500">نظر شما به ما کمک می‌کند بهتر شویم.</p></div>
        ) : (
          <div className="mt-5 space-y-4">
            {questions.map((q, i) => (
              <div key={q.id} className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="mb-3 text-sm font-bold">{toFa(i + 1)}. {q.text}</p>
                {q.type === "rating" && <div className="flex justify-between gap-2">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setA({ ...a, [q.id]: n })} className={cn("flex-1 rounded-xl py-3 text-lg transition", Number(a[q.id]) >= n ? "bg-amber-100 ring-2 ring-amber-400" : "bg-stone-100")}>{Number(a[q.id]) >= n ? "⭐" : "☆"}<span className="block text-[10px] text-stone-500">{toFa(n)}</span></button>)}</div>}
                {q.type === "choice" && <div className="space-y-2">{q.options?.map((o) => <button key={o} onClick={() => setA({ ...a, [q.id]: o })} className={cn("w-full rounded-xl px-4 py-3 text-start text-sm transition", a[q.id] === o ? "font-bold ring-2" : "bg-stone-100")} style={a[q.id] === o ? { background: `${business.color}15`, borderColor: business.color, ["--tw-ring-color" as string]: business.color } : undefined}>{o}</button>)}</div>}
                {q.type === "text" && <Textarea rows={3} value={String(a[q.id] ?? "")} onChange={(e) => setA({ ...a, [q.id]: e.target.value })} placeholder="پاسخ شما…" />}
              </div>
            ))}
            <Input placeholder="نام شما (اختیاری)" value={name} onChange={(e) => setName(e.target.value)} />
            {err && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">{err}</p>}
            <Button size="lg" className="w-full" loading={busy} onClick={submit} style={{ background: business.color }}>ارسال نظر</Button>
          </div>
        )}
      </div>
    </div>
  );
}
