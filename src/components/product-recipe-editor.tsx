"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api, useCollection } from "@/lib/api";
import { useFeatures } from "@/components/features";
import { Badge, Button, Card, Field, Icon, Input, Modal, Select, Skeleton, useToast } from "@/components/ui";
import { formatPrice, toFa } from "@/lib/format";
import { calculateTargetPrice, currentRecipeMaterialCost, type PriceTargetType } from "@/lib/price-target-core";

type InventoryItem = { id: number; name: string; unit: string; recipeUnit?: string; recipeToStockFactor?: number; costPerUnit: number; lastPurchaseCost?: number; isActive?: boolean };
type RecipeLine = { id: number; productId: number; itemId: number; quantity: number; wastePercent: number };
type Draft = { itemId: string; quantity: string; wastePercent: string };

const digits = (value: string) => value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[٬,\s]/g, "").replace("٫", ".");

/** Shared recipe editor used by product editing and smart-pricing material details. */
export function ProductRecipeEditor({ productId, productName, sellingMode, yieldRatio = 1, onChanged, onApplySuggestedPrice }: {
  productId: number;
  productName: string;
  sellingMode?: string;
  yieldRatio?: number;
  onChanged?: () => void;
  onApplySuggestedPrice?: (price: number) => void;
}) {
  const features = useFeatures();
  const canEdit = features.has("recipes") && (features.isManager || features.role === "warehouse");
  const recipes = useCollection<RecipeLine>("/api/r/recipes");
  const inventory = useCollection<InventoryItem>("/api/r/items");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [newItemId, setNewItemId] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [busyId, setBusyId] = useState<number | "new" | null>(null);
  const [targetType, setTargetType] = useState<PriceTargetType>("gross_margin");
  const [targetPercent, setTargetPercent] = useState("30");
  const [error, setError] = useState("");
  const lines = useMemo(() => recipes.items.filter((line) => line.productId === productId), [recipes.items, productId]);
  const availableItems = inventory.items.filter((item) => item.isActive !== false);
  const eligibleItems = availableItems.filter((item) => !lines.some((line) => line.itemId === item.id));
  const totalCost = lines.reduce((sum, line) => {
    const item = inventory.items.find((entry) => entry.id === line.itemId);
    if (!item) return sum;
    const basis = currentRecipeMaterialCost(item.lastPurchaseCost, item.costPerUnit).costPerUnit;
    const factor = item.recipeToStockFactor ?? 1;
    return sum + line.quantity * factor * (1 + (line.wastePercent ?? 0) / 100) * basis;
  }, 0) / (sellingMode === "weight" && yieldRatio > 0 ? yieldRatio : 1);
  let suggestedPrice: number | null = null;
  try {
    const target = Number(digits(targetPercent));
    if (lines.length && totalCost > 0) suggestedPrice = calculateTargetPrice(totalCost, target, targetType);
  } catch { suggestedPrice = null; }

  async function saveLine(line: RecipeLine) {
    const draft = drafts[line.id];
    if (!draft) return;
    const quantity = Number(digits(draft.quantity));
    const wastePercent = Number(digits(draft.wastePercent));
    if (!draft.itemId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent > 99.9) {
      setError("ماده، مقدار مصرف و درصد ضایعات را بررسی کنید.");
      return;
    }
    if (lines.some((other) => other.id !== line.id && other.itemId === Number(draft.itemId))) {
      setError("هر مادهٔ اولیه را فقط یک بار می‌توان به دستور تهیه افزود.");
      return;
    }
    setBusyId(line.id); setError("");
    try {
      await recipes.update(line.id, { productId, itemId: Number(draft.itemId), quantity, wastePercent });
      setDrafts((all) => { const next = { ...all }; delete next[line.id]; return next; });
      await recipes.reload(true); onChanged?.();
      toast("دستور تهیه به‌روزرسانی شد");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusyId(null); }
  }

  async function addLine() {
    const itemId = Number(newItemId || eligibleItems[0]?.id);
    const quantity = Number(digits(newQuantity));
    if (!itemId || !Number.isFinite(quantity) || quantity <= 0) { setError("یک ماده و مقدار مصرف معتبر انتخاب کنید."); return; }
    setBusyId("new"); setError("");
    try {
      await recipes.create({ productId, itemId, quantity, wastePercent: 0 }, { productId, itemId, quantity, wastePercent: 0 });
      setNewItemId(""); setNewQuantity(""); await recipes.reload(true); onChanged?.();
      toast("ماده به دستور تهیه افزوده شد");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusyId(null); }
  }

  async function removeLine(line: RecipeLine) {
    setBusyId(line.id); setError("");
    try { await recipes.remove(line.id); await recipes.reload(true); onChanged?.(); toast("ماده از دستور تهیه حذف شد"); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusyId(null); }
  }

  return <section className="space-y-3 rounded-2xl border border-base-300 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-bold">دستور تهیه و بهای مواد</h3><p className="mt-1 text-xs leading-5 text-base-content/55">رسپی از مواد اولیهٔ همین محصول می‌آید؛ هزینهٔ هر ماده از آخرین خرید و در نبود آن از میانگین موجودی انبار محاسبه می‌شود.</p></div>
      <div className="flex flex-wrap items-center gap-2"><Badge>{toFa(lines.length)} ماده</Badge>{features.isManager && <Link className="btn btn-ghost btn-sm" href={`/dashboard/products/create?edit=${productId}`}><Icon name="edit" className="size-4" />ویرایش کامل محصول</Link>}<Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Icon name="edit" className="size-4" />{canEdit ? "ویرایش مواد" : "نمایش مواد"}</Button></div>
    </div>
      <div className="grid gap-3 rounded-xl bg-base-200/50 p-3 sm:grid-cols-[1fr_1fr]">
        <div className="flex items-center justify-between gap-2 text-sm"><span className="text-base-content/60">بهای مواد برای هر واحد</span><b>{lines.length ? formatPrice(Math.round(totalCost)) : "هنوز دستور تهیه ثبت نشده"}</b></div>
        <div className="grid gap-2 sm:grid-cols-[1fr_7rem]"><Field label="مبنای قیمت هدف"><Select value={targetType} onChange={(event) => setTargetType(event.target.value as PriceTargetType)}><option value="gross_margin">حاشیه سود ناخالص</option><option value="food_cost">درصد مواد از قیمت</option></Select></Field><Field label="هدف ٪"><Input type="number" min="1" max="99" value={targetPercent} onChange={(event) => setTargetPercent(event.target.value)} /></Field></div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm sm:col-span-2"><span className="text-base-content/60">قیمت پیشنهادی بر پایهٔ مواد فعلی</span><div className="flex items-center gap-2"><b className="text-primary">{suggestedPrice === null ? "—" : formatPrice(suggestedPrice)}</b>{canEdit && suggestedPrice !== null && onApplySuggestedPrice && <Button size="sm" variant="secondary" onClick={() => onApplySuggestedPrice(suggestedPrice!)}>استفاده در قیمت محصول</Button>}</div></div>
        <p className="text-[11px] leading-5 text-base-content/50 sm:col-span-2">این پیشنهاد هزینهٔ دستور تهیه، ضایعات و بازده محصول وزنی را لحاظ می‌کند؛ قیمت فروش فقط پس از ذخیرهٔ تغییرات محصول عوض می‌شود.</p>
      </div>
    <Modal open={open} onClose={() => setOpen(false)} title={`مواد اولیه · ${productName}`} size="xl" footer={<Button variant="secondary" onClick={() => setOpen(false)}>بستن</Button>}>
      {error && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {recipes.error || inventory.error ? <div className="space-y-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><p>{recipes.error ?? inventory.error}</p><Button size="sm" variant="secondary" onClick={() => { void recipes.reload(); void inventory.reload(); }}>تلاش دوباره</Button></div> : recipes.loading || inventory.loading ? <Skeleton className="h-36 rounded-xl" /> : <div className="space-y-3">
        {lines.length === 0 && <p className="rounded-xl border border-dashed border-base-300 p-5 text-center text-sm text-base-content/55">برای این محصول هنوز ماده‌ای ثبت نشده است.</p>}
        {lines.map((line) => {
          const item = inventory.items.find((entry) => entry.id === line.itemId);
          const draft = drafts[line.id] ?? { itemId: String(line.itemId), quantity: String(line.quantity), wastePercent: String(line.wastePercent ?? 0) };
          const selectedItem = inventory.items.find((entry) => entry.id === Number(draft.itemId)) ?? item;
          const basis = selectedItem ? currentRecipeMaterialCost(selectedItem.lastPurchaseCost, selectedItem.costPerUnit) : null;
          const quantity = Number(digits(draft.quantity));
          const wastePercent = Number(digits(draft.wastePercent));
          const contribution = selectedItem && basis && Number.isFinite(quantity) && Number.isFinite(wastePercent) ? quantity * (selectedItem.recipeToStockFactor ?? 1) * (1 + wastePercent / 100) * basis.costPerUnit : 0;
          return <Card key={line.id} className="space-y-3 p-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_8rem]">
              <Field label="ماده اولیه"><Select disabled={!canEdit} value={draft.itemId} onChange={(event) => setDrafts((all) => ({ ...all, [line.id]: { ...draft, itemId: event.target.value } }))}><option value="">انتخاب ماده</option>{inventory.items.filter((entry) => (entry.isActive !== false || entry.id === line.itemId || entry.id === Number(draft.itemId)) && !lines.some((other) => other.id !== line.id && other.itemId === entry.id)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.isActive === false ? " · غیرفعال" : ""}</option>)}</Select></Field>
              <Field label={`مصرف هر واحد (${selectedItem?.recipeUnit ?? selectedItem?.unit ?? "—"})`}><Input disabled={!canEdit} inputMode="decimal" value={draft.quantity} onChange={(event) => setDrafts((all) => ({ ...all, [line.id]: { ...draft, quantity: event.target.value } }))} /></Field>
              <Field label="ضایعات ٪"><Input disabled={!canEdit} type="number" min="0" max="99.9" step="0.1" value={draft.wastePercent} onChange={(event) => setDrafts((all) => ({ ...all, [line.id]: { ...draft, wastePercent: event.target.value } }))} /></Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-base-content/60">
              {selectedItem && basis ? <span>مصرف: {Number.isFinite(quantity) ? toFa(quantity) : "—"} {selectedItem.recipeUnit ?? selectedItem.unit} = {Number.isFinite(quantity) ? toFa(quantity * (selectedItem.recipeToStockFactor ?? 1)) : "—"} {selectedItem.unit} · بهای مبنا: {formatPrice(basis.costPerUnit)} / {selectedItem.unit} · {basis.costBasis === "last_purchase" ? "آخرین خرید" : "میانگین موجودی"} · سهم: <b className="text-base-content">{formatPrice(Math.round(contribution))}</b></span> : <span>مادهٔ انبار برای این ردیف یافت نشد.</span>}
              {canEdit && <div className="flex gap-1"><Button size="sm" disabled={!drafts[line.id] || busyId !== null} loading={busyId === line.id} onClick={() => void saveLine(line)}>ذخیره</Button><Button size="sm" variant="ghost" className="text-error" disabled={busyId !== null} onClick={() => void removeLine(line)}>حذف</Button></div>}
            </div>
          </Card>;
        })}
        {canEdit && <Card className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
          <Field label="افزودن ماده"><Select value={newItemId || String(eligibleItems[0]?.id ?? "")} onChange={(event) => setNewItemId(event.target.value)}><option value="">انتخاب ماده</option>{eligibleItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.recipeUnit ?? item.unit}</option>)}</Select></Field>
          <Field label="مصرف هر واحد"><Input inputMode="decimal" value={newQuantity} onChange={(event) => setNewQuantity(event.target.value)} placeholder="مثلاً ۰٫۳" /></Field>
          <Button disabled={!eligibleItems.length || busyId !== null} loading={busyId === "new"} onClick={() => void addLine()}><Icon name="plus" className="size-4" />افزودن</Button>
        </Card>}
      </div>}
      {!canEdit && <p className="mt-3 text-xs text-base-content/55">برای ویرایش دستور تهیه، دسترسی انبار و قابلیت دستور تهیه لازم است.</p>}
    </Modal>
  </section>;
}
