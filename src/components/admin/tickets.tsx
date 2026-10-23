"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatTime, timeAgo, toFa } from "@/lib/format";
import { fmtJ } from "@/lib/jalali";
import { planName } from "@/lib/plans";
import { ADMIN_DEPTS, DEPT_TICKETS, PRIORITY, TICKET_DEPTS, TICKET_STATUS } from "@/lib/admin-meta";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, Modal, Select, Skeleton, Textarea, cn, useToast, iconGlyph, EmojiIcon, IconText} from "@/components/ui";
import { PLAN_COLOR, useGet, type Me } from "@/components/admin/common";

const CANNED = [
  ["سلام و وقت بخیر؛ مشکل شما در حال بررسی است و نتیجه را اطلاع می‌دهیم.", "در حال بررسی"],
  ["لطفاً تصویر صفحه یا مرحله‌ای که خطا رخ می‌دهد را برای ما ارسال کنید.", "درخواست تصویر"],
  ["مشکل برطرف شد. در صورت تکرار، همین تیکت را پاسخ دهید تا دوباره بررسی کنیم.", "رفع شد"],
  ["برای این درخواست لازم است پلن شما ارتقا یابد؛ فاکتور صادر و برایتان ارسال می‌شود.", "ارتقای پلن"],
] as const;

export function AdminTickets({ me, params }: { me: Me; params: Record<string, string> }) {
  const ownDept = DEPT_TICKETS[me.dept] ?? [];
  const [dept, setDept] = useState(params.dept ?? (me.dept === "super" ? "" : ownDept[0] ?? ""));
  const [status, setStatus] = useState(params.status ?? "");
  const [assigned, setAssigned] = useState(params.assigned ?? "");
  const [q, setQ] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const url = `/api/admin/tickets?dept=${dept}&status=${status}&assigned=${assigned}&q=${encodeURIComponent(q)}`;
  const list = useGet<{ items: any[]; counts: { dept: string; st: string; n: number }[] }>(url, 15000);
  const [openId, setOpenId] = useState<number | null>(null);
  const [agents, setAgents] = useState<{ id: number; name: string; dept: string }[]>([]);
  useEffect(() => { api<{ items: typeof agents }>("/api/admin/agents").then((r) => setAgents(r.items)).catch(() => {}); }, []);
  const cnt = (d: string) => (list.data?.counts ?? []).filter((c) => (!d || c.dept === d) && c.st === "open").reduce((s, c) => s + c.n, 0);
  const activeFilterCount = Number(!!status) + Number(!!assigned) + Number(!!q.trim());
  const filterControls = () => <>
    <Select aria-label="فیلتر وضعیت تیکت" className="w-full shrink-0 sm:w-36" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">همه وضعیت‌ها</option>{Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</Select>
    <Select aria-label="فیلتر کارشناس تیکت" className="w-full shrink-0 sm:w-44" value={assigned} onChange={(e) => setAssigned(e.target.value)}><option value="">همه کارشناسان</option><option value="me">تیکت‌های من</option><option value="none">بدون کارشناس</option></Select>
    <div className="relative min-w-0 sm:flex-1"><Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><Input aria-label="جست‌وجوی تیکت‌ها" className="w-full ps-9" placeholder="موضوع، کسب‌وکار یا شماره…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
  </>;

  return (
    <div className="animate-fade-in">
      <div className="mb-5"><h1 className="text-xl font-extrabold sm:text-2xl">تیکت‌های پشتیبانی</h1><p className="mt-1 text-sm text-stone-500">پاسخ به مشتریان، یادداشت داخلی، تخصیص به کارشناس و ارجاع به دپارتمان‌های دیگر</p></div>
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
        <IconText>{[["", "همه بخش‌ها", ""], ...Object.entries(TICKET_DEPTS).map(([k, v]) => [k, v.label, v.emoji])].map(([k, l, e]) => (
          <button key={k} onClick={() => setDept(k)} className={cn("flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold", dept === k ? "bg-stone-900 text-white shadow" : "bg-white ring-1 ring-stone-200 hover:bg-stone-50")}>{e} {l}{cnt(k) > 0 && <span className={cn("rounded-full px-1.5 text-[11px] font-extrabold", dept === k ? "bg-amber-400 text-stone-900" : "bg-amber-100 text-amber-800")}>{toFa(cnt(k))}</span>}</button>
        ))}</IconText>
      </div>
      <div className="mb-4 hidden min-w-0 items-center gap-2 sm:flex sm:flex-nowrap">
        {filterControls()}
      </div>
      <div className="relative mb-4 sm:hidden">
        <button type="button" aria-label={mobileFiltersOpen ? "بستن فیلترها" : "نمایش فیلترها"} aria-expanded={mobileFiltersOpen} aria-controls="admin-ticket-mobile-filters" onClick={() => setMobileFiltersOpen((value) => !value)} className={cn("btn btn-ghost btn-square relative size-10 rounded-xl border bg-base-100 shadow-sm", mobileFiltersOpen || activeFilterCount ? "border-primary/40 text-primary" : "border-base-300 text-base-content/70")}>
          <Icon name="filter" className="size-[18px]" />
          {!!activeFilterCount && <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-content">{toFa(activeFilterCount)}</span>}
        </button>
        {mobileFiltersOpen && <div id="admin-ticket-mobile-filters" className="mt-2 grid gap-2 rounded-2xl border border-base-300 bg-base-100 p-3 shadow-lg">
          {filterControls()}
        </div>}
      </div>
      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        <div className="space-y-2 xl:max-h-[calc(100dvh-16rem)] xl:overflow-y-auto xl:pe-1">
          <IconText>{list.loading && !list.data ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />) : !list.data?.items.length ? <EmptyState emoji="" title="تیکتی پیدا نشد" description="فیلترها را تغییر دهید." /> : list.data.items.map((t) => (
            <button key={t.id} onClick={() => setOpenId(t.id)} className={cn("w-full rounded-2xl bg-white p-3.5 text-start ring-1 transition", openId === t.id ? "ring-2 ring-brand-400" : "ring-stone-200 hover:ring-brand-300")}>
              <div className="flex items-start justify-between gap-2"><p className="font-bold leading-6">{t.subject}</p><Badge color={TICKET_STATUS[t.status]?.[1]}>{TICKET_STATUS[t.status]?.[0]}</Badge></div>
              <p className="mt-0.5 text-xs text-stone-500">#{toFa(t.id)} · {t.businessName}</p>
              <p className="mt-1.5 line-clamp-1 text-xs text-stone-500">{t.lastFrom === "support" ? " " : ""}{t.lastMessage}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]"><Badge color="blue">{<EmojiIcon emoji={TICKET_DEPTS[t.department]?.emoji} /> } {TICKET_DEPTS[t.department]?.label}</Badge>{t.priority === "high" && <Badge color="rose">فوری</Badge>}<span className="text-stone-400">{t.agentName ? ` ${t.agentName}` : "بدون کارشناس"}</span><span className="ms-auto text-stone-400">{timeAgo(t.updatedAt)}</span></div>
            </button>
          ))}</IconText>
        </div>
        <Thread key={openId ?? "none"} id={openId} me={me} agents={agents} changed={() => list.reload(true)} />
      </div>
    </div>
  );
}

function Thread({ id, me, agents, changed }: { id: number | null; me: Me; agents: { id: number; name: string; dept: string }[]; changed: () => void }) {
  const toast = useToast();
  const { data: d, loading, reload } = useGet<any>(id ? `/api/admin/tickets/${id}` : null, 10000);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [busy, setBusy] = useState(false);
  const [xfer, setXfer] = useState<{ department: string; note: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [d?.messages?.length]);
  const act = useCallback(async (body: Record<string, unknown>, msg?: string) => {
    setBusy(true);
    try { await api(`/api/admin/tickets/${id}`, { method: "PATCH", body }); if (msg) toast(msg); await reload(true); changed(); return true; } catch (e) { toast((e as Error).message, "error"); return false; } finally { setBusy(false); }
  }, [id, reload, changed, toast]);

  if (!id) return <Card className="hidden min-h-[28rem] items-center justify-center text-sm text-stone-400 xl:flex">یک تیکت را از فهرست انتخاب کنید</Card>;
  if (loading && !d) return <Skeleton className="min-h-[28rem] rounded-2xl" />;
  if (!d) return null;
  const t = d.ticket;
  async function send() {
    if (!text.trim()) return;
    if (await act(mode === "reply" ? { reply: text } : { note: text }, mode === "reply" ? "پاسخ ارسال شد" : "یادداشت داخلی ثبت شد")) setText("");
  }
  return (
    <Card className="flex min-h-[28rem] flex-col xl:max-h-[calc(100dvh-16rem)]">
      <div className="space-y-3 border-b border-stone-100 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-extrabold">{t.subject}</h3><p className="mt-0.5 text-xs text-stone-500">#{toFa(t.id)} · <b>{t.businessName}</b> <Badge color={PLAN_COLOR[t.plan]}>{planName(t.plan)}</Badge> · {fmtJ(t.createdAt)}</p></div><Badge color={TICKET_STATUS[t.status]?.[1]}>{TICKET_STATUS[t.status]?.[0]}</Badge></div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setXfer({ department: Object.keys(TICKET_DEPTS).find((k) => k !== t.department) ?? "support", note: "" })}><IconText>{<EmojiIcon emoji="" />}</IconText> انتقال به دپارتمان</Button>
          <Select className="!h-8 w-40 !text-xs" value={t.assignedTo ?? ""} disabled={busy} onChange={(e) => act({ assignedTo: e.target.value ? Number(e.target.value) : null }, "تخصیص انجام شد")}><option value="">بدون کارشناس</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({ADMIN_DEPTS[a.dept]?.label ?? a.dept})</option>)}</Select>
          {t.assignedTo !== me.id && <Button size="sm" variant="ghost" onClick={() => act({ assignedTo: me.id }, "تیکت را برعهده گرفتید")}>برعهده‌گرفتن</Button>}
          <Select className="!h-8 w-28 !text-xs" value={t.priority} disabled={busy} onChange={(e) => act({ priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>اولویت {v[0]}</option>)}</Select>
          {t.status === "closed" ? <Button size="sm" variant="secondary" onClick={() => act({ status: "open" }, "تیکت بازگشایی شد")}>بازگشایی</Button> : <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => act({ status: "closed" }, "تیکت بسته شد")}>بستن</Button>}
        </div>
        <p className="text-xs text-stone-500"><Badge color="blue">{<EmojiIcon emoji={TICKET_DEPTS[t.department]?.emoji} /> } {TICKET_DEPTS[t.department]?.label}</Badge> {t.agentName && <span className="ms-2">کارشناس: <b>{t.agentName}</b></span>}</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <IconText>{d.messages.map((m: any) => m.authorRole === "system" ? (
          <div key={m.id} className={cn("mx-auto max-w-[92%] rounded-full px-4 py-1.5 text-center text-xs", m.internal ? "bg-stone-100 text-stone-500" : "bg-sky-50 text-sky-800")}>{m.internal ? "" : ""} {m.body} · {formatTime(m.createdAt)}</div>
        ) : (
          <div key={m.id} className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7", m.authorRole === "user" ? "me-auto bg-stone-100" : m.authorRole === "note" ? "ms-auto border-2 border-dashed border-amber-300 bg-amber-50" : "ms-auto bg-emerald-50")}>
            <p className="mb-1 text-[11px] font-bold text-stone-500">{m.authorRole === "note" ? " یادداشت داخلی — " : ""}{m.authorName} · {formatTime(m.createdAt)}</p><p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}</IconText>
        <div ref={end} />
      </div>
      <div className="space-y-2 border-t border-stone-100 p-4">
        <div className="flex items-center gap-2 text-xs"><button onClick={() => setMode("reply")} className={cn("rounded-lg px-3 py-1.5 font-bold", mode === "reply" ? "bg-emerald-600 text-white" : "bg-stone-100")}>پاسخ به مشتری</button><button onClick={() => setMode("note")} className={cn("rounded-lg px-3 py-1.5 font-bold", mode === "note" ? "bg-amber-500 text-white" : "bg-stone-100")}><IconText>{<EmojiIcon emoji="" />}</IconText> یادداشت داخلی</button>
          {mode === "reply" && <div className="no-scrollbar ms-auto flex gap-1.5 overflow-x-auto">{CANNED.map(([body, label]) => <button key={label} onClick={() => setText(body)} className="shrink-0 rounded-lg bg-stone-50 px-2.5 py-1.5 text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100">{label}</button>)}</div>}</div>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "reply" ? "پاسخ شما به مشتری…" : "یادداشتی که فقط تیم می‌بیند…"} />
        <div className="flex justify-end"><Button onClick={send} loading={busy} disabled={!text.trim()} variant={mode === "note" ? "secondary" : "primary"}>{mode === "reply" ? "ارسال پاسخ" : "ثبت یادداشت"}</Button></div>
        {d.others.length > 0 && <p className="text-[11px] text-stone-400">تیکت‌های دیگر این مشتری: {d.others.map((o: any) => `#${toFa(o.id)}`).join("، ")}</p>}
      </div>
      <Modal open={!!xfer} onClose={() => setXfer(null)} size="sm" title="انتقال تیکت به دپارتمان دیگر" footer={<><Button variant="ghost" onClick={() => setXfer(null)}>انصراف</Button><Button loading={busy} onClick={async () => { if (xfer && (await act({ department: xfer.department, transferNote: xfer.note }, `تیکت به «${TICKET_DEPTS[xfer.department].label}» ارجاع شد`))) setXfer(null); }}>انتقال</Button></>}>
        {xfer && <div className="space-y-4"><p className="text-sm text-stone-600">بخش فعلی: <b>{TICKET_DEPTS[t.department]?.label}</b></p>
          <div className="grid gap-2">{Object.entries(TICKET_DEPTS).filter(([k]) => k !== t.department).map(([k, v]) => <button key={k} onClick={() => setXfer({ ...xfer, department: k })} className={cn("flex items-center gap-3 rounded-xl px-4 py-3 text-start text-sm font-bold ring-1 transition", xfer.department === k ? "bg-stone-900 text-white ring-stone-900" : "bg-white ring-stone-200 hover:bg-stone-50")}><span className="text-xl">{<EmojiIcon emoji={v.emoji} /> }</span>{v.label}</button>)}</div>
          <Field label="توضیح برای دپارتمان مقصد (اختیاری)"><Textarea rows={2} value={xfer.note} onChange={(e) => setXfer({ ...xfer, note: e.target.value })} placeholder="مثلاً: مشتری درخواست استرداد وجه دارد" /></Field>
          <p className="text-xs leading-6 text-stone-500">تخصیص کارشناس فعلی برداشته می‌شود و کارشناسان آن بخش تیکت را می‌بینند. رویداد ارجاع در گفتگو ثبت می‌شود و مشتری نام بخش جدید را می‌بیند.</p></div>}
      </Modal>
    </Card>
  );
}
void Icon;
