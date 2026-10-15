"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Card, cn } from "@/components/ui";
import type { AdminPerm } from "@/lib/admin-meta";

export type Me = { id: number; name: string; email: string; dept: string; perms: AdminPerm[]; businessId: number };
export type Nav = (tab: string, params?: Record<string, string>) => void;

/** GET helper with reload */
export function useGet<T = any>(url: string | null, poll?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (silent = false) => {
    if (!url) return;
    if (!silent) setLoading(true);
    try { setData(await api<T>(url)); setError(""); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [url]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); if (!poll) return; const t = setInterval(() => !document.hidden && load(true), poll); return () => clearInterval(t); }, [load, poll]);
  return { data, error, loading, reload: load, setData };
}

export const Stat = ({ label, value, sub, tone = "text-stone-900", icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; icon?: string }) => (
  <Card className="p-4">
    <div className="flex items-start justify-between"><p className="text-xs font-semibold text-stone-500">{label}</p>{icon && <span className="text-xl">{icon}</span>}</div>
    <p className={cn("mt-2 text-2xl font-extrabold tracking-tight", tone)}>{value}</p>
    {sub && <p className="mt-1 text-xs text-stone-500">{sub}</p>}
  </Card>
);

export function Bars({ data, color = "bg-brand-400", fmt }: { data: { label: string; value: number }[]; color?: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-40 items-end gap-1">
      {data.map((d, i) => (
        <div key={i} title={`${d.label}: ${fmt ? fmt(d.value) : d.value}`} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <div className={cn("w-full max-w-7 rounded-t-md transition-all", color)} style={{ height: `${Math.max(d.value ? 4 : 1, (d.value / max) * 82)}%` }} />
          <span className="text-[9px] text-stone-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export const PLAN_COLOR: Record<string, string> = { basic: "stone", premium: "brand", premium_plus: "violet" };
export const METHOD: Record<string, string> = { transfer: "کارت‌به‌کارت / حواله", card: "کارت‌خوان", cash: "نقد", online: "پرداخت آنلاین", other: "سایر" };
