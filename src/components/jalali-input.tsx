"use client";

import { useEffect, useState } from "react";
import { endOfDayTehran, fmtJ, parseJ, startOfDayTehran } from "@/lib/jalali";
import { cn } from "@/components/ui";

/** Text input for a Jalali (Shamsi) date: "۱۴۰۵/۰۷/۲۲". Emits an ISO string (or "" when empty/invalid). */
export function JalaliInput({ value, onChange, className, end, placeholder = "۱۴۰۵/۰۱/۰۱" }: { value: string; onChange: (iso: string) => void; className?: string; end?: boolean; placeholder?: string }) {
  const [text, setText] = useState(value ? fmtJ(value) : "");
  const [bad, setBad] = useState(false);
  useEffect(() => {
    const cur = parseJ(text);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the editable draft aligned with parent form changes
    if (value) { if (!cur || fmtJ(cur) !== fmtJ(value)) { setText(fmtJ(value)); setBad(false); } }
    else if (cur) { setText(""); setBad(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <input
        dir="ltr"
        inputMode="numeric"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (!t.trim()) { setBad(false); onChange(""); return; }
          const d = parseJ(t);
          setBad(!d);
          onChange(d ? (end ? endOfDayTehran(d) : startOfDayTehran(d)).toISOString() : "");
        }}
        className={cn("h-10 w-full rounded-xl border-0 bg-white px-3.5 text-center text-sm ring-1 transition focus:ring-2 focus:outline-none", bad ? "ring-rose-400 focus:ring-rose-400" : "ring-stone-200 focus:ring-brand-400", className)}
      />
    </div>
  );
}
