"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button, Input, Modal } from "@/components/ui";
import { formatPrice, toFa } from "@/lib/format";
import { productUnitPrice, type ProductOptionGroup } from "@/lib/product-options";
import { calculateWeightedSale } from "@/lib/weighted-sales";

type Product = { id: number; name: string; price: number; sellingMode?: string; yieldRatio?: number; modifierGroups?: ProductOptionGroup[] };
export type ProductSelection = { optionIds: string[]; weightGrams?: number; tareGrams?: number };

export function ProductOptionPicker({ product, onClose, onConfirm, scaleReadings = [] }: { product: Product; onClose: () => void; onConfirm: (selection: ProductSelection) => void; scaleReadings?: { id: number; name: string; weightGrams: number }[] }) {
  const groups = useMemo(() => (product.modifierGroups ?? []).filter((group) => group.active), [product.modifierGroups]);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [gross, setGross] = useState("");
  const [tare, setTare] = useState("0");
  const selectedIds = groups.flatMap((group) => selected[group.id] ?? []);
  const totalDelta = groups.flatMap((group) => group.options.filter((option) => (selected[group.id] ?? []).includes(option.id))).reduce((sum, option) => sum + option.priceDelta, 0);
  const valid = groups.every((group) => { const count = (selected[group.id] ?? []).length; return count >= group.min && count <= group.max; });
  let unitPrice = product.price;
  try { unitPrice = productUnitPrice(product.price, totalDelta); } catch { /* server remains authoritative */ }
  const number = (value: string) => Number(value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, ""));
  let weighed: ReturnType<typeof calculateWeightedSale> | null = null;
  if (product.sellingMode === "weight" && gross) {
    try { weighed = calculateWeightedSale({ sellingMode: "weight", pricePerUnit: product.price, grossGrams: number(gross), tareGrams: number(tare), yieldRatio: product.yieldRatio ?? 1 }); } catch { /* keep confirm disabled */ }
  }
  const confirm = product.sellingMode === "weight"
    ? !!weighed && valid && groups.length === 0
    : valid;

  function toggle(group: ProductOptionGroup, optionId: string) {
    setSelected((current) => {
      const chosen = current[group.id] ?? [];
      const next = chosen.includes(optionId) ? chosen.filter((id) => id !== optionId) : chosen.length >= group.max ? chosen : [...chosen, optionId];
      return { ...current, [group.id]: next };
    });
  }

  return <Modal open onClose={onClose} title={`${product.sellingMode === "weight" ? "ثبت وزن" : "انتخاب گزینه‌ها"} · ${product.name}`} size="md" footer={<div className="flex w-full items-center justify-between gap-3"><div><span className="block text-xs text-base-content/60">{product.sellingMode === "weight" ? `نرخ هر کیلو · ${weighed ? `${toFa(weighed.netGrams)} گرم خالص` : "وزن را وارد کنید"}` : "قیمت هر عدد"}</span><b>{formatPrice(product.sellingMode === "weight" ? weighed?.lineTotal ?? 0 : unitPrice)}</b></div><Button disabled={!confirm} onClick={() => onConfirm({ optionIds: selectedIds, ...(weighed ? { weightGrams: weighed.grossGrams, tareGrams: weighed.tareGrams } : {}) })}><Check size={16}/> افزودن به سفارش</Button></div>}>
    <div className="space-y-5">
      {product.sellingMode === "weight" && <fieldset className="grid gap-3 rounded-2xl border border-base-300 p-4 sm:grid-cols-2">
        <legend className="px-1 font-extrabold">وزن‌کشی</legend>
        <label className="text-sm font-semibold">وزن ناخالص (گرم)<Input className="mt-1" dir="ltr" inputMode="numeric" value={gross} onChange={(event) => setGross(event.target.value)} placeholder="مثلاً ۴۵۰" /></label>
        <label className="text-sm font-semibold">وزن ظرف (گرم)<Input className="mt-1" dir="ltr" inputMode="numeric" value={tare} onChange={(event) => setTare(event.target.value)} placeholder="۰" /></label>
        {scaleReadings.length > 0 && <div className="space-y-2 sm:col-span-2"><p className="text-xs font-bold">وزن تازه از ترازو؛ برای تأیید روی آن بزنید</p><div className="flex flex-wrap gap-2">{scaleReadings.map((reading) => <button type="button" key={reading.id} onClick={() => setGross(String(reading.weightGrams))} className="rounded-xl border border-base-300 px-3 py-2 text-xs font-semibold hover:border-primary"><span>{reading.name}</span><span className="ms-2" dir="ltr">{toFa(reading.weightGrams)} g</span></button>)}</div></div>}
        <p className="text-xs leading-6 text-base-content/65 sm:col-span-2">مبلغ با وزن خالص و قیمت هر کیلوگرم محاسبه و در سرور دوباره بررسی می‌شود. برای ورود وزن از ترازو، مقدار خوانده‌شده را در وزن ناخالص وارد کنید.</p>
      </fieldset>}
      {groups.map((group) => {
        const chosen = selected[group.id] ?? [];
        return <fieldset key={group.id} className="space-y-2 rounded-2xl border border-base-300 p-4">
          <legend className="px-1 font-extrabold">{group.name} {group.required && <span className="text-error">*</span>}</legend>
          <p className="text-xs text-base-content/60">{group.required ? "اجباری" : "اختیاری"} · {toFa(group.min)} تا {toFa(group.max)} انتخاب</p>
          {group.options.filter((option) => option.active).map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-xl bg-base-200/60 p-3">
            <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={chosen.includes(option.id)} disabled={!chosen.includes(option.id) && chosen.length >= group.max} onChange={() => toggle(group, option.id)} />
            <span className="flex-1 text-sm font-semibold">{option.name}</span><span className="text-sm">{option.priceDelta > 0 ? `+${formatPrice(option.priceDelta)}` : option.priceDelta < 0 ? `−${formatPrice(Math.abs(option.priceDelta))}` : "بدون تغییر مبلغ"}</span>
          </label>)}
          {chosen.length < group.min && <p className="text-xs text-error">حداقل {toFa(group.min)} گزینه لازم است.</p>}
        </fieldset>;
      })}
      {groups.length === 0 && product.sellingMode !== "weight" && <p className="text-sm text-base-content/65">برای این محصول گزینه‌ای تعریف نشده است.</p>}
    </div>
  </Modal>;
}
