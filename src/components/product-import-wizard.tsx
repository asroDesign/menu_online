"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { formatPrice, toFa } from "@/lib/format";
import { Button, Icon, Modal, useToast } from "@/components/ui";

type ImportRow = { externalId: string; category: string; name: string; description: string; priceToman: number; available: boolean; errors: string[]; duplicate: boolean };
type Preview = { id: number; status: string; rows: ImportRow[]; result: { created: number; skipped: number } | null };

const example = "کد,دسته,نام,توضیحات,قیمت تومان,موجود\nDRK-01,نوشیدنی,چای,چای ایرانی,45000,بله\nFOOD-01,غذای اصلی,ساندویچ مرغ,,185000,موجود\n";

function downloadExample() {
  const blob = new Blob(["\uFEFF", example], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "menupeak-menu-template.csv"; a.click(); URL.revokeObjectURL(url);
}

export function ProductImportWizard({ open, onClose, onCommitted }: { open: boolean; onClose: () => void; onCommitted: () => void }) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const errors = preview?.rows.reduce((sum, row) => sum + row.errors.length, 0) ?? 0;

  async function selectFile(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast("حداکثر اندازه فایل ۲ مگابایت است.", "error"); return; }
    if (!file.name.toLowerCase().endsWith(".csv")) { toast("فعلاً فقط فایل CSV پذیرفته می‌شود.", "error"); return; }
    setCsv(await file.text()); setFileName(file.name); setRequestKey(crypto.randomUUID()); setPreview(null);
  }

  async function makePreview() {
    if (!csv || !requestKey) return;
    setBusy(true);
    try {
      const { item } = await api<{ item: Preview }>("/api/menu-import/preview", { method: "POST", body: { csv, requestKey } });
      setPreview(item);
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    try {
      const { item } = await api<{ item: Preview["result"] }>(`/api/menu-import/${preview.id}/commit`, { method: "POST", body: {} });
      setPreview({ ...preview, status: "committed", result: item });
      toast("ورود منو ثبت شد؛ محصولات را برای مشاهده تازه می‌کنیم.");
      onCommitted();
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setBusy(false); }
  }

  function close() { setCsv(""); setFileName(""); setRequestKey(""); setPreview(null); onClose(); }

  return <Modal open={open} onClose={close} title="ورود گروهی منو از CSV" size="lg" footer={<><Button variant="ghost" onClick={close}>بستن</Button>{preview?.status === "committed" ? <Button onClick={close}>پایان</Button> : preview ? <Button disabled={errors > 0 || busy || preview.rows.every((row) => row.duplicate)} loading={busy} onClick={commit}>تأیید و ثبت محصولات</Button> : <Button disabled={!csv || busy} loading={busy} onClick={makePreview}>ساخت پیش‌نمایش</Button>}</>}>
    <div className="space-y-4">
      <div className="rounded-2xl bg-sky-50 p-4 text-sm leading-7 text-sky-950">فایل CSV حداکثر ۲ مگابایت و ۱۰۰۰ ردیف باشد. ستون‌های «نام» و «قیمت تومان» اجباری‌اند. پیش‌نمایش هیچ محصولی را ذخیره نمی‌کند؛ کد کالا تکراری رد می‌شود و نام مشابه به‌تنهایی باعث ادغام نمی‌شود.</div>
      <div className="flex flex-wrap items-center gap-3"><input aria-label="فایل CSV منو" type="file" accept=".csv,text/csv" onChange={(event) => void selectFile(event.target.files?.[0])} className="file-input file-input-bordered w-full max-w-md"/><Button variant="secondary" onClick={downloadExample}><Icon name="download" className="size-4"/>دریافت نمونه CSV</Button>{fileName && <span className="text-sm text-stone-500">{fileName}</span>}</div>
      {preview && <>
        <div className="flex flex-wrap gap-2 text-sm"><span className="badge badge-outline">{toFa(preview.rows.length)} ردیف</span><span className="badge badge-success badge-outline">{toFa(preview.rows.filter((row) => !row.errors.length && !row.duplicate).length)} آماده ثبت</span><span className="badge badge-warning badge-outline">{toFa(preview.rows.filter((row) => row.duplicate).length)} تکراری و ردشده</span>{errors > 0 && <span className="badge badge-error badge-outline">{toFa(errors)} خطا</span>}</div>
        {preview.status === "committed" && preview.result && <div role="status" className="alert alert-success">ثبت شد: {toFa(preview.result.created)} محصول جدید، {toFa(preview.result.skipped)} مورد ردشده.</div>}
        <div className="max-h-72 overflow-auto rounded-xl border border-base-300"><table className="table table-sm"><thead className="sticky top-0 bg-base-200"><tr><th>کد</th><th>محصول</th><th>دسته</th><th>قیمت</th><th>نتیجه</th></tr></thead><tbody>{preview.rows.map((row, index) => <tr key={`${row.externalId}-${index}`}><td dir="ltr">{row.externalId || "—"}</td><td><div className="font-semibold">{row.name || "(بدون نام)"}</div>{row.errors.map((error) => <p key={error} className="text-xs text-error">{error}</p>)}</td><td>{row.category || "—"}</td><td>{formatPrice(row.priceToman)}</td><td>{row.errors.length ? <span className="text-error">خطا</span> : row.duplicate ? <span className="text-warning">تکراری؛ رد می‌شود</span> : <span className="text-success">آماده</span>}</td></tr>)}</tbody></table></div>
      </>}
    </div>
  </Modal>;
}
