"use client";

import { useEffect, useState } from "react";
import { formatTime, timeAgo, toFa } from "@/lib/format";
import type { Order } from "@/lib/types";
import { cn , EmojiIcon, IconText} from "@/components/ui";

const COL: Record<string, string> = { pending: "border-amber-400 bg-amber-950/40", preparing: "border-sky-400 bg-sky-950/40", ready: "border-violet-400 bg-violet-950/40" };
const NEXT: Record<string, [string, string]> = { pending: ["preparing", "شروع آماده‌سازی"], preparing: ["ready", "آماده شد"], ready: ["served", "تحویل شد"] };

export function KitchenDisplay({ code }: { code: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [meta, setMeta] = useState({ business: "", device: "" });
  const [err, setErr] = useState("");
  const [, tick] = useState(0);
  async function load() {
    try {
      const r = await fetch(`/api/device/${code}/orders`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setOrders(j.orders);
      setMeta({ business: j.business, device: j.device });
      setErr("");
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { load(); const a = setInterval(load, 5000); const b = setInterval(() => tick((x) => x + 1), 30000); return () => { clearInterval(a); clearInterval(b); }; }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  async function move(o: Order) {
    const [status] = NEXT[o.status];
    setOrders((x) => x?.map((y) => (y.id === o.id ? { ...y, status } : y)).filter((y) => y.status !== "served") ?? x);
    await fetch(`/api/device/${code}/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: o.id, status }) });
    load();
  }
  return (
    <div className="min-h-dvh bg-stone-950 p-4 text-white">
      <header className="mb-4 flex items-center justify-between"><div><h1 className="text-lg font-extrabold"><IconText>{<EmojiIcon emoji="" />}</IconText> نمایشگر آشپزخانه</h1><p className="text-xs text-stone-400">{meta.business} · {meta.device}</p></div><span className="text-xs text-stone-500">به‌روزرسانی خودکار</span></header>
      <IconText>{err ? <p className="mt-20 text-center text-rose-400">{err === "دستگاه پیدا نشد" ? "کد دستگاه نامعتبر است" : err}</p> : !orders ? <p className="mt-20 text-center text-stone-500">در حال بارگذاری…</p> : orders.length === 0 ? <div className="mt-24 text-center text-stone-500"><div className="text-6xl">{<EmojiIcon emoji="" />}</div><p className="mt-3">سفارشی در جریان نیست</p></div> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {orders.map((o) => (
            <div key={o.id} className={cn("flex flex-col rounded-2xl border-2 p-4", COL[o.status])}>
              <div className="flex items-start justify-between"><div><p className="text-3xl font-black">#{toFa(o.number)}</p><p className="text-xs text-stone-300">{o.type === "delivery" ? " ارسال" : o.type === "takeaway" ? " بیرون‌بر" : ` ${o.tableName ?? "—"}`}</p></div><div className="text-end text-xs text-stone-400"><p>{formatTime(o.createdAt)}</p><p>{timeAgo(o.createdAt)}</p></div></div>
              {o.scheduledFor && <p className="mt-2 rounded-lg bg-violet-500/20 px-2 py-1 text-xs text-violet-200">{<EmojiIcon emoji="" />} پیش‌سفارش: {formatTime(o.scheduledFor)}</p>}
              <ul className="my-3 flex-1 space-y-1.5 text-base">{o.items.map((i) => <li key={i.id} className="flex gap-2"><b className="text-amber-300">{toFa(i.quantity)}×</b>{i.name}</li>)}</ul>
              {o.note && <p className="mb-2 rounded-lg bg-amber-500/20 px-2 py-1.5 text-xs text-amber-200">{<EmojiIcon emoji="" />} {o.note}</p>}
              <button onClick={() => move(o)} className="rounded-xl bg-white py-3 text-sm font-extrabold text-stone-900 active:scale-95">{NEXT[o.status][1]}</button>
            </div>
          ))}
        </div>
      )}</IconText>
    </div>
  );
}
