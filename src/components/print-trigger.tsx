"use client";

export function PrintTrigger({ label = "چاپ" }: { label?: string }) {
  return <button type="button" className="no-print rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-900" onClick={() => window.print()}>{label}</button>;
}
