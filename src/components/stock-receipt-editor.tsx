"use client";

import { useRef, useState } from "react";
import { api, useCollection } from "@/lib/api";
import { formatPrice, toFa } from "@/lib/format";
import { useFeatures } from "@/components/features";
import { WASTE_REASONS } from "@/lib/stock-waste";
import { AmountInput, Button, Field, Icon, IconButton, Input, Modal, PersianDateInput, Select, ErrorState, Switch, useToast } from "@/components/ui";
import styles from "./stock-receipt-editor.module.css";

type Item = { id: number; name: string; unit: string; stock: number; costPerUnit: number; warehouseId: number | null; trackStock?: boolean; isActive?: boolean };
type Warehouse = { id: number; name: string };
type Supplier = { id: number; name: string; isActive: boolean };
export type SavedReceipt = { id: number; total: number; documentId: number | null; type: string; date?: string };
type Row = { key: string; itemId: string; quantity: string; unitCost: string; name: string; unit: string; warehouseId: string; minStock: string; categoryId: string; trackStock: boolean };
const newRow = (item?: Item): Row => ({ key: crypto.randomUUID(), itemId: item ? String(item.id) : "", quantity: "", unitCost: item ? String(item.costPerUnit) : "", name: "", unit: item?.unit ?? "عدد", warehouseId: item?.warehouseId ? String(item.warehouseId) : "", minStock: "0", categoryId: "", trackStock: item?.trackStock ?? true });
const number = (s: string) => Number(s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,\s]/g, "").replace(/٫/g, "."));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
const units = ["عدد", "کیلوگرم", "گرم", "لیتر", "بسته", "کارتن", "متر"];

export function StockReceiptEditor({ onClose, onSaved, initialType, initialItem, fixedType }: { onClose: () => void; onSaved: (receipt: SavedReceipt) => void; initialType?: string; initialItem?: Item; fixedType?: "waste" }) {
  const items = useCollection<Item>("/api/r/items");
  const warehouses = useCollection<Warehouse>("/api/r/warehouses");
  const categories = useCollection<{ id: number; name: string }>("/api/r/inventory-categories");
  const suppliers = useCollection<Supplier>("/api/r/suppliers");
  const { has } = useFeatures();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(() => [newRow(initialItem)]);
  const [type, setType] = useState(fixedType ?? initialType ?? "in");
  const [wasteReason, setWasteReason] = useState<(typeof WASTE_REASONS)[number]["key"]>("spoilage");
  const [date, setDate] = useState(today);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [payFrom, setPayFrom] = useState("cash");
  const [paid, setPaid] = useState("");
  const [discount, setDiscount] = useState("0");
  const [extraCost, setExtraCost] = useState("0");
  const [shippingCost, setShippingCost] = useState("0");
  const [taxAmount, setTaxAmount] = useState("0");
  const [invoiceTotal, setInvoiceTotal] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newSupplier, setNewSupplier] = useState<string | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const submitting = useRef(false);
  const request = useRef({ fingerprint: "", key: "" });
  const purchase = type === "in";
  const update = (key: string, patch: Partial<Row>) => setRows((list) => list.map((row) => row.key === key ? { ...row, ...patch } : row));
  const subtotal = rows.reduce((sum, row) => sum + Math.round((number(row.quantity) || 0) * (number(row.unitCost) || 0)), 0);
  const total = subtotal - (number(discount) || 0) + (number(extraCost) || 0) + (number(shippingCost) || 0) + (number(taxAmount) || 0);
  const paidAmount = payFrom === "payable" ? 0 : paid === "" ? total : number(paid);
  const mismatch = invoiceTotal !== "" && number(invoiceTotal) !== total;
  const wasteValue = rows.reduce((sum, row) => {
    const item = items.items.find((candidate) => String(candidate.id) === row.itemId);
    return sum + Math.round(Math.abs(number(row.quantity) || 0) * (item?.costPerUnit ?? 0));
  }, 0);

  async function submit() {
    if (submitting.current) return;
    setError("");
    if (!date) { setError("تاریخ ثبت را انتخاب کنید"); return; }
    if (rows.some((r) => !r.itemId || r.quantity.trim() === "" || (purchase && r.unitCost.trim() === ""))) { setError("کالا، مقدار و قیمت خرید تمام ردیف‌ها را تکمیل کنید"); return; }
    if (purchase && (!invoiceTotal.trim() || mismatch)) { setError("جمع مبلغ فاکتور را وارد کنید؛ باید با جمع محاسبه‌شده برابر باشد"); return; }
    const body = {
      type, date: `${date}T12:00:00+03:30`, note,
      ...(type === "waste" ? { wasteReason } : {}),
      ...(purchase ? { invoiceNo, supplierId: supplierId ? Number(supplierId) : undefined, payFrom, discount: number(discount), extraCost: number(extraCost), shippingCost: number(shippingCost), taxAmount: number(taxAmount), total: number(invoiceTotal), paidAmount } : {}),
          lines: rows.map((r) => ({ ...(r.itemId === "new" ? { newItem: { name: r.name, unit: r.unit, warehouseId: r.warehouseId ? Number(r.warehouseId) : null, minStock: number(r.minStock), categoryId: r.categoryId ? Number(r.categoryId) : null, trackStock: r.trackStock } } : { itemId: Number(r.itemId) }), quantity: number(r.quantity), ...(purchase ? { unitCost: number(r.unitCost) } : {}) })),
    };
    const fingerprint = JSON.stringify(body);
    if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    submitting.current = true; setBusy(true);
    try {
      const result = await api<{ receipt: SavedReceipt }>(fixedType === "waste" ? "/api/r/waste" : "/api/r/stock", { method: "POST", body: { ...body, requestKey: request.current.key } });
      toast(type === "waste" ? "ضایعات، کاهش موجودی و سند هزینه ثبت شدند" : result.receipt.documentId ? "فاکتور، موجودی و سند حسابداری با موفقیت ثبت شدند" : "گردش انبار ثبت شد؛ این گردش ارزش مالی ندارد");
      onSaved(result.receipt);
    } catch (e) { setError((e as Error).message); } finally { submitting.current = false; setBusy(false); }
  }

  const modalTitle = type === "waste" ? "ثبت ضایعات انبار" : purchase ? "ثبت فاکتور خرید انبار" : "ثبت گردش انبار";
  return <Modal open onClose={() => !submitting.current && onClose()} title={modalTitle} size="xl" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>انصراف</Button><Button loading={busy} disabled={busy || items.loading || !!items.error || mismatch || savingSupplier} onClick={submit}><Icon name="check" className="size-4" />{type === "waste" ? "ثبت ضایعات و سند هزینه" : purchase ? "ثبت فاکتور و سند حسابداری" : "ثبت گردش و سند حسابداری"}</Button></>}>
    <fieldset disabled={busy} className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.intro}><span className={styles.emblem}><Icon name={type === "waste" ? "warning" : "box"} className="size-6" /></span><div><h3>{type === "waste" ? "ثبت چند قلم ضایعات" : "یک فاکتور، چندین قلم کالا"}</h3><p>{type === "waste" ? "ماده، مقدار، دلیل و تاریخ را ثبت کنید؛ موجودی و هزینهٔ ضایعات هم‌زمان به‌روزرسانی می‌شوند." : "اقلام را اضافه کنید؛ موجودی و سند حسابداری هم‌زمان ثبت می‌شوند."}</p></div></div>
        {items.error && <ErrorState message={items.error} onRetry={() => items.reload()} />}
        <div className={styles.fields}>
          {!fixedType && <Field label="نوع گردش"><Select disabled={busy} value={type} onChange={(e) => { setType(e.target.value); setError(""); setRows((rs) => rs.map((r) => r.itemId === "new" ? { ...r, itemId: "" } : r)); }}><option value="in">ورود / خرید</option><option value="out">خروج / مصرف</option><option value="waste">ضایعات</option><option value="adjust">اصلاح موجودی شمارش‌شده</option></Select></Field>}
          <Field label="تاریخ ثبت (شمسی)"><PersianDateInput value={date} onChange={setDate} disabled={busy} /></Field>
          {type === "waste" && <Field label="دلیل ضایعات *"><Select value={wasteReason} onChange={(event) => setWasteReason(event.target.value as typeof wasteReason)}>{WASTE_REASONS.map((reason) => <option key={reason.key} value={reason.key}>{reason.label}</option>)}</Select></Field>}
          {purchase && <><Field label="شماره فاکتور فروشنده"><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} maxLength={40} /></Field><Field label="تأمین‌کننده"><Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">انتخاب فروشنده</option>{suppliers.items.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field></>}
        </div>
        {purchase && <div className={styles.supplier}>
          {suppliers.error && <p role="alert">{suppliers.error}</p>}
          {newSupplier === null ? <Button size="sm" variant="ghost" onClick={() => setNewSupplier("")}><Icon name="plus" className="size-4" />تعریف فروشنده جدید</Button> : <><Input placeholder="نام فروشنده جدید" aria-label="نام فروشنده جدید" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} /><Button size="sm" loading={savingSupplier} disabled={!newSupplier.trim() || savingSupplier} onClick={async () => { setSavingSupplier(true); try { const result = await api<{ item: Supplier }>("/api/r/suppliers", { method: "POST", body: { name: newSupplier } }); suppliers.setItems((list) => [...list, result.item]); setSupplierId(String(result.item.id)); setNewSupplier(null); } catch (e) { toast((e as Error).message, "error"); } finally { setSavingSupplier(false); } }}>ذخیره</Button><IconButton icon="x" label="انصراف از تعریف فروشنده" onClick={() => setNewSupplier(null)} /></>}
        </div>}
        <div className={styles.sectionTitle}><h3>اقلام {purchase ? "فاکتور" : "گردش"}</h3><span>{toFa(rows.length)} قلم</span></div>
        <div className={styles.rows}>{rows.map((row, index) => {
          const item = items.items.find((i) => String(i.id) === row.itemId);
          const shortage = item && ["out", "waste"].includes(type) && number(row.quantity) > item.stock;
          return <div key={row.key} className={styles.row}>
            <div className={styles.rowHeading}><b>قلم {toFa(index + 1)}</b>{item && <span>موجودی: {toFa(item.stock)} {item.unit} · {warehouses.items.find((w) => w.id === item.warehouseId)?.name ?? "بدون انبار"}{item.trackStock === false ? " · ردیابی مصرف فروش خاموش" : ""}</span>}<IconButton icon="trash" label={`حذف قلم ${toFa(index + 1)}`} disabled={rows.length === 1 || busy} onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))} /></div>
            <Field label="کالا / ماده اولیه"><Select value={row.itemId} onChange={(e) => { const i = items.items.find((i) => String(i.id) === e.target.value); update(row.key, { itemId: e.target.value, unitCost: i ? String(i.costPerUnit) : "" }); }}><option value="">انتخاب کالا</option>{purchase && has("inventory") && <option value="new">+ تعریف کالای جدید در همین فاکتور</option>}{items.items.filter((i) => i.isActive !== false || row.itemId === String(i.id)).map((i) => <option disabled={rows.some((r) => r.key !== row.key && r.itemId === String(i.id))} key={i.id} value={i.id}>{i.name} — {i.unit}{i.warehouseId ? ` (${warehouses.items.find((w) => w.id === i.warehouseId)?.name ?? "انبار"})` : ""}{i.isActive === false ? " · غیرفعال" : ""}</option>)}</Select></Field>
            {row.itemId === "new" && <div className={styles.newItem}><p>کالا همراه با فاکتور تعریف می‌شود.</p><div className={styles.fields}><Field label="نام کالا"><Input value={row.name} onChange={(e) => update(row.key, { name: e.target.value })} maxLength={80} /></Field><Field label="واحد"><Select value={row.unit} onChange={(e) => update(row.key, { unit: e.target.value })}>{units.map((u) => <option key={u}>{u}</option>)}</Select></Field><Field label="انبار"><Select value={row.warehouseId} onChange={(e) => update(row.key, { warehouseId: e.target.value })}><option value="">بدون انبار</option>{warehouses.items.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field><Field label="دسته‌بندی"><Select value={row.categoryId} onChange={(e) => update(row.key, { categoryId: e.target.value })}><option value="">بدون دسته‌بندی</option>{categories.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field><Field label="حداقل موجودی / هشدار"><Input inputMode="decimal" value={row.minStock} onChange={(e) => update(row.key, { minStock: e.target.value })} /></Field></div><label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm"><span>ردیابی خودکار موجودی هنگام فروش</span><Switch checked={row.trackStock} onChange={(value) => update(row.key, { trackStock: value })} label="ردیابی موجودی برای کالای تازه" /></label></div>}
            <div className={styles.amounts}><Field label={`${type === "adjust" ? "موجودی شمارش‌شده" : "مقدار"} (${item?.unit ?? row.unit})`}><Input inputMode="decimal" value={row.quantity} onChange={(e) => update(row.key, { quantity: e.target.value })} /></Field>{purchase && <><Field label="قیمت واحد (تومان)"><AmountInput value={row.unitCost} onValueChange={(unitCost) => update(row.key, { unitCost })} /></Field><div className={styles.lineTotal}><span>مبلغ ردیف</span><strong>{formatPrice(Math.round((number(row.quantity) || 0) * (number(row.unitCost) || 0)))}</strong></div></>}</div>
            {shortage && <p className={styles.error}>مقدار خروج بیشتر از موجودی این کالا است.</p>}
          </div>;
        })}</div>
        <Button variant="secondary" disabled={busy || rows.length >= 100} onClick={() => setRows((rs) => [...rs, newRow()])}><Icon name="plus" className="size-4" />افزودن قلم دیگر</Button>
        <Field label={type === "waste" ? "شرح تکمیلی (اختیاری)" : "توضیحات"}><Input placeholder={type === "waste" ? "مثلاً مقدار دورریز هر شیفت یا توضیح بیشتر…" : "شرح خرید، علت خروج یا اصلاح موجودی…"} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
      </div>
      <aside className={styles.summary}>
        <h3><Icon name="file" className="size-5" />{purchase ? "خلاصه فاکتور" : type === "waste" ? "ارزش ضایعات" : "ثبت موجودی"}</h3>
        {purchase ? <><dl><div><dt>جمع اقلام</dt><dd>{formatPrice(subtotal)}</dd></div></dl><Field label="تخفیف کل (تومان)"><AmountInput value={discount} onValueChange={setDiscount} /></Field><Field label="سایر هزینه‌های جانبی (تومان)"><AmountInput value={extraCost} onValueChange={setExtraCost} /></Field><Field label="هزینه ارسال (تومان)"><AmountInput value={shippingCost} onValueChange={setShippingCost} /></Field><Field label="مبلغ مالیات فاکتور (تومان)"><AmountInput value={taxAmount} onValueChange={setTaxAmount} /></Field><p className={styles.hint}>تخفیف، ارسال، هزینه جانبی و مالیات به نسبت مبلغ اقلام در بهای موجودی محاسبه می‌شوند. مالیات این فرم به‌عنوان اعتبار مالیاتی قابل استرداد ثبت نمی‌شود.</p><div className={styles.total}><span>جمع نهایی محاسبه‌شده</span><strong>{formatPrice(total)}</strong></div><Field label="جمع مبلغ درج‌شده در فاکتور (تومان)"><AmountInput value={invoiceTotal} onValueChange={setInvoiceTotal} placeholder="مبلغ فاکتور را وارد کنید" aria-invalid={mismatch} /></Field>{mismatch && <p className={styles.error}>اختلاف با جمع اقلام: {formatPrice(Math.abs(number(invoiceTotal) - total))}</p>}<Field label="روش پرداخت"><Select value={payFrom} onChange={(e) => { setPayFrom(e.target.value); setPaid(""); }}><option value="cash">صندوق / نقدی</option><option value="bank">بانک</option><option value="payable">تماماً نسیه</option></Select></Field>{payFrom !== "payable" && <Field label="مبلغ پرداخت‌شده (تومان)" hint="خالی = تسویه کامل؛ برای پرداخت جزئی مبلغ را وارد کنید"><AmountInput value={paid} onValueChange={setPaid} placeholder={String(Math.max(0, total))} /></Field>}<dl><div><dt>بدهی به فروشنده</dt><dd>{formatPrice(Math.max(0, total - paidAmount))}</dd></div></dl>{total > paidAmount && !supplierId && <p className={styles.error}>برای ثبت بدهی، فروشنده را انتخاب کنید.</p>}</> : type === "waste" ? <div className={styles.hint}><p>ارزش براساس بهای فعلی هر قلم محاسبه می‌شود.</p><div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-rose-50 p-3 text-rose-900"><span>ارزش تقریبی ضایعات</span><b>{formatPrice(wasteValue)}</b></div><p className="mt-2">ثبت نهایی موجودی را کم و هزینهٔ ضایعات را در سند حسابداری ثبت می‌کند.</p></div> : <p className={styles.hint}>{type === "adjust" ? "موجودی واقعی شمارش‌شده را وارد کنید؛ اختلاف با موجودی سیستم ثبت می‌شود." : "خروج از موجودی کم می‌شود و ارزش آن با بهای فعلی کالا در حسابداری ثبت خواهد شد."}</p>}
        <p className={styles.accounting}><Icon name="book" className="size-4" />یک سند حسابداری برای تمام اقلام صادر می‌شود. در صورت خطا، هیچ موجودی تغییر نمی‌کند.</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </aside>
    </fieldset>
  </Modal>;
}
