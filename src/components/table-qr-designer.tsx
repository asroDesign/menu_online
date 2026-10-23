"use client";

import { useRef, useState, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Badge, Button, Card, Field, Icon, Input, useToast } from "@/components/ui";
import { toFa } from "@/lib/format";
import { DEFAULT_TABLE_QR_DESIGN, normalizeTableQrDesign, TABLE_QR_FRAMES, type TableQrDesign, type TableQrFrame } from "@/lib/table-qr-design";

type Props = {
  tableName: string;
  businessName: string;
  url: string;
  accentColor: string;
  initialDesign: TableQrDesign;
  onSave: (design: TableQrDesign) => Promise<void>;
};

const frameStyle = (design: TableQrDesign): CSSProperties => {
  const base: CSSProperties = {
    width: "100%", maxWidth: 360, minHeight: 430, padding: 24, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: design.paperColor,
    color: "#172033", textAlign: "center", overflow: "hidden", transition: "all .2s ease",
  };
  switch (design.frame) {
    case "minimal": return { ...base, border: `1px solid #dbe2ea`, borderTop: `7px solid ${design.frameColor}`, borderRadius: 18 };
    case "ticket": return { ...base, border: `2px dashed ${design.frameColor}`, borderRadius: 20, boxShadow: "0 8px 22px rgba(15,23,42,.06)" };
    case "soft": return { ...base, border: `1px solid ${design.frameColor}30`, borderRadius: 34, boxShadow: "0 18px 44px rgba(15,23,42,.1)" };
    case "classic": return { ...base, border: `5px double ${design.frameColor}`, outline: `1px solid ${design.frameColor}40`, outlineOffset: -9, borderRadius: 8 };
    default: return { ...base, border: `2px solid ${design.frameColor}`, borderRadius: 28, boxShadow: `0 16px 40px ${design.frameColor}22` };
  }
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

function printableFrame(frame: TableQrFrame) {
  switch (frame) {
    case "minimal": return "border:1px solid #dbe2ea;border-top:7px solid var(--frame);border-radius:18px";
    case "ticket": return "border:2px dashed var(--frame);border-radius:20px;box-shadow:0 8px 22px #0f172a10";
    case "soft": return "border:1px solid color-mix(in srgb,var(--frame) 20%,white);border-radius:34px;box-shadow:0 18px 44px #0f172a18";
    case "classic": return "border:5px double var(--frame);outline:1px solid color-mix(in srgb,var(--frame) 25%,white);outline-offset:-9px;border-radius:8px";
    default: return "border:2px solid var(--frame);border-radius:28px;box-shadow:0 16px 40px color-mix(in srgb,var(--frame) 14%,white)";
  }
}

export function TableQrDesigner({ tableName, businessName, url, accentColor, initialDesign, onSave }: Props) {
  const [design, setDesign] = useState<TableQrDesign>(() => normalizeTableQrDesign(initialDesign));
  const [saving, setSaving] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const update = <K extends keyof TableQrDesign>(key: K, value: TableQrDesign[K]) => setDesign((current) => ({ ...current, [key]: value }));
  const title = design.showTableName ? tableName : design.headline;

  async function save() {
    setSaving(true);
    try { await onSave(normalizeTableQrDesign(design)); }
    catch (error) { toast((error as Error).message, "error"); }
    finally { setSaving(false); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(url); toast("پیوند منوی این میز کپی شد"); }
    catch { toast("کپی پیوند انجام نشد؛ نشانی را از پیش‌نمایش انتخاب کنید", "error"); }
  }

  function downloadSvg() {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `qr-${tableName.replace(/[^\p{L}\p{N}-]+/gu, "-")}.svg`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  function print() {
    const svg = qrRef.current?.querySelector("svg")?.outerHTML;
    if (!svg) return toast("پیش‌نمایش QR آماده نیست", "error");
    const popup = window.open("", "_blank", "width=560,height=760");
    if (!popup) return toast("پنجرهٔ چاپ مسدود شد؛ اجازهٔ بازشدن پنجره را بدهید", "error");
    const safe = normalizeTableQrDesign(design);
    const css = `<style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Tahoma,Arial,sans-serif;color:#172033}body{display:grid;place-items:center;padding:18mm;background:#f3f6fb}.card{--frame:${safe.frameColor};width:90mm;min-height:125mm;padding:10mm 8mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4mm;text-align:center;background:${safe.paperColor};${printableFrame(safe.frame)}}.brand{font-size:10pt;color:${safe.frameColor};font-weight:800}.title{font-size:22pt;font-weight:900;margin:2mm 0}.subtitle{font-size:10pt;color:#526174;line-height:1.8;max-width:70mm}.qr{padding:4mm;border:1px solid #e2e8f0;border-radius:5mm;background:#fff}.qr svg{display:block;width:${safe.qrSize}px;height:${safe.qrSize}px;max-width:64mm;max-height:64mm}.url{max-width:72mm;word-break:break-all;direction:ltr;font:8pt Arial;color:#64748b;margin-top:2mm}.footer{font-size:9pt;color:${safe.frameColor};font-weight:700}@page{size:A6 portrait;margin:0}@media print{body{padding:0;background:#fff}.card{width:105mm;height:148mm;min-height:148mm;box-shadow:none}}</style>`;
    const content = `<main class="card"><div class="brand">${escapeHtml(businessName || "منوی دیجیتال")}</div><h1 class="title">${escapeHtml(title)}</h1>${safe.showTableName && title !== safe.headline ? `<p class="subtitle">${escapeHtml(safe.headline)}</p>` : ""}<div class="qr">${svg}</div><p class="subtitle">${escapeHtml(safe.caption)}</p>${safe.showUrl ? `<p class="url">${escapeHtml(url)}</p>` : ""}<div class="footer">منوی دیجیتال · Menu</div></main>`;
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · QR</title>${css}</head><body>${content}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150))<\/script></body></html>`);
    popup.document.close();
  }

  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
    <div className="space-y-4">
      <Card className="overflow-hidden bg-slate-50 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-slate-500">پیش‌نمایش زنده</p><p className="mt-1 text-[11px] text-slate-400">همین ترکیب در برگهٔ چاپی استفاده می‌شود</p></div><Badge color="blue">{toFa(design.qrSize)} px</Badge></div>
        <div className="grid min-h-[470px] place-items-center rounded-2xl border border-slate-200 bg-[radial-gradient(#cbd5e1_0.8px,transparent_0.8px)] [background-size:18px_18px] p-3 sm:p-6">
          <article style={frameStyle(design)}>
            <div className="flex items-center gap-2 text-xs font-extrabold" style={{ color: design.frameColor }}><span className="grid size-8 place-items-center rounded-xl" style={{ backgroundColor: `${design.frameColor}18` }}><Icon name="qr" className="size-4" /></span><span>{businessName || "منوی دیجیتال"}</span></div>
            <h2 className="m-0 text-2xl font-black tracking-tight">{title}</h2>
            {design.showTableName && <p className="m-0 max-w-[28ch] text-xs leading-6 text-slate-500">{design.headline}</p>}
            <div ref={qrRef} className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"><QRCodeSVG value={url} size={design.qrSize} level="H" marginSize={design.quietZone} fgColor={design.qrColor} bgColor="#ffffff" /></div>
            <p className="m-0 max-w-[32ch] text-xs font-semibold leading-6 text-slate-600">{design.caption}</p>
            {design.showUrl && <p className="m-0 max-w-full break-all text-[10px] text-slate-400" dir="ltr">{url}</p>}
            <span className="rounded-full px-3 py-1 text-[10px] font-extrabold" style={{ color: design.frameColor, backgroundColor: `${design.frameColor}12` }}>اسکن کنید و سفارش دهید</span>
          </article>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void copyLink()}><Icon name="copy" className="size-4" /> کپی لینک میز</Button>
          <Button size="sm" variant="secondary" onClick={downloadSvg}><Icon name="download" className="size-4" /> دانلود QR برداری</Button>
          <Button size="sm" onClick={print}><Icon name="print" className="size-4" /> چاپ قاب</Button>
        </div>
        <p className="mt-3 text-center text-[10px] leading-5 text-slate-400">فایل SVG برای چاپ در هر اندازه مناسب است؛ قاب کامل با دکمهٔ چاپ آماده می‌شود.</p>
      </Card>
    </div>

    <div className="space-y-4">
      <section className="rounded-2xl border border-base-300 bg-base-100 p-4">
        <div className="mb-3"><h3 className="text-sm font-extrabold">سبک قاب</h3><p className="mt-1 text-[11px] text-base-content/55">یک طرح را انتخاب کنید؛ جزئیاتش را پایین‌تر تنظیم کنید.</p></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
          {TABLE_QR_FRAMES.map((item) => <button key={item.id} type="button" aria-pressed={design.frame === item.id} onClick={() => update("frame", item.id)} className={`rounded-xl border p-3 text-start transition ${design.frame === item.id ? "border-primary bg-primary/5 ring-2 ring-primary/15" : "border-base-300 bg-base-100 hover:bg-base-200"}`}><span className="mb-2 block h-7 rounded-lg" style={{ border: `${item.id === "classic" ? "4px double" : item.id === "ticket" ? "2px dashed" : "2px solid"} ${design.frameColor}`, borderRadius: item.id === "soft" || item.id === "signature" ? 12 : 6, backgroundColor: design.paperColor }} /><span className="block text-xs font-extrabold">{item.label}</span><span className="mt-1 block text-[10px] leading-4 text-base-content/55">{item.description}</span></button>)}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-base-300 bg-base-100 p-4">
        <h3 className="text-sm font-extrabold">رنگ‌ها و نوشته‌ها</h3>
        <div className="grid grid-cols-3 gap-2">
          {([["frameColor", "رنگ قاب"], ["qrColor", "رنگ QR"], ["paperColor", "رنگ زمینه"]] as const).map(([key, label]) => <label key={key} className="rounded-xl border border-base-300 p-2 text-center"><span className="mb-2 block text-[10px] font-semibold text-base-content/65">{label}</span><input aria-label={label} type="color" value={design[key]} onChange={(event) => update(key, event.target.value)} className="h-9 w-full cursor-pointer rounded-lg border-0 bg-transparent p-0" /></label>)}
        </div>
        <Field label="عنوان روی قاب"><Input value={design.headline} maxLength={60} onChange={(event) => update("headline", event.target.value)} /></Field>
        <Field label="متن راهنمای اسکن"><Input value={design.caption} maxLength={100} onChange={(event) => update("caption", event.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="اندازهٔ QR"><select className="select select-bordered h-10 w-full border-base-300 bg-base-100 text-sm" value={design.qrSize} onChange={(event) => update("qrSize", Number(event.target.value))}>{[180, 200, 220, 240, 260, 280, 300].map((size) => <option key={size} value={size}>{toFa(size)} پیکسل</option>)}</select></Field>
          <Field label="حاشیهٔ ایمنی"><select className="select select-bordered h-10 w-full border-base-300 bg-base-100 text-sm" value={design.quietZone} onChange={(event) => update("quietZone", Number(event.target.value))}>{[2, 4, 6, 8].map((size) => <option key={size} value={size}>{toFa(size)} واحد</option>)}</select></Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-base-200/70 px-3 py-2.5 text-xs font-semibold"><input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={design.showTableName} onChange={(event) => update("showTableName", event.target.checked)} /> نمایش نام میز روی قاب</label>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-base-200/70 px-3 py-2.5 text-xs font-semibold"><input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={design.showUrl} onChange={(event) => update("showUrl", event.target.checked)} /> نمایش لینک زیر QR</label>
        <div className="flex flex-wrap gap-2 border-t border-base-300 pt-3">
          <Button size="sm" variant="ghost" onClick={() => setDesign({ ...DEFAULT_TABLE_QR_DESIGN, frameColor: accentColor })}><Icon name="refresh" className="size-4" /> بازنشانی</Button>
          <Button size="sm" className="ms-auto" loading={saving} onClick={() => void save()}><Icon name="check" className="size-4" /> ذخیرهٔ طرح برای همهٔ میزها</Button>
        </div>
        <p className="text-[10px] leading-5 text-base-content/50">طرح ذخیره‌شده برای QR تمام میزهای این رستوران استفاده می‌شود. در چاپ واقعی، QR با حاشیهٔ سفید و تصحیح خطای بالا تولید می‌شود تا بهتر اسکن شود.</p>
      </section>
    </div>
  </div>;
}
