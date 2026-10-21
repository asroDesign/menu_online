"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, PageHeader, Select, Skeleton, Textarea, cn, useToast } from "@/components/ui";
import { useFeatures } from "@/components/features";
import { api, useCollection } from "@/lib/api";
import type { Settings } from "@/lib/plans";
import { DEFAULT_PRINTER_SETTINGS, normalizePrinterSettings, type PrintMoment, type PrintRule, type PrinterSettings } from "@/lib/printer-policy";
import { PrinterCategoryPanel, PrinterDevicesPanel, printerIsOnline } from "@/modules/hardware";

type Tab = "devices" | "workflows" | "categories";
type BusinessSettingsResponse = { item: { settings?: Settings } };
type Printer = { id: number; name: string; code: string; lastSeenAt: string | null; printerCategoryIds?: number[] };

const TABS: { id: Tab; title: string; href: string }[] = [
  { id: "devices", title: "پرینترها", href: "/dashboard/settings/printers/devices" },
  { id: "workflows", title: "چاپ خودکار", href: "/dashboard/settings/printers/workflows" },
  { id: "categories", title: "مسیر دسته‌بندی‌ها", href: "/dashboard/settings/printers/categories" },
];

const MOMENTS: { id: PrintMoment; title: string; description: string }[] = [
  { id: "created_with_table", title: "موقع ثبت سفارش با میز", description: "وقتی سفارش تازه به یک میز سالن متصل است." },
  { id: "created_without_table", title: "سفارش بدون میز", description: "برای بیرون‌بر، پیشخوان یا سفارشی که هنوز میز ندارد." },
  { id: "settled", title: "موقع تسویه سفارش", description: "وقتی تسویه سفارش در صندوق یا پس از تأیید پرداخت آنلاین ثبت می‌شود." },
  { id: "completed", title: "موقع آماده‌شدن سفارش", description: "وقتی وضعیت سفارش از مرحلهٔ آماده‌سازی به «آماده» می‌رود." },
];

const COPY_PRESETS: Record<PrintMoment, { key: string; label: string; customer: number; kitchen: number; cafe: number }[]> = {
  created_with_table: [
    { key: "none", label: "چاپ نکند", customer: 0, kitchen: 0, cafe: 0 },
    { key: "kitchen", label: "فقط آشپزخانه", customer: 0, kitchen: 1, cafe: 0 },
    { key: "customer", label: "فقط مشتری", customer: 1, kitchen: 0, cafe: 0 },
    { key: "both", label: "مشتری و آشپزخانه", customer: 1, kitchen: 1, cafe: 0 },
  ],
  created_without_table: [
    { key: "none", label: "چاپ نکند", customer: 0, kitchen: 0, cafe: 0 },
    { key: "kitchen", label: "فقط آشپزخانه", customer: 0, kitchen: 1, cafe: 0 },
    { key: "customer", label: "فقط مشتری", customer: 1, kitchen: 0, cafe: 0 },
    { key: "both", label: "مشتری و آشپزخانه", customer: 1, kitchen: 1, cafe: 0 },
  ],
  settled: [
    { key: "none", label: "چاپ نکند", customer: 0, kitchen: 0, cafe: 0 },
    { key: "customer", label: "فقط مشتری", customer: 1, kitchen: 0, cafe: 0 },
    { key: "customer_cafe", label: "مشتری و نسخهٔ کافه", customer: 1, kitchen: 0, cafe: 1 },
  ],
  completed: [
    { key: "none", label: "چاپ نکند", customer: 0, kitchen: 0, cafe: 0 },
    { key: "customer", label: "فقط مشتری", customer: 1, kitchen: 0, cafe: 0 },
    { key: "kitchen", label: "فقط آشپزخانه", customer: 0, kitchen: 1, cafe: 0 },
    { key: "both", label: "مشتری و آشپزخانه", customer: 1, kitchen: 1, cafe: 0 },
  ],
};

const cloneRule = (value: PrintRule): PrintRule => ({ ...value, kitchenPrinterIds: [...value.kitchenPrinterIds] });
function presetKey(moment: PrintMoment, value: PrintRule) {
  return COPY_PRESETS[moment].find((item) => item.customer === value.customerCopies && item.kitchen === value.kitchenCopies && item.cafe === value.cafeCopies)?.key ?? "custom";
}

function RuleEditor({ moment, settings, printers, saving, onSave }: {
  moment: (typeof MOMENTS)[number]; settings: PrinterSettings; printers: Printer[]; saving: boolean; onSave: (next: PrinterSettings) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const rule = settings.rules[moment.id];
  const selected = editing ? "custom" : presetKey(moment.id, rule);
  function withRule(nextRule: PrintRule) {
    const next = { ...settings, rules: { ...settings.rules, [moment.id]: nextRule } };
    void onSave(next).catch(() => {});
  }
  const [draft, setDraft] = useState<PrinterSettings | null>(null);
  const editingRule = (draft ?? settings).rules[moment.id];
  function patchDraft(patch: Partial<PrintRule>) {
    const next = { ...(draft ?? settings), rules: { ...(draft ?? settings).rules, [moment.id]: { ...editingRule, ...patch } } };
    setDraft(next);
  }
  return <Card className="space-y-4 p-4 sm:p-5">
    <div><h2 className="font-bold">{moment.title}</h2><p className="mt-1 text-xs leading-6 text-stone-500">{moment.description}</p></div>
    <div role="radiogroup" aria-label={`سیاست چاپ ${moment.title}`} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {[...COPY_PRESETS[moment.id], { key: "custom", label: "چیدمان دلخواه", customer: -1, kitchen: -1, cafe: -1 }].map((item) => <button key={item.key} type="button" role="radio" aria-checked={selected === item.key} disabled={saving} onClick={() => {
        if (item.key === "custom") { setDraft(settings); setEditing(true); return; }
        setEditing(false); setDraft(null);
        withRule({ ...cloneRule(rule), customerCopies: item.customer, kitchenCopies: item.kitchen, cafeCopies: item.cafe });
      }} className={cn("flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start text-sm font-semibold transition", selected === item.key ? "border-brand-400 bg-brand-50 text-brand-900" : "border-stone-200 bg-white hover:border-brand-300")}>
        <span>{item.label}</span>{selected === item.key && <Icon name="check" className="size-4 text-brand-700" />}
      </button>)}
    </div>
    {editing && <div className="space-y-4 rounded-xl border border-brand-200 bg-brand-50/50 p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="نسخه برای مشتری (۰ تا ۵)"><Input inputMode="numeric" min={0} max={5} type="number" value={editingRule.customerCopies} onChange={(event) => patchDraft({ customerCopies: Number(event.target.value) })} /></Field>
        <Field label="بلیت آشپزخانه (۰ تا ۵)"><Input inputMode="numeric" min={0} max={5} type="number" value={editingRule.kitchenCopies} onChange={(event) => patchDraft({ kitchenCopies: Number(event.target.value) })} /></Field>
        <Field label="نسخه بایگانی کافه (۰ تا ۵)"><Input inputMode="numeric" min={0} max={5} type="number" value={editingRule.cafeCopies} onChange={(event) => patchDraft({ cafeCopies: Number(event.target.value) })} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="پرینتر فیش مشتری"><Select value={editingRule.customerPrinterId ?? ""} onChange={(event) => patchDraft({ customerPrinterId: event.target.value ? Number(event.target.value) : null })}><option value="">انتخاب خودکار (اولین چاپگر)</option>{printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</Select></Field>
        <Field label="پرینتر نسخهٔ کافه"><Select value={editingRule.cafePrinterId ?? ""} onChange={(event) => patchDraft({ cafePrinterId: event.target.value ? Number(event.target.value) : null })}><option value="">همان چاپگر پیش‌فرض</option>{printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</Select></Field>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold">پرینترهای بلیت آشپزخانه</p>
        <p className="mb-2 text-[11px] leading-5 text-stone-500">اگر انتخابی نکنید، دسته‌بندی‌های هر چاپگر تعیین می‌کند کدام قلم به کجا برود. اگر هیچ چاپگری دسته نداشته باشد، اولین چاپگر همهٔ اقلام را می‌گیرد.</p>
        <div className="flex flex-wrap gap-2">{printers.map((printer) => <label key={printer.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-stone-200"><input type="checkbox" checked={editingRule.kitchenPrinterIds.includes(printer.id)} onChange={() => patchDraft({ kitchenPrinterIds: editingRule.kitchenPrinterIds.includes(printer.id) ? editingRule.kitchenPrinterIds.filter((id) => id !== printer.id) : [...editingRule.kitchenPrinterIds, printer.id] })} />{printer.name}</label>)}</div>
      </div>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => { setEditing(false); setDraft(null); }}>انصراف</Button><Button loading={saving} onClick={() => { if (draft) void onSave(draft).then(() => { setEditing(false); setDraft(null); }).catch(() => {}); }}>ذخیرهٔ چیدمان دلخواه</Button></div>
    </div>}
  </Card>;
}

export function PrinterSettingsScreen({ tab }: { tab: Tab }) {
  const features = useFeatures();
  const toast = useToast();
  const printers = useCollection<Printer>("/api/r/dev_printer", { poll: 10000 });
  const [settings, setSettings] = useState<PrinterSettings>(DEFAULT_PRINTER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [headerDraft, setHeaderDraft] = useState("");
  const [footerDraft, setFooterDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<BusinessSettingsResponse>("/api/business").then(({ item }) => {
      const next = normalizePrinterSettings(item.settings?.printerSettings);
      setSettings(next); setHeaderDraft(next.receiptHeader); setFooterDraft(next.receiptFooter);
    }).catch((reason) => setError((reason as Error).message)).finally(() => setLoading(false));
  }, []);

  async function save(next: PrinterSettings, success = "تنظیمات چاپ ذخیره شد") {
    setSaving(true);
    try {
      const result = await api<BusinessSettingsResponse>("/api/business", { method: "PATCH", body: { settings: { printerSettings: next } } });
      const normalized = normalizePrinterSettings(result.item.settings?.printerSettings ?? next);
      setSettings(normalized); setHeaderDraft(normalized.receiptHeader); setFooterDraft(normalized.receiptFooter);
      toast(success);
    } catch (reason) { toast((reason as Error).message, "error"); throw reason; }
    finally { setSaving(false); }
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 rounded-2xl" /></div>;
  if (error) return <EmptyState emoji="" title="تنظیمات پرینتر بارگذاری نشد" description={error} action={<Button onClick={() => location.reload()}>تلاش دوباره</Button>} />;

  return <div className="animate-fade-in space-y-5 pb-12">
    <PageHeader title="پرینترها و چاپ خودکار" subtitle="اتصال چاپگرها، تفکیک بلیت‌ها و سیاست چاپ هر مرحلهٔ سفارش را از یکجا تنظیم کنید." actions={<Link href="/dashboard/printers"><Button variant="secondary"><Icon name="print" className="size-4" /> صف چاپ و تاریخچه</Button></Link>} />
    <nav aria-label="بخش‌های تنظیمات پرینتر" className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-2 ring-1 ring-stone-200">
      {TABS.map((item) => <Link key={item.id} href={item.href} aria-current={tab === item.id ? "page" : undefined} className={cn("shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition", tab === item.id ? "bg-brand-600 text-white" : "text-stone-600 hover:bg-stone-100")}>{item.title}</Link>)}
    </nav>
    {!features.has("cloud_printer") ? <Card className="p-6"><h2 className="font-bold">قابلیت پرینتر در پلن شما فعال نیست</h2><p className="mt-2 text-sm leading-6 text-stone-500">پس از فعال‌شدن امکان پرینتر، اتصال USB/شبکه، تفکیک دسته‌ها و سیاست چاپ خودکار در دسترس خواهد بود.</p></Card> : <>
      {tab === "devices" && <>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="font-bold">وضعیت اتصال و ایستگاه‌های چاپ</h2><p className="mt-1 text-xs leading-5 text-stone-500">هر پرینتر ثبت‌شده یک ایستگاه است؛ وضعیت آنلاین با ارتباط Agent در پنج دقیقهٔ اخیر بررسی می‌شود.</p></div><Badge color={printers.items.some((printer) => printerIsOnline(printer.lastSeenAt)) ? "emerald" : "stone"}>{printers.items.filter((printer) => printerIsOnline(printer.lastSeenAt)).length ? "حداقل یک پرینتر آنلاین" : "در انتظار اتصال Agent"}</Badge></Card>
        <PrinterDevicesPanel />
        <Card className="space-y-4 p-4 sm:p-5">
          <div><h2 className="font-bold">سربرگ و پابرگ فیش</h2><p className="mt-1 text-xs leading-5 text-stone-500">متن ذخیره‌شده در سطح کسب‌وکار روی فیش مشتری، نسخهٔ کافه و بلیت آماده‌سازی چاپ می‌شود.</p></div>
          <div className="grid gap-4 lg:grid-cols-2"><Field label="سربرگ فیش"><Textarea rows={3} maxLength={500} value={headerDraft} onChange={(event) => setHeaderDraft(event.target.value)} placeholder="نشانی، تلفن یا پیام خوش‌آمدگویی" /></Field><Field label="پابرگ فیش"><Textarea rows={3} maxLength={500} value={footerDraft} onChange={(event) => setFooterDraft(event.target.value)} placeholder="پیام پایانی یا راه‌های ارتباطی" /></Field></div>
          <div className="flex justify-end"><Button loading={saving} onClick={() => void save({ ...settings, receiptHeader: headerDraft, receiptFooter: footerDraft }, "سربرگ و پابرگ فیش ذخیره شد")}>ذخیرهٔ متن فیش</Button></div>
        </Card>
      </>}
      {tab === "workflows" && <>
        <Card className="p-4 sm:p-5"><h2 className="font-bold">سیاست چاپ خودکار</h2><p className="mt-1 text-xs leading-6 text-stone-500">هر رویداد مستقل است. فیش مشتری مبلغ نهایی دارد؛ بلیت آشپزخانه فقط اقلام و گزینه‌ها را نشان می‌دهد. چاپ تا اتصال Agent در صف می‌ماند و بعد از اتصال قابل retry است.</p></Card>
        {MOMENTS.map((moment) => <RuleEditor key={moment.id} moment={moment} settings={settings} printers={printers.items} saving={saving} onSave={save} />)}
        <Card className="p-4 text-xs leading-6 text-stone-500">گزینهٔ پیش‌فرض دسته‌بندی هر چاپگر از تب «مسیر دسته‌بندی‌ها» ذخیره می‌شود. انتخاب چند پرینتر برای یک دسته باعث می‌شود همان بلیت به همهٔ ایستگاه‌های منتخب برود.</Card>
      </>}
      {tab === "categories" && <>
        <Card className="p-4"><h2 className="font-bold">تفکیک اقلام سفارش بین ایستگاه‌ها</h2><p className="mt-1 text-xs leading-6 text-stone-500">به هر چاپگر دسته‌های خودش را بسپارید؛ برای مثال کافی‌بار فقط نوشیدنی‌ها را می‌گیرد و آشپزخانه غذاها را. گزینه‌های افزوده همراه همان قلم چاپ می‌شوند.</p></Card>
        <PrinterCategoryPanel />
      </>}
    </>}
  </div>;
}
