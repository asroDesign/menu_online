"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { MembershipTierRule } from "@/lib/membership-core";
import { Badge, Button, Card, Field, Icon, Input, Modal, Switch, useToast } from "@/components/ui";

type EditableTier = Omit<MembershipTierRule, "minSpent" | "minOrders" | "validityDays" | "discountPercent" | "maxDiscount"> & {
  minSpent: string; minOrders: string; validityDays: string; discountPercent: string; maxDiscount: string;
};
type BusinessSettings = { item: { settings: { membershipTiers?: MembershipTierRule[] } } };
const digits = (value: string) => value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,\s]/g, "");
const editTier = (tier: MembershipTierRule): EditableTier => ({
  ...tier,
  minSpent: String(tier.minSpent), minOrders: String(tier.minOrders), validityDays: String(tier.validityDays),
  discountPercent: String(tier.discountPercent), maxDiscount: String(tier.maxDiscount),
});

export function MembershipTierManager() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState<EditableTier[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || tiers !== null) return;
    let live = true;
    api<BusinessSettings>("/api/business").then((result) => {
      if (live) setTiers((result.item.settings.membershipTiers ?? []).map(editTier));
    }).catch((error) => {
      if (live) { toast((error as Error).message, "error"); setOpen(false); }
    });
    return () => { live = false; };
  }, [open, tiers, toast]);

  function update(index: number, patch: Partial<EditableTier>) {
    setTiers((current) => current?.map((tier, i) => i === index ? { ...tier, ...patch } : tier) ?? current);
  }

  function addTier() {
    if ((tiers?.length ?? 0) >= 10) return toast("حداکثر ۱۰ سطح عضویت قابل تعریف است", "error");
    setTiers((current) => [...(current ?? []), { id: crypto.randomUUID(), name: "سطح جدید", minSpent: "0", minOrders: "1", validityDays: "365", discountPercent: "5", maxDiscount: "0", isActive: true }]);
  }

  function move(index: number, delta: -1 | 1) {
    setTiers((current) => {
      if (!current) return current;
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function save() {
    if (!tiers) return;
    setSaving(true);
    try {
      const payload = tiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        minSpent: Number(digits(tier.minSpent)),
        minOrders: Number(digits(tier.minOrders)),
        validityDays: Number(digits(tier.validityDays)),
        discountPercent: Number(digits(tier.discountPercent)),
        maxDiscount: Number(digits(tier.maxDiscount)),
        isActive: tier.isActive,
      }));
      await api("/api/business", { method: "PATCH", body: { settings: { membershipTiers: payload } } });
      setTiers(payload.map((tier) => editTier(tier)));
      toast("سطوح عضویت ذخیره شد");
      setOpen(false);
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setSaving(false); }
  }

  return <>
    <Button id="membership-tiers" size="sm" variant="secondary" onClick={() => { setTiers(null); setOpen(true); }}><Icon name="award" className="size-4" /> مدیریت سطح‌های عضویت</Button>
    <Modal open={open} onClose={() => setOpen(false)} title="سطح‌های عضویت مشتریان" size="xl" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>بستن</Button><Button onClick={() => void save()} loading={saving} disabled={!tiers}>ذخیره تغییرات</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-50 p-3 text-xs leading-6 text-brand-900">ترتیب از بالا به پایین است و اولین سطح واجد شرایط اعمال می‌شود. شرایط در بازهٔ شناور هر سطح و فقط بر اساس سفارش‌های پرداخت‌شده محاسبه می‌شود. تخفیف عضویت با کد تخفیف یا تخفیف دستی جمع نمی‌شود و فقط کارمند صندوق می‌تواند آن را تأیید کند.</div>
        {tiers === null ? <div className="h-24 animate-pulse rounded-xl bg-stone-100" /> : tiers.length === 0 ? <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">هنوز سطحی تعریف نشده است.</p> : tiers.map((tier, index) => <Card key={tier.id} className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-sm font-black text-brand-700">{index + 1}</span>
            <Input className="min-w-40 flex-1 font-bold" aria-label="نام سطح عضویت" value={tier.name} onChange={(event) => update(index, { name: event.target.value })} maxLength={50} />
            {tier.isActive ? <Badge color="emerald">فعال</Badge> : <Badge>غیرفعال</Badge>}
            <Switch checked={tier.isActive} onChange={(isActive) => update(index, { isActive })} label="فعال" />
            <Button type="button" size="sm" variant="ghost" disabled={index === 0} aria-label="اولویت بالاتر" onClick={() => move(index, -1)}><Icon name="chevron-up" className="size-4" /></Button>
            <Button type="button" size="sm" variant="ghost" disabled={index === tiers.length - 1} aria-label="اولویت پایین‌تر" onClick={() => move(index, 1)}><Icon name="chevron-down" className="size-4" /></Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setTiers((current) => current?.filter((_, i) => i !== index) ?? null)}><Icon name="trash" className="size-4 text-rose-600" /> حذف</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="حداقل خرید پرداخت‌شده (تومان)" hint="۰ یعنی این شرط استفاده نشود."><Input inputMode="numeric" dir="ltr" value={tier.minSpent} onChange={(event) => update(index, { minSpent: event.target.value })} /></Field>
            <Field label="حداقل تعداد خرید" hint="۰ یعنی این شرط استفاده نشود."><Input inputMode="numeric" dir="ltr" value={tier.minOrders} onChange={(event) => update(index, { minOrders: event.target.value })} /></Field>
            <Field label="بازهٔ محاسبه و اعتبار (روز)"><Input inputMode="numeric" dir="ltr" value={tier.validityDays} onChange={(event) => update(index, { validityDays: event.target.value })} /></Field>
            <Field label="درصد تخفیف عضویت"><Input inputMode="numeric" dir="ltr" value={tier.discountPercent} onChange={(event) => update(index, { discountPercent: event.target.value })} /></Field>
            <Field label="سقف تخفیف (تومان)" hint="۰ یعنی بدون سقف جدا از مبلغ سفارش."><Input inputMode="numeric" dir="ltr" value={tier.maxDiscount} onChange={(event) => update(index, { maxDiscount: event.target.value })} /></Field>
          </div>
          <p className="text-[11px] leading-5 text-stone-500">مزیت روی جمع اقلام اعمال می‌شود؛ مالیات و خدمات پس از تخفیف محاسبه می‌شوند. سطح واجد شرایط در لحظهٔ ثبت سفارش دوباره در سرور بررسی و جزئیاتش روی همان سفارش ثبت می‌شود.</p>
        </Card>)}
        <Button type="button" variant="secondary" disabled={!tiers || tiers.length >= 10} onClick={addTier}><Icon name="plus" className="size-4" /> افزودن سطح</Button>
      </div>
    </Modal>
  </>;
}
