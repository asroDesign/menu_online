"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtJ } from "@/lib/jalali";
import { planName } from "@/lib/plans";
import { toFa } from "@/lib/format";
import { cn, Icon , EmojiIcon, IconText} from "@/components/ui";

type Data = { items: { id: number; title: string; body: string; level: string }[]; subscription: { plan: string; effectivePlan: string; endsAt: string | null; daysLeft: number | null } };
const TONE: Record<string, string> = { info: "bg-sky-50 text-sky-900 ring-sky-200", warning: "bg-amber-50 text-amber-900 ring-amber-200", success: "bg-emerald-50 text-emerald-900 ring-emerald-200" };

/** Platform announcements, subscription warnings and the "you are logged in as…" bar. */
export function DashboardBanners({ impersonating, canManage }: { impersonating?: string; canManage: boolean }) {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  useEffect(() => {
    try { setHidden(JSON.parse(localStorage.getItem("hiddenAnn") ?? "[]")); } catch { /* ignore */ } // eslint-disable-line react-hooks/set-state-in-effect
    api<Data>("/api/announcements").then(setD).catch(() => {});
  }, []);
  async function back() { await api("/api/auth/return", { method: "POST" }).catch(() => {}); router.push("/admin"); router.refresh(); }
  const hide = (id: number) => { const n = [...hidden, id]; setHidden(n); localStorage.setItem("hiddenAnn", JSON.stringify(n)); };
  const sub = d?.subscription;
  const expired = !!sub && sub.effectivePlan !== sub.plan;
  const soon = !!sub && !expired && sub.daysLeft !== null && sub.daysLeft <= 14 && sub.plan !== "basic";
  return (
    <div className="space-y-2.5">
      <IconText>{impersonating && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg"><span>{<EmojiIcon emoji="" />} شما به‌عنوان <b>{impersonating}</b> وارد شده‌اید (حالت مدیر سامانه؛ همه‌ی اقدام‌ها ثبت می‌شود).</span><button onClick={back} className="ms-auto rounded-xl bg-white px-4 py-1.5 text-xs font-extrabold text-stone-900">بازگشت به پنل مدیر</button></div>
      )}</IconText>
      <IconText>{expired && sub && <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 ring-1 ring-rose-200">{<EmojiIcon emoji="" />} اشتراک پلن «{planName(sub.plan)}» در {sub.endsAt && fmtJ(sub.endsAt)} تمام شده و حساب شما موقتاً با امکانات پلن پایه کار می‌کند. {canManage && <Link href="/dashboard/plan" className="ms-auto rounded-xl bg-rose-600 px-4 py-1.5 text-xs font-bold text-white">تمدید اشتراک</Link>}</div>}</IconText>
      <IconText>{soon && sub && <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">{<EmojiIcon emoji="" />} اشتراک شما {toFa(Math.max(0, sub.daysLeft ?? 0))} روز دیگر ({sub.endsAt && fmtJ(sub.endsAt)}) تمام می‌شود. {canManage && <Link href="/dashboard/plan" className="ms-auto rounded-xl bg-amber-600 px-4 py-1.5 text-xs font-bold text-white">درخواست تمدید</Link>}</div>}</IconText>
      {d?.items.filter((a) => !hidden.includes(a.id)).map((a) => (
        <div key={a.id} className={cn("flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ring-1", TONE[a.level] ?? TONE.info)}><Icon name={a.level === "warning" ? "warning" : a.level === "success" ? "circleCheck" : "bell"} className="mt-0.5 size-5 shrink-0" /><div className="min-w-0 flex-1"><p className="font-bold">{a.title}</p>{a.body && <p className="mt-0.5 leading-7 opacity-90">{a.body}</p>}</div><button onClick={() => hide(a.id)} aria-label="بستن" className="rounded-lg px-2 text-lg leading-none opacity-60 hover:opacity-100">×</button></div>
      ))}
    </div>
  );
}
