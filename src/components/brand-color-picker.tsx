"use client";

import { BRAND_COLOR_PRESETS } from "@/lib/brand-color";
import { cn } from "@/components/ui";

export function BrandColorPicker({
  value,
  onChange,
  disabled = false,
  label = "رنگ سازمانی",
  description,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="text-sm font-bold text-base-content">{label}</legend>
      {description && <p className="text-xs leading-6 text-base-content/60">{description}</p>}
      <div className="flex flex-wrap items-center gap-2.5">
        {BRAND_COLOR_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`انتخاب رنگ ${color}`}
            aria-pressed={value.toLowerCase() === color}
            onClick={() => onChange(color)}
            style={{ backgroundColor: color }}
            className={cn(
              "size-9 rounded-full border border-black/10 transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
              value.toLowerCase() === color ? "ring-2 ring-primary ring-offset-2" : "",
            )}
          />
        ))}
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3 text-xs font-semibold text-base-content transition hover:border-primary/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
          <input
            aria-label="انتخاب رنگ سفارشی"
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value.toLowerCase())}
            className="size-6 cursor-pointer rounded-md border-0 bg-transparent p-0 disabled:cursor-not-allowed"
          />
          رنگ دلخواه
        </label>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-base-300 bg-base-200/60 p-3">
        <span className="size-8 rounded-lg shadow-sm" style={{ backgroundColor: value }} aria-hidden="true" />
        <span className="text-xs text-base-content/65">پیش‌نمایش رنگ</span>
        <code dir="ltr" className="ms-auto rounded-md bg-base-100 px-2 py-1 text-xs font-bold uppercase text-base-content/75">{value}</code>
      </div>
    </fieldset>
  );
}
