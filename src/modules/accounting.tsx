"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import headerStyles from "./accounting-header.module.css";
import { JalaliInput } from "@/components/jalali-input";
import { formatNumber, toFa } from "@/lib/format";
import { fmtJ, toJ, jYearRange } from "@/lib/jalali";
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, Select, Skeleton, Switch, cn, useToast,
 EmojiIcon, IconText} from "@/components/ui";

type Acc = { id: number; code: string; name: string; level: "kol" | "moein" | "tafsili"; parentId: number | null; type: string; nature: string; isSystem: boolean; isActive: boolean };
type Year = { id: number; title: string; startDate: string; endDate: string; isClosed: boolean };
type Doc = { id: number; number: number; date: string; kind: string; source: string; description: string; status: string; reversed: boolean; reversedOf: number | null; totalAmount: number; createdBy: string };
type DocLine = { id?: number; accountId: number; code: string; name: string; level: string; kol: string; moein: string; debit: number; credit: number; description: string };
type DocFull = Doc & { yearTitle: string; yearClosed: boolean; lines: DocLine[] };

const KIND: Record<string, string> = { general: "عمومی", opening: "افتتاحیه", closing: "اختتامیه" };
const SRC: Record<string, [string, string]> = { manual: ["دستی", "stone"], order: ["فروش", "emerald"], inventory: ["انبار", "blue"], expense: ["درآمد/هزینه", "amber"], reversal: ["برگشتی", "rose"], system: ["سیستمی", "violet"] };
const TYPE: Record<string, string> = { asset: "دارایی", liability: "بدهی", equity: "حقوق صاحبان سرمایه", revenue: "درآمد", expense: "هزینه" };
const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "");
const num = (n: number) => (n ? formatNumber(n) : "—");

type Range = { year: string; from: string; to: string; closing: boolean };
const qs = (r: Range, extra: Record<string, string> = {}) => new URLSearchParams({ year: r.year, ...(r.from ? { from: r.from } : {}), ...(r.to ? { to: r.to } : {}), ...(r.closing ? { closing: "1" } : {}), ...extra }).toString();

export function Accounting() {
  const toast = useToast();
  const [tab, setTab] = useState<"docs" | "chart" | "journal" | "ledger" | "trial" | "statements" | "years">("docs");
  const [years, setYears] = useState<Year[]>([]);
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [range, setRange] = useState<Range>({ year: "", from: "", to: "", closing: false });
  const [err, setErr] = useState("");
  const [viewId, setViewId] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const loadMeta = useCallback(async () => {
    try {
      const m = await api<{ years: Year[]; currentYearId: number }>("/api/acc/meta");
      setYears(m.years);
      setRange((r) => ({ ...r, year: r.year || String(m.currentYearId) }));
      setAccounts((await api<{ items: Acc[] }>("/api/acc/accounts")).items);
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const year = years.find((y) => String(y.id) === range.year);
  const tabs: [typeof tab, string, string][] = [["docs", "اسناد", "file"], ["chart", "سرفصل حساب‌ها", "layers"], ["journal", "دفتر روزنامه", "book"], ["ledger", "دفتر کل / معین / تفصیلی", "book"], ["trial", "تراز آزمایشی", "scale"], ["statements", "صورت‌های مالی", "chart"], ["years", "سال مالی", "calendar"]];
  const showRange = tab !== "chart" && tab !== "years";

  if (err) return <ErrorState message={err} onRetry={() => { setErr(""); loadMeta(); }} />;
  return (
    <div className="animate-fade-in">
      <section className={headerStyles.header} aria-label="مدیریت حسابداری">
        <div className={headerStyles.overview}>
          <div className={headerStyles.identity}>
            <span className={headerStyles.emblem}><Icon name="book" className="size-6" /></span>
            <div>
              <p className={headerStyles.eyebrow}>امور مالی و گزارش‌ها</p>
              <h1 className={headerStyles.title}>حسابداری دوطرفه</h1>
              <p className={headerStyles.description}>مدیریت اسناد، سرفصل حساب‌ها و گزارش‌های مالی</p>
            </div>
          </div>
          <div className={headerStyles.period}>
            <div className={headerStyles.periodTitle}>
              <Icon name="calendar" className="size-4" />
              <span>{year?.title ?? "در حال دریافت سال مالی…"}</span>
              {year && <Badge color={year.isClosed ? "stone" : "emerald"}>{year.isClosed ? "بسته" : "باز"}</Badge>}
            </div>
            {year && <p>{fmtJ(year.startDate)} <span>تا</span> {fmtJ(year.endDate)}</p>}
          </div>
        </div>
        <nav className={cn("no-print", headerStyles.navigation)} aria-label="بخش‌های حسابداری">
          {tabs.map(([key, label, icon]) => (
            <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)} className={headerStyles.navItem}>
              <Icon name={icon} className="size-4 shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        {showRange && (
          <div className={cn("no-print", headerStyles.filters)}>
            <div className={headerStyles.filterHeading}><Icon name="calendar" className="size-4" /><span>بازه گزارش</span><span className={headerStyles.dateHint}>تاریخ شمسی</span></div>
            <div className={headerStyles.filterFields}>
              <Field label="سال مالی"><Select className="w-full" value={range.year} onChange={(e) => setRange({ ...range, year: e.target.value })}>{years.map((y) => <option key={y.id} value={y.id}>{y.title}{y.isClosed ? " (بسته)" : ""}</option>)}</Select></Field>
              <Field label="از تاریخ"><JalaliInput value={range.from} onChange={(v) => setRange((r) => ({ ...r, from: v }))} /></Field>
              <Field label="تا تاریخ"><JalaliInput end value={range.to} onChange={(v) => setRange((r) => ({ ...r, to: v }))} /></Field>
            </div>
            <div className={headerStyles.filterActions}>
              {tab !== "docs" && <label className={headerStyles.closing}><input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={range.closing} onChange={(e) => setRange({ ...range, closing: e.target.checked })} />شامل اسناد اختتامیه</label>}
              <div className={headerStyles.actionButtons}>
                {(range.from || range.to) && <Button variant="ghost" size="sm" onClick={() => setRange((r) => ({ ...r, from: "", to: "" }))}><Icon name="x" className="size-4" />پاک کردن تاریخ‌ها</Button>}
                {tab !== "docs" && <Button variant="secondary" onClick={() => window.print()}><Icon name="print" className="size-4" />چاپ گزارش</Button>}
              </div>
            </div>
          </div>
        )}
      </section>
      {!range.year ? <Skeleton className="h-64 rounded-2xl" /> : (
        <>
          {tab === "docs" && <DocsTab key={version} range={range} accounts={accounts} year={year} openDoc={setViewId} changed={bump} />}
          {tab === "chart" && <ChartTab accounts={accounts} reload={loadMeta} />}
          {tab === "journal" && <JournalTab range={range} version={version} openDoc={setViewId} />}
          {tab === "ledger" && <LedgerTab range={range} accounts={accounts} openDoc={setViewId} />}
          {tab === "trial" && <TrialTab range={range} version={version} />}
          {tab === "statements" && <StatementsTab range={range} version={version} />}
          {tab === "years" && <YearsTab years={years} reload={() => { loadMeta(); bump(); }} />}
        </>
      )}
      <DocView id={viewId} onClose={() => setViewId(null)} changed={() => { bump(); }} toast={toast} />
    </div>
  );
}

/* ---------------------------------------------------------------- docs */
function DocsTab({ range, accounts, year, openDoc, changed }: { range: Range; accounts: Acc[]; year?: Year; openDoc: (id: number) => void; changed: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<Doc[] | null>(null);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState(""), [source, setSource] = useState(""), [status, setStatus] = useState(""), [q, setQ] = useState("");
  const [editor, setEditor] = useState<DocFull | "new" | null>(null);
  const [del, setDel] = useState<Doc | null>(null);
  const load = useCallback(() => {
    setItems(null);
    api<{ items: Doc[] }>(`/api/acc/documents?${qs(range, { ...(kind ? { kind } : {}), ...(source ? { source } : {}), ...(status ? { status } : {}), ...(q ? { q } : {}) })}`).then((r) => setItems(r.items)).catch((e) => setErr(e.message));
  }, [range, kind, source, status, q]);
  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load, q]);

  async function act(d: Doc, what: "reverse" | "post") {
    try { await api(`/api/acc/documents/${d.id}/${what}`, { method: "POST", body: {} }); toast(what === "reverse" ? "سند برگشتی صادر شد" : "سند قطعی شد"); load(); changed(); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function edit(d: Doc) {
    try { setEditor((await api<{ item: DocFull }>(`/api/acc/documents/${d.id}`)).item); } catch (e) { toast((e as Error).message, "error"); }
  }
  const total = (items ?? []).reduce((s, d) => s + d.totalAmount, 0);
  return (
    <div>
      <div className={cn("no-print", headerStyles.documentToolbar)}>
        <Select className="w-36" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">همه انواع</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select className="w-40" value={source} onChange={(e) => setSource(e.target.value)}><option value="">همه منابع</option>{Object.entries(SRC).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</Select>
        <Select className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">همه وضعیت‌ها</option><option value="posted">قطعی</option><option value="draft">پیش‌نویس</option></Select>
        <div className="relative w-56"><Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><Input className="ps-9" placeholder="شماره یا شرح سند…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Button className="ms-auto" onClick={() => setEditor("new")} disabled={year?.isClosed}><Icon name="plus" className="size-4" /> سند جدید</Button>
      </div>
      <IconText>{err ? <ErrorState message={err} /> : !items ? <Skeleton className="h-72 rounded-2xl" /> : items.length === 0 ? <EmptyState emoji="" title="سندی یافت نشد" description="اسناد فروش و انبار خودکار ثبت می‌شوند؛ برای ثبت دستی روی «سند جدید» بزنید." action={<Button onClick={() => setEditor("new")}>سند جدید</Button>} /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b bg-stone-50/70 text-xs text-stone-500"><th className="p-3 text-start">شماره</th><th className="p-3 text-start">تاریخ</th><th className="p-3 text-start">نوع</th><th className="p-3 text-start">منبع</th><th className="p-3 text-start">شرح</th><th className="p-3 text-start">مبلغ</th><th className="p-3 text-start">وضعیت</th><th className="no-print p-3" /></tr></thead>
            <tbody className="divide-y divide-stone-100">{items.map((d) => (
              <tr key={d.id} className={cn("hover:bg-stone-50/60", d.reversed && "bg-rose-50/40")}>
                <td className="p-3"><button className="font-extrabold text-brand-600 hover:underline" onClick={() => openDoc(d.id)}>{toFa(d.number)}</button></td>
                <td className="whitespace-nowrap p-3 text-xs">{fmtJ(d.date)}</td>
                <td className="p-3"><Badge color={d.kind === "general" ? "stone" : "violet"}>{KIND[d.kind]}</Badge></td>
                <td className="p-3"><Badge color={SRC[d.source]?.[1]}>{SRC[d.source]?.[0]}</Badge></td>
                <td className="max-w-72 truncate p-3 text-xs text-stone-600" title={d.description}>{d.description}</td>
                <td className="p-3 font-bold">{formatNumber(d.totalAmount)}</td>
                <td className="p-3">{d.status === "draft" ? <Badge color="amber">پیش‌نویس</Badge> : d.reversed ? <Badge color="rose">برگشت‌خورده</Badge> : <Badge color="emerald">قطعی</Badge>}</td>
                <td className="no-print p-2"><div className="flex justify-end gap-0.5">
                  <IconButton icon="search" label="مشاهده" onClick={() => openDoc(d.id)} />
                  <a href={`/print/doc/${d.id}`} target="_blank" aria-label="چاپ روکش"><IconButton icon="print" label="چاپ روکش سند" /></a>
                  {d.status === "draft" && <><IconButton icon="edit" label="ویرایش" onClick={() => edit(d)} /><IconButton icon="check" label="قطعی کردن" className="text-emerald-600" onClick={() => act(d, "post")} /><IconButton icon="trash" label="حذف" className="hover:text-rose-600" onClick={() => setDel(d)} /></>}
                  {d.status === "posted" && !d.reversed && !d.reversedOf && d.kind !== "closing" && <button className="rounded-lg px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50" onClick={() => act(d, "reverse")}>{<EmojiIcon emoji="" />} برگشت</button>}
                </div></td>
              </tr>
            ))}</tbody>
            <tfoot><tr className="border-t bg-stone-50 text-xs font-bold"><td colSpan={5} className="p-3">{toFa(items.length)} سند</td><td className="p-3">{formatNumber(total)}</td><td colSpan={2} /></tr></tfoot>
          </table>
        </Card>
      )}</IconText>
      <DocEditor open={!!editor} doc={editor === "new" ? null : editor} accounts={accounts} onClose={() => setEditor(null)} saved={() => { setEditor(null); load(); changed(); }} />
      <ConfirmDialog open={!!del} title="حذف پیش‌نویس" message="این پیش‌نویس حذف می‌شود." onClose={() => setDel(null)} onConfirm={async () => { if (!del) return; try { await api(`/api/acc/documents/${del.id}`, { method: "DELETE" }); toast("حذف شد"); load(); } catch (e) { toast((e as Error).message, "error"); } }} />
    </div>
  );
}

export function AccountSelect({ accounts, value, onChange, allowKol, className }: { accounts: Acc[]; value: string; onChange: (v: string) => void; allowKol?: boolean; className?: string }) {
  const kols = accounts.filter((a) => a.level === "kol");
  return (
    <Select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">انتخاب حساب…</option>
      {kols.map((k) => (
        <optgroup key={k.id} label={`${toFa(k.code)} — ${k.name}`}>
          {allowKol && <option value={k.id}>{toFa(k.code)} — {k.name} (کل)</option>}
          {accounts.filter((a) => a.level === "moein" && a.parentId === k.id && (a.isActive || String(a.id) === value)).flatMap((m) => [
            <option key={m.id} value={m.id}>{toFa(m.code)} — {m.name}</option>,
            ...accounts.filter((t) => t.parentId === m.id && (t.isActive || String(t.id) === value)).map((t) => <option key={t.id} value={t.id}>{"\u00a0\u00a0\u00a0\u00a0"}↳ {toFa(t.code)} — {t.name}</option>),
          ])}
        </optgroup>
      ))}
    </Select>
  );
}

type EdLine = { accountId: string; debit: string; credit: string; description: string };
function DocEditor({ open, doc, accounts, onClose, saved }: { open: boolean; doc: DocFull | null; accounts: Acc[]; onClose: () => void; saved: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString());
  const [kind, setKind] = useState("general");
  const [desc, setDesc] = useState("");
  const [lines, setLines] = useState<EdLine[]>([]);
  const [busy, setBusy] = useState("");
  const blank = (): EdLine => ({ accountId: "", debit: "", credit: "", description: "" });
  useEffect(() => {
    if (!open) return;
    if (doc) { setDate(doc.date); setKind(doc.kind); setDesc(doc.description); setLines(doc.lines.map((l) => ({ accountId: String(l.accountId), debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "", description: l.description }))); }
    else { setDate(new Date().toISOString()); setKind("general"); setDesc(""); setLines([blank(), blank()]); }
  }, [open, doc]);
  const n = (s: string) => Number(faToEn(s)) || 0;
  const td = lines.reduce((s, l) => s + n(l.debit), 0), tc = lines.reduce((s, l) => s + n(l.credit), 0);
  const diff = td - tc;
  const set = (i: number, p: Partial<EdLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  function balance() {
    if (diff === 0) return;
    const idx = lines.findIndex((l) => !n(l.debit) && !n(l.credit));
    const patch: Partial<EdLine> = diff > 0 ? { credit: String(diff), debit: "" } : { debit: String(-diff), credit: "" };
    if (idx >= 0) set(idx, patch); else setLines([...lines, { ...blank(), ...patch }]);
  }
  async function save(status: "draft" | "posted") {
    setBusy(status);
    try {
      const body = { date, kind, description: desc, status, lines: lines.filter((l) => l.accountId).map((l) => ({ accountId: Number(l.accountId), debit: n(l.debit), credit: n(l.credit), description: l.description })) };
      if (doc) await api(`/api/acc/documents/${doc.id}`, { method: "PATCH", body }); else await api("/api/acc/documents", { method: "POST", body });
      toast(status === "posted" ? "سند قطعی ثبت شد" : "پیش‌نویس ذخیره شد");
      saved();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(""); }
  }
  return (
    <Modal open={open} onClose={onClose} title={doc ? `ویرایش پیش‌نویس سند ${toFa(doc.number)}` : "سند حسابداری جدید"} size="lg" footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="secondary" loading={busy === "draft"} onClick={() => save("draft")}>ذخیره پیش‌نویس</Button><Button loading={busy === "posted"} disabled={diff !== 0 || td === 0} onClick={() => save("posted")}>ثبت قطعی</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="تاریخ سند (شمسی)"><JalaliInput value={date} onChange={(v) => v && setDate(v)} /></Field>
          <Field label="نوع سند"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>سند {v}</option>)}</Select></Field>
          <Field label="شرح سند" className="sm:col-span-1"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="شرح کلی…" /></Field>
        </div>
        <div className="space-y-2">
          <div className="hidden grid-cols-[1.6fr_1fr_1fr_1.2fr_32px] gap-2 px-1 text-[11px] font-bold text-stone-500 md:grid"><span>حساب (معین / تفصیلی)</span><span>بدهکار</span><span>بستانکار</span><span>شرح ردیف</span><span /></div>
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 rounded-xl bg-stone-50 p-2 md:grid-cols-[1.6fr_1fr_1fr_1.2fr_32px] md:bg-transparent md:p-0">
              <AccountSelect accounts={accounts} value={l.accountId} onChange={(v) => set(i, { accountId: v })} />
              <Input inputMode="numeric" placeholder="بدهکار" value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
              <Input inputMode="numeric" placeholder="بستانکار" value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
              <Input placeholder="شرح" value={l.description} onChange={(e) => set(i, { description: e.target.value })} />
              <IconButton icon="x" label="حذف ردیف" disabled={lines.length <= 2} onClick={() => setLines(lines.filter((_, j) => j !== i))} />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={() => setLines([...lines, blank()])}><Icon name="plus" className="size-4" /> ردیف جدید</Button>
            <Button size="sm" variant="ghost" onClick={balance} disabled={diff === 0}><IconText>{<EmojiIcon emoji="" />}</IconText> تراز خودکار</Button>
          </div>
        </div>
        <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-bold", diff === 0 && td > 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>
          <span>جمع بدهکار: {formatNumber(td)}</span><span>جمع بستانکار: {formatNumber(tc)}</span>
          <span><IconText>{diff === 0 && td > 0 ? " سند تراز است" : diff === 0 ? "مبلغی وارد نشده" : `اختلاف: ${formatNumber(Math.abs(diff))} ${diff > 0 ? "(بدهکار بیشتر)" : "(بستانکار بیشتر)"}`}</IconText></span>
        </div>
      </div>
    </Modal>
  );
}

function DocView({ id, onClose, changed, toast }: { id: number | null; onClose: () => void; changed: () => void; toast: (m: string, t?: "success" | "error") => void }) {
  const [d, setD] = useState<DocFull | null>(null);
  useEffect(() => { setD(null); if (id) api<{ item: DocFull }>(`/api/acc/documents/${id}`).then((r) => setD(r.item)).catch((e) => toast(e.message, "error")); }, [id, toast]);
  async function reverse() {
    if (!d) return;
    try { await api(`/api/acc/documents/${d.id}/reverse`, { method: "POST", body: {} }); toast("سند برگشتی صادر شد"); changed(); onClose(); } catch (e) { toast((e as Error).message, "error"); }
  }
  const td = d?.lines.reduce((s, l) => s + l.debit, 0) ?? 0, tc = d?.lines.reduce((s, l) => s + l.credit, 0) ?? 0;
  return (
    <Modal open={!!id} onClose={onClose} title={d ? `سند شماره ${toFa(d.number)} — ${fmtJ(d.date)}` : "…"} size="lg" footer={d && <>
      <IconText>{d.status === "posted" && !d.reversed && !d.reversedOf && d.kind !== "closing" && <Button variant="ghost" className="me-auto text-rose-600" onClick={reverse}>{<EmojiIcon emoji="" />} برگشت سند</Button>}</IconText>
      <a href={`/print/doc/${d.id}`} target="_blank"><Button><IconText>{<EmojiIcon emoji="" />}</IconText> چاپ روکش سند</Button></a></>}>
      {!d ? <Skeleton className="h-40" /> : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs"><Badge color="violet">{KIND[d.kind]}</Badge><Badge color={SRC[d.source]?.[1]}>{SRC[d.source]?.[0]}</Badge>{d.status === "draft" ? <Badge color="amber">پیش‌نویس</Badge> : d.reversed ? <Badge color="rose">برگشت‌خورده</Badge> : <Badge color="emerald">قطعی</Badge>}<span className="text-stone-500">{d.yearTitle} · تنظیم: {d.createdBy || "—"}</span></div>
          <p className="text-sm leading-7">{d.description}</p>
          <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200">
            <table className="w-full min-w-[560px] text-sm"><thead><tr className="bg-stone-50 text-xs text-stone-500"><th className="p-2.5 text-start">حساب</th><th className="p-2.5 text-start">شرح</th><th className="p-2.5 text-end">بدهکار</th><th className="p-2.5 text-end">بستانکار</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{d.lines.map((l) => <tr key={l.id}><td className="p-2.5"><b>{toFa(l.code)}</b> {l.name}<span className="block text-[11px] text-stone-400">{l.kol} ‹ {l.moein}</span></td><td className="p-2.5 text-xs text-stone-500">{l.description}</td><td className="p-2.5 text-end font-semibold">{num(l.debit)}</td><td className="p-2.5 text-end font-semibold">{num(l.credit)}</td></tr>)}</tbody>
              <tfoot><tr className="bg-stone-50 font-extrabold"><td colSpan={2} className="p-2.5">جمع</td><td className="p-2.5 text-end">{formatNumber(td)}</td><td className="p-2.5 text-end">{formatNumber(tc)}</td></tr></tfoot></table>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* --------------------------------------------------------------- chart */
function ChartTab({ accounts, reload }: { accounts: Acc[]; reload: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ level: "tafsili", parentId: "", code: "", name: "", type: "asset" });
  const [del, setDel] = useState<Acc | null>(null);
  const kols = accounts.filter((a) => a.level === "kol");
  const parents = accounts.filter((a) => (f.level === "moein" ? a.level === "kol" : f.level === "tafsili" ? a.level === "moein" : false));
  const parent = accounts.find((a) => String(a.id) === f.parentId);
  const nextCode = (p?: Acc) => {
    if (!p) return "";
    const kids = accounts.filter((a) => a.parentId === p.id).map((a) => Number(a.code)).filter(Boolean);
    return String(kids.length ? Math.max(...kids) + 1 : Number(p.code + (p.level === "kol" ? "01" : "01")));
  };
  async function save() {
    try {
      await api("/api/acc/accounts", { method: "POST", body: { level: f.level, parentId: f.parentId ? Number(f.parentId) : null, code: f.code, name: f.name, type: f.type } });
      toast("حساب اضافه شد"); setOpen(false); reload();
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function toggle(a: Acc) {
    try { await api(`/api/acc/accounts/${a.id}`, { method: "PATCH", body: { isActive: !a.isActive } }); reload(); } catch (e) { toast((e as Error).message, "error"); }
  }
  const row = (a: Acc, depth: number) => (
    <tr key={a.id} className={cn("border-t border-stone-100", a.level === "kol" && "bg-stone-50/80 font-bold", !a.isActive && "opacity-50")}>
      <td className="p-2.5" style={{ paddingInlineStart: 12 + depth * 22 }}><span className="me-2 text-xs text-stone-400">{a.level === "kol" ? "▣" : a.level === "moein" ? "▢" : "↳"}</span><b className="me-2 tabular-nums">{toFa(a.code)}</b>{a.name}</td>
      <td className="p-2.5"><Badge color={a.level === "kol" ? "violet" : a.level === "moein" ? "blue" : "stone"}>{a.level === "kol" ? "کل" : a.level === "moein" ? "معین" : "تفصیلی"}</Badge></td>
      <td className="p-2.5 text-xs text-stone-500">{TYPE[a.type]}</td>
      <td className="p-2.5 text-xs">{a.nature === "debit" ? "بدهکار" : "بستانکار"}</td>
      <td className="p-2.5"><div className="flex items-center justify-end gap-2"><Switch checked={a.isActive} onChange={() => toggle(a)} label="فعال" />{!a.isSystem && <IconButton icon="trash" label="حذف" className="hover:text-rose-600" onClick={() => setDel(a)} />}</div></td>
    </tr>
  );
  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><p className="text-sm text-stone-500">ساختار سه‌سطحی: <b>کل ‹ معین ‹ تفصیلی</b>. روی حساب‌های معین و تفصیلی سند زده می‌شود.</p><Button onClick={() => { setF({ level: "tafsili", parentId: "", code: "", name: "", type: "asset" }); setOpen(true); }}><Icon name="plus" className="size-4" /> حساب جدید</Button></div>
      <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="bg-stone-50 text-xs text-stone-500"><th className="p-2.5 text-start">کد و عنوان</th><th className="p-2.5 text-start">سطح</th><th className="p-2.5 text-start">گروه</th><th className="p-2.5 text-start">ماهیت</th><th className="p-2.5" /></tr></thead>
        <tbody>{kols.map((k) => <Fragment key={k.id}>{row(k, 0)}{accounts.filter((m) => m.parentId === k.id).map((m) => <Fragment key={m.id}>{row(m, 1)}{accounts.filter((t) => t.parentId === m.id).map((t) => row(t, 2))}</Fragment>)}</Fragment>)}</tbody></table></Card>
      <Modal open={open} onClose={() => setOpen(false)} title="حساب جدید" size="sm" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button><Button onClick={save} disabled={!f.code || !f.name}>ذخیره</Button></>}>
        <div className="space-y-4">
          <Field label="سطح حساب"><Select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value, parentId: "", code: "" })}><option value="kol">کل</option><option value="moein">معین</option><option value="tafsili">تفصیلی</option></Select></Field>
          {f.level !== "kol" && <Field label={f.level === "moein" ? "زیرمجموعه‌ی حساب کل" : "زیرمجموعه‌ی حساب معین"}><Select value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value, code: nextCode(accounts.find((a) => String(a.id) === e.target.value)) })}><option value="">انتخاب…</option>{parents.map((p) => <option key={p.id} value={p.id}>{toFa(p.code)} — {p.name}</option>)}</Select></Field>}
          {f.level === "kol" && <Field label="گروه حساب"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>}
          <Field label="کد حساب" hint={parent ? `باید با ${toFa(parent.code)} شروع شود` : undefined}><Input dir="ltr" className="text-left" inputMode="numeric" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          <Field label="عنوان حساب"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثلاً تأمین‌کننده گوشت — آقای رضایی" /></Field>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} title="حذف حساب" message={`حساب «${del?.name}» حذف می‌شود (فقط در صورت نداشتن گردش).`} onClose={() => setDel(null)} onConfirm={async () => { if (!del) return; try { await api(`/api/acc/accounts/${del.id}`, { method: "DELETE" }); toast("حذف شد"); reload(); } catch (e) { toast((e as Error).message, "error"); } }} />
    </div>
  );
}

/* ------------------------------------------------------------- reports */
function useRep<T>(path: string, range: Range, extra: Record<string, string>, version: number) {
  const [d, setD] = useState<T | null>(null);
  const [err, setErr] = useState("");
  const key = qs(range, extra);
  useEffect(() => {
    let live = true;
    setD(null); setErr("");
    if (extra.account === "") return;
    api<T>(`/api/acc/reports/${path}?${key}`).then((r) => live && setD(r)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, version]);
  return { d, err };
}

function JournalTab({ range, version, openDoc }: { range: Range; version: number; openDoc: (id: number) => void }) {
  const { d, err } = useRep<{ items: (Doc & { lines: { id: number; code: string; name: string; kol: string; moein: string; debit: number; credit: number; description: string }[] })[] }>("journal", range, {}, version);
  if (err) return <ErrorState message={err} />;
  if (!d) return <Skeleton className="h-72 rounded-2xl" />;
  if (!d.items.length) return <EmptyState emoji="" title="سندی در این بازه نیست" />;
  const td = d.items.reduce((s, x) => s + x.lines.reduce((a, l) => a + l.debit, 0), 0);
  return (
    <div className="space-y-3">
      <div className="hidden text-center print:block"><h2 className="text-lg font-black">دفتر روزنامه</h2></div>
      {d.items.map((doc) => (
        <Card key={doc.id} className="overflow-hidden break-inside-avoid">
          <div className="flex flex-wrap items-center gap-3 bg-stone-50 px-4 py-2.5 text-sm"><button className="font-extrabold text-brand-600" onClick={() => openDoc(doc.id)}>سند {toFa(doc.number)}</button><span className="text-xs text-stone-500">{fmtJ(doc.date)}</span><Badge color={SRC[doc.source]?.[1]}>{SRC[doc.source]?.[0]}</Badge><span className="min-w-40 flex-1 truncate text-xs text-stone-600">{doc.description}</span></div>
          <table className="w-full text-sm"><tbody className="divide-y divide-stone-100">{doc.lines.map((l) => <tr key={l.id}><td className="w-20 p-2 ps-4 text-xs tabular-nums text-stone-400">{toFa(l.code)}</td><td className={cn("p-2", l.credit > 0 && "ps-10")}>{l.name}<span className="ms-2 text-[11px] text-stone-400">{l.moein}</span></td><td className="w-32 p-2 text-end tabular-nums">{num(l.debit)}</td><td className="w-32 p-2 pe-4 text-end tabular-nums">{num(l.credit)}</td></tr>)}</tbody></table>
        </Card>
      ))}
      <p className="text-xs text-stone-500">مجموع گردش بدهکار = بستانکار = <b>{formatNumber(td)}</b> {d.items.length >= 400 && "(نمایش ۴۰۰ سند اول؛ بازه را محدودتر کنید)"}</p>
    </div>
  );
}

function LedgerTab({ range, accounts, openDoc }: { range: Range; accounts: Acc[]; openDoc: (id: number) => void }) {
  const [acc, setAcc] = useState("");
  const { d, err } = useRep<{ account: { code: string; name: string; level: string }; opening: number; closing: number; totals: { debit: number; credit: number }; lines: { id: number; docId: number; docNumber: number; date: string; description: string; accountCode: string; accountName: string; debit: number; credit: number; balance: number }[] }>("ledger", range, { account: acc }, 0);
  const bal = (v: number) => (v === 0 ? "—" : `${formatNumber(Math.abs(v))} ${v > 0 ? "بد" : "بس"}`);
  return (
    <div className="space-y-4">
      <Card className="no-print p-4"><Field label="حساب (کل، معین یا تفصیلی)"><AccountSelect allowKol accounts={accounts} value={acc} onChange={setAcc} /></Field></Card>
      <IconText>{!acc ? <EmptyState emoji="" title="یک حساب انتخاب کنید" description="دفتر کل، معین یا تفصیلی همان حساب با مانده‌ی تجمعی نمایش داده می‌شود." /> : err ? <ErrorState message={err} /> : !d ? <Skeleton className="h-64 rounded-2xl" /> : (
        <Card className="overflow-x-auto">
          <div className="border-b border-stone-100 p-4"><h3 className="font-extrabold">{d.account.level === "kol" ? "دفتر کل" : d.account.level === "moein" ? "دفتر معین" : "دفتر تفصیلی"}: {toFa(d.account.code)} — {d.account.name}</h3><p className="mt-1 text-xs text-stone-500">مانده‌ی ابتدای دوره: <b>{bal(d.opening)}</b></p></div>
          <table className="w-full min-w-[720px] text-sm"><thead><tr className="bg-stone-50 text-xs text-stone-500"><th className="p-2.5 text-start">تاریخ</th><th className="p-2.5 text-start">سند</th><th className="p-2.5 text-start">حساب</th><th className="p-2.5 text-start">شرح</th><th className="p-2.5 text-end">بدهکار</th><th className="p-2.5 text-end">بستانکار</th><th className="p-2.5 text-end">مانده</th></tr></thead>
            <tbody className="divide-y divide-stone-100">{d.lines.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-stone-400">گردشی در این بازه نیست</td></tr>}{d.lines.map((l) => <tr key={l.id}><td className="whitespace-nowrap p-2.5 text-xs">{fmtJ(l.date)}</td><td className="p-2.5"><button className="font-bold text-brand-600" onClick={() => openDoc(l.docId)}>{toFa(l.docNumber)}</button></td><td className="p-2.5 text-xs">{toFa(l.accountCode)} {l.accountName}</td><td className="max-w-60 truncate p-2.5 text-xs text-stone-500">{l.description}</td><td className="p-2.5 text-end tabular-nums">{num(l.debit)}</td><td className="p-2.5 text-end tabular-nums">{num(l.credit)}</td><td className="p-2.5 text-end text-xs font-bold tabular-nums">{bal(l.balance)}</td></tr>)}</tbody>
            <tfoot><tr className="bg-stone-50 font-extrabold"><td colSpan={4} className="p-2.5">جمع گردش / مانده نهایی</td><td className="p-2.5 text-end">{formatNumber(d.totals.debit)}</td><td className="p-2.5 text-end">{formatNumber(d.totals.credit)}</td><td className="p-2.5 text-end text-xs">{bal(d.closing)}</td></tr></tfoot></table>
        </Card>
      )}</IconText>
    </div>
  );
}

function TrialTab({ range, version }: { range: Range; version: number }) {
  const [level, setLevel] = useState("moein");
  const [all, setAll] = useState(false);
  const { d, err } = useRep<{ rows: { id: number; code: string; name: string; parent: string; debit: number; credit: number; balDebit: number; balCredit: number }[]; totals: { debit: number; credit: number; balDebit: number; balCredit: number } }>("trial", range, { level, ...(all ? { all: "1" } : {}) }, version);
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        {[["kol", "تراز کل"], ["moein", "تراز معین"], ["tafsili", "تراز تفصیلی"]].map(([k, l]) => <button key={k} onClick={() => setLevel(k)} className={cn("rounded-xl px-4 py-2 text-sm font-semibold", level === k ? "bg-brand-500 text-white" : "bg-white ring-1 ring-stone-200")}>{l}</button>)}
        <label className="ms-2 flex items-center gap-2 text-xs text-stone-600"><input type="checkbox" className="accent-brand-500" checked={all} onChange={(e) => setAll(e.target.checked)} /> نمایش حساب‌های بدون گردش</label>
      </div>
      <IconText>{err ? <ErrorState message={err} /> : !d ? <Skeleton className="h-72 rounded-2xl" /> : d.rows.length === 0 ? <EmptyState emoji="" title="گردشی ثبت نشده" /> : (
        <Card className="overflow-x-auto">
          <div className="border-b border-stone-100 p-4 text-center"><h3 className="font-extrabold">تراز آزمایشی {level === "kol" ? "حساب‌های کل" : level === "moein" ? "حساب‌های معین" : "حساب‌های تفصیلی"} (۴ ستونی)</h3></div>
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="bg-stone-50 text-xs text-stone-500"><th rowSpan={2} className="p-2.5 text-start">کد</th><th rowSpan={2} className="p-2.5 text-start">نام حساب</th><th colSpan={2} className="border-x border-stone-200 p-2 text-center">گردش</th><th colSpan={2} className="p-2 text-center">مانده</th></tr><tr className="bg-stone-50 text-xs text-stone-500"><th className="border-s border-stone-200 p-2 text-end">بدهکار</th><th className="border-e border-stone-200 p-2 text-end">بستانکار</th><th className="p-2 text-end">بدهکار</th><th className="p-2 text-end">بستانکار</th></tr></thead>
            <tbody className="divide-y divide-stone-100">{d.rows.map((r) => <tr key={r.id}><td className="p-2.5 tabular-nums">{toFa(r.code)}</td><td className="p-2.5">{r.name}{level !== "kol" && <span className="ms-2 text-[11px] text-stone-400">{r.parent}</span>}</td><td className="p-2.5 text-end tabular-nums">{num(r.debit)}</td><td className="p-2.5 text-end tabular-nums">{num(r.credit)}</td><td className="p-2.5 text-end font-semibold tabular-nums">{num(r.balDebit)}</td><td className="p-2.5 text-end font-semibold tabular-nums">{num(r.balCredit)}</td></tr>)}</tbody>
            <tfoot><tr className="bg-stone-100 font-extrabold"><td colSpan={2} className="p-2.5">جمع</td><td className="p-2.5 text-end">{formatNumber(d.totals.debit)}</td><td className="p-2.5 text-end">{formatNumber(d.totals.credit)}</td><td className="p-2.5 text-end">{formatNumber(d.totals.balDebit)}</td><td className="p-2.5 text-end">{formatNumber(d.totals.balCredit)}</td></tr></tfoot>
          </table>
          {level === "tafsili" ? <p className="m-4 rounded-xl bg-stone-50 px-4 py-2.5 text-xs text-stone-600">تراز تفصیلی فقط حساب‌های تفصیلی را نشان می‌دهد و (چون بخشی از گردش روی حساب‌های معین ثبت شده) لزوماً متعادل نیست؛ برای کنترل تعادل از تراز کل یا معین استفاده کنید.</p> : <p className={cn("m-4 rounded-xl px-4 py-2.5 text-sm font-bold", d.totals.debit === d.totals.credit && d.totals.balDebit === d.totals.balCredit ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>{d.totals.debit === d.totals.credit && d.totals.balDebit === d.totals.balCredit ? " تراز آزمایشی برقرار است (جمع بدهکار = جمع بستانکار)" : " تراز آزمایشی برقرار نیست"}</p>}
        </Card>
      )}</IconText>
    </div>
  );
}

type Row = { code: string; name: string; amount: number };
function Sec({ title, rows, total, neg }: { title: string; rows: Row[]; total?: number; neg?: boolean }) {
  return <><tr className="bg-stone-50"><td colSpan={2} className="p-2.5 text-xs font-extrabold text-stone-600">{title}</td></tr>{rows.map((r) => <tr key={r.code + r.name}><td className="p-2.5 ps-6">{r.name}</td><td className="p-2.5 text-end tabular-nums">{neg ? `(${formatNumber(r.amount)})` : formatNumber(r.amount)}</td></tr>)}{total !== undefined && <tr className="font-bold"><td className="p-2.5 ps-6">جمع {title}</td><td className="p-2.5 text-end tabular-nums">{formatNumber(total)}</td></tr>}</>;
}
function StatementsTab({ range, version }: { range: Range; version: number }) {
  type S = { income: { revenue: Row[]; cogs: Row[]; expenses: Row[]; other: Row[]; totals: { revenue: number; cogs: number; gross: number; expenses: number; operating: number; other: number; net: number } }; balance: { assets: Row[]; liabilities: Row[]; equity: Row[]; totals: { assets: number; liabilities: number; equity: number } } };
  const { d, err } = useRep<S>("statements", range, {}, version);
  if (err) return <ErrorState message={err} />;
  if (!d) return <Skeleton className="h-72 rounded-2xl" />;
  const { income: i, balance: b } = d;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="overflow-hidden"><div className="border-b p-4 text-center font-extrabold">صورت سود و زیان</div>
        <table className="w-full text-sm"><tbody className="divide-y divide-stone-100">
          <Sec title="درآمدهای عملیاتی (پس از کسر تخفیف)" rows={i.revenue} total={i.totals.revenue} />
          <Sec title="بهای تمام‌شده" rows={i.cogs} total={i.totals.cogs} neg />
          <tr className="bg-emerald-50 font-extrabold"><td className="p-2.5">سود ناخالص</td><td className="p-2.5 text-end">{formatNumber(i.totals.gross)}</td></tr>
          <Sec title="هزینه‌های عملیاتی" rows={i.expenses} total={i.totals.expenses} neg />
          <tr className="bg-stone-50 font-bold"><td className="p-2.5">سود عملیاتی</td><td className="p-2.5 text-end">{formatNumber(i.totals.operating)}</td></tr>
          <Sec title="سایر درآمدها" rows={i.other} total={i.totals.other} />
          <tr className={cn("font-black", i.totals.net >= 0 ? "bg-emerald-100" : "bg-rose-100")}><td className="p-3">سود (زیان) خالص</td><td className="p-3 text-end">{formatNumber(i.totals.net)}</td></tr>
        </tbody></table></Card>
      <Card className="overflow-hidden"><div className="border-b p-4 text-center font-extrabold">ترازنامه</div>
        <table className="w-full text-sm"><tbody className="divide-y divide-stone-100">
          <Sec title="دارایی‌ها" rows={b.assets} total={b.totals.assets} />
          <Sec title="بدهی‌ها" rows={b.liabilities} total={b.totals.liabilities} />
          <Sec title="حقوق صاحبان سرمایه" rows={b.equity} total={b.totals.equity} />
          <tr className="bg-stone-100 font-extrabold"><td className="p-3">جمع بدهی‌ها و حقوق صاحبان سرمایه</td><td className="p-3 text-end">{formatNumber(b.totals.liabilities + b.totals.equity)}</td></tr>
        </tbody></table>
        <p className={cn("m-4 rounded-xl px-4 py-2.5 text-sm font-bold", b.totals.assets === b.totals.liabilities + b.totals.equity ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}><IconText>{b.totals.assets === b.totals.liabilities + b.totals.equity ? " ترازنامه متعادل است" : `اختلاف: ${formatNumber(Math.abs(b.totals.assets - b.totals.liabilities - b.totals.equity))}`}</IconText></p>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- years */
function YearsTab({ years, reload }: { years: Year[]; reload: () => void }) {
  const toast = useToast();
  const [closing, setClosing] = useState<Year | null>(null);
  const [newYear, setNewYear] = useState(String(toJ(new Date()).jy + 1));
  const [busy, setBusy] = useState("");
  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try { toast(await fn()); reload(); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(""); }
  };
  void jYearRange;
  return (
    <div className="space-y-5">
      <Card className="divide-y divide-stone-100">
        <IconText>{years.map((y) => (
          <div key={y.id} className="flex flex-wrap items-center gap-3 p-4">
            <span className="text-2xl">{y.isClosed ? "" : ""}</span>
            <div className="min-w-40 flex-1"><p className="font-extrabold">{y.title}</p><p className="text-xs text-stone-500">{fmtJ(y.startDate)} تا {fmtJ(y.endDate)}</p></div>
            {y.isClosed ? <Badge color="stone">بسته‌شده</Badge> : <Badge color="emerald">باز</Badge>}
            {!y.isClosed && <Button size="sm" variant="secondary" onClick={() => setClosing(y)}>بستن سال مالی</Button>}
          </div>
        ))}</IconText>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="space-y-3 p-5"><h3 className="font-bold">تعریف سال مالی جدید</h3><div className="flex gap-2"><Input inputMode="numeric" dir="ltr" className="text-center" value={newYear} onChange={(e) => setNewYear(e.target.value)} /><Button loading={busy === "y"} onClick={() => run("y", async () => { await api("/api/acc/years", { method: "POST", body: { year: Number(faToEn(newYear)) } }); return "سال مالی ایجاد شد"; })}>ایجاد</Button></div><p className="text-xs text-stone-400">سال مالی از ۱ فروردین تا پایان اسفند همان سال شمسی است.</p></Card>
        <Card className="space-y-3 p-5"><h3 className="font-bold">ثبت خودکار استهلاک ماهانه</h3><p className="text-xs leading-6 text-stone-500">بر اساس دارایی‌های ثبت‌شده (روش خط مستقیم) سند «هزینه استهلاک / استهلاک انباشته» برای ماه جاری صادر می‌شود (هر ماه یک‌بار).</p><Button variant="secondary" loading={busy === "d"} onClick={() => run("d", async () => { await api("/api/acc/depreciation", { method: "POST", body: {} }); return "سند استهلاک ثبت شد"; })}>ثبت استهلاک این ماه</Button></Card>
      </div>
      <Modal open={!!closing} onClose={() => setClosing(null)} title={closing ? `بستن ${closing.title}` : ""} size="sm" footer={<><Button variant="ghost" onClick={() => setClosing(null)}>انصراف</Button><Button variant="danger" loading={busy === "c"} onClick={() => { const y = closing!; run("c", async () => { const r = await api<{ profit: number; nextYear: string }>(`/api/acc/years/${y.id}/close`, { method: "POST", body: {} }); setClosing(null); return `سال بسته شد؛ ${r.profit >= 0 ? "سود" : "زیان"} ${formatNumber(Math.abs(r.profit))} به سود انباشته منتقل و سند افتتاحیه ${r.nextYear} صادر شد`; }); }}>بستن قطعی سال</Button></>}>
        <ol className="list-decimal space-y-2 ps-5 text-sm leading-7 text-stone-600"><li>حساب‌های موقت (درآمد و هزینه) به «خلاصه سود و زیان» بسته می‌شوند.</li><li>سود/زیان به «سود (زیان) انباشته» منتقل می‌شود.</li><li>سند اختتامیه برای حساب‌های دائم صادر می‌شود.</li><li>سال جدید با سند افتتاحیه (مانده‌های ابتدای دوره) ساخته می‌شود.</li></ol>
        <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">پس از بستن، ثبت یا ویرایش سند در این سال ممکن نیست. پیش‌نویس‌ها باید قبلاً قطعی یا حذف شده باشند.</p>
      </Modal>
    </div>
  );
}
void useMemo;
