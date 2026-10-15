"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, Input, useToast } from "@/components/ui";

/** Small card that edits one key of business.settings. */
export function SettingCard({ title, desc, k, suffix, type = "number", placeholder }: { title: string; desc?: string; k: string; suffix?: string; type?: "number" | "text"; placeholder?: string }) {
  const toast = useToast();
  const [val, setVal] = useState("");
  const [orig, setOrig] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ item: { settings: Record<string, unknown> } }>("/api/business").then((r) => {
      const v = String(r.item.settings?.[k] ?? "");
      setVal(v);
      setOrig(v);
    });
  }, [k]);
  async function save() {
    setBusy(true);
    try {
      await api("/api/business", { method: "PATCH", body: { settings: { [k]: type === "number" ? Number(val) : val } } });
      setOrig(val);
      toast("تنظیمات ذخیره شد");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="mb-5 flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-48 flex-1">
        <p className="text-sm font-bold">{title}</p>
        {desc && <p className="mt-0.5 text-xs leading-6 text-stone-500">{desc}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Input className="w-40" inputMode={type === "number" ? "numeric" : undefined} dir={type === "text" ? "ltr" : undefined} value={val} placeholder={placeholder} onChange={(e) => setVal(e.target.value)} />
        {suffix && <span className="text-xs text-stone-500">{suffix}</span>}
        <Button size="sm" onClick={save} loading={busy} disabled={val === orig}>ذخیره</Button>
      </div>
    </Card>
  );
}
