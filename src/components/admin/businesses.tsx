"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatCompact, formatDate, formatNumber, formatPrice, timeAgo, toFa } from "@/lib/format";
import { fmtJ } from "@/lib/jalali";
import { JalaliInput } from "@/components/jalali-input";
import { FEATURES, GROUPS, PLANS, planName, resolveFeatures, type Level } from "@/lib/plans";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, Input, Modal, Select, Skeleton, Textarea, cn, useToast, iconGlyph, EmojiIcon, IconText} from "@/components/ui";
import { PLAN_COLOR, useGet, type Me } from "@/components/admin/common";

const FILTERS: [string, string][] = [["all", "همه"], ["active", "فعال"], ["suspended", "مسدود"], ["upgrade", "درخواست ارتقا"], ["expiring", "رو به پایان"], ["expired", "منقضی"], ["inactive", "بدون سفارش ۳۰ روز اخیر"]];

export function Businesses({ me, params }: { me: Me; params: Record<string, string> }) {
  const toast = useToast();
  const { data, error, loading, reload } = useGet<{ items: any[] }>("/api/admin/businesses");
  const [now, setNow] = useState(0);
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("all");
  const [filter, setFilter] = useState(params.filter ?? "all");
  const [sel, setSel] = useState<number | null>(params.open ? Number(params.open) : null);
  const [creating, setCreating] = useState(false);
  const write = me.perms.includes("businesses_write");

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);

  const rows = useMemo(() => {
    return (data?.items ?? []).filter((b) => {
      if (b.isAdmin) return false;
      const t = q.trim();
      if (t && !(b.name.includes(t) || b.slug.includes(t) || b.ownerEmail.includes(t) || b.ownerName.includes(t))) return false;
      if (plan !== "all" && b.plan !== plan) return false;
      const end = b.subscriptionEndsAt ? new Date(b.subscriptionEndsAt).getTime() : null;
      if (filter === "active") return !b.isSuspended;
      if (filter === "suspended") return b.isSuspended;
      if (filter === "upgrade") return !!b.upgradeRequest;
      if (filter === "expiring") return end !== null && b.plan !== "basic" && end > now && end < now + 14 * 86400_000;
      if (filter === "expired") return end !== null && b.plan !== "basic" && end < now;
      if (filter === "inactive") return !b.lastOrderAt || now - new Date(b.lastOrderAt).getTime() > 30 * 86400_000;
      return true;
    });
  }, [data, q, plan, filter, now]);

  async function quick(b: any, body: Record<string, unknown>, msg: string) {
    try { await api(`/api/admin/businesses/${b.id}`, { method: "PATCH", body }); toast(msg); reload(true); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function enter(b: any) {
    try { await api(`/api/admin/businesses/${b.id}/impersonate`, { method: "POST", body: {} }); location.href = "/dashboard"; } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-xl font-extrabold sm:text-2xl">کسب‌وکارها</h1><p className="mt-1 text-sm text-stone-500">مدیریت اشتراک، دسترسی‌ها و وضعیت هر رستوران</p></div>
        {write && <Button onClick={() => setCreating(true)}><Icon name="plus" className="size-4" /> کسب‌وکار جدید</Button>}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64"><Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><Input className="ps-9" placeholder="نام، آدرس منو، ایمیل مالک…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select className="w-40" value={plan} onChange={(e) => setPlan(e.target.value)}><option value="all">همه پلن‌ها</option>{PLANS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</Select>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">{FILTERS.map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={cn("shrink-0 rounded-xl px-3 py-2 text-xs font-semibold", filter === k ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200")}>{l}</button>)}</div>
      </div>
      <IconText>{error ? <ErrorState message={error} onRetry={() => reload()} /> : loading && !data ? <Skeleton className="h-72 rounded-2xl" /> : rows.length === 0 ? <EmptyState emoji="" title="کسب‌وکاری پیدا نشد" description="فیلتر یا عبارت جستجو را تغییر دهید." /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="border-b bg-stone-50 text-xs text-stone-500"><th className="p-3 text-start">کسب‌وکار</th><th className="p-3 text-start">مالک</th><th className="p-3 text-start">پلن و اشتراک</th><th className="p-3 text-start">سفارش</th><th className="p-3 text-start">فروش ۳۰ روز</th><th className="p-3 text-start">وضعیت</th><th className="p-3" /></tr></thead>
            <tbody className="divide-y divide-stone-100">{rows.map((b) => {
              const end = b.subscriptionEndsAt ? new Date(b.subscriptionEndsAt) : null;
              const expired = end && b.plan !== "basic" && end.getTime() < now;
              return (
                <tr key={b.id} className={cn("hover:bg-stone-50/70", b.isSuspended && "bg-rose-50/50")}>
                  <td className="p-3"><button onClick={() => setSel(b.id)} className="text-start font-bold hover:text-brand-600">{b.name}</button><p className="text-xs text-stone-400" dir="ltr" style={{ textAlign: "start" }}>/m/{b.slug}{b.customDomain ? ` · ${b.customDomain}` : ""}</p></td>
                  <td className="p-3"><p className="text-xs font-semibold">{b.ownerName}</p><p className="text-[11px] text-stone-400" dir="ltr" style={{ textAlign: "start" }}>{b.ownerEmail}</p></td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-1.5"><Badge color={PLAN_COLOR[b.plan]}>{planName(b.plan)}</Badge>{expired && <Badge color="rose">منقضی ← پایه</Badge>}</div>
                    <p className="mt-1 text-[11px] text-stone-500">{end ? `تا ${fmtJ(end)}` : b.plan === "basic" ? "—" : "بدون محدودیت زمانی"}</p>
                    {b.upgradeRequest && <p className="mt-1 text-[11px] font-bold text-sky-700">درخواست: {planName(b.upgradeRequest)}</p>}
                  </td>
                  <td className="p-3 text-xs"><b>{toFa(b.ordersCount)}</b><p className="text-stone-400">{b.lastOrderAt ? timeAgo(b.lastOrderAt) : "—"}</p></td>
                  <td className="p-3 text-xs font-bold">{b.gmv30 ? formatCompact(b.gmv30) : "—"}</td>
                  <td className="p-3">{b.isSuspended ? <Badge color="rose">مسدود</Badge> : <Badge color="emerald">فعال</Badge>}{Object.keys(b.featureOverrides).length > 0 && <Badge color="violet" className="ms-1">{toFa(Object.keys(b.featureOverrides).length)} استثنا</Badge>}</td>
                  <td className="p-2"><div className="flex justify-end gap-1.5">
                    {b.upgradeRequest && write && <Button size="sm" onClick={() => quick(b, { approveUpgrade: true }, "ارتقا تأیید شد")}>تأیید ارتقا</Button>}
                    {me.perms.includes("impersonate") && <Button size="sm" variant="secondary" title="ورود به‌جای مالک" onClick={() => enter(b)}>ورود به حساب</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setSel(b.id)}>جزئیات</Button>
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table>
        </Card>
      )}</IconText>
      <p className="mt-3 text-xs text-stone-400">{toFa(rows.length)} مورد از {toFa((data?.items ?? []).filter((b) => !b.isAdmin).length)}</p>
      <Detail id={sel} onClose={() => setSel(null)} me={me} changed={() => reload(true)} />
      <Create open={creating} onClose={() => setCreating(false)} done={() => { setCreating(false); reload(true); }} />
    </div>
  );
}

function Create({ open, onClose, done }: { open: boolean; onClose: () => void; done: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", businessName: "", email: "", password: "", plan: "basic", months: "12" });
  const [res, setRes] = useState<{ email: string; password: string; slug: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset this create form when its modal opens
    if (open) { setRes(null); setF({ name: "", businessName: "", email: "", password: "", plan: "basic", months: "12" }); }
  }, [open]);
  async function save() {
    setBusy(true);
    try { const r = await api<{ item: { email: string; password: string; slug: string } }>("/api/admin/businesses", { method: "POST", body: { ...f, months: Number(f.months) } }); setRes(r.item); toast("کسب‌وکار ساخته شد"); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={res ? done : onClose} title="کسب‌وکار جدید" footer={res ? <Button onClick={done}>تمام</Button> : <><Button variant="ghost" onClick={onClose}>انصراف</Button><Button onClick={save} loading={busy}>ساخت حساب</Button></>}>
      {res ? (
        <div className="space-y-3"><p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">حساب ساخته شد. مشخصات ورود را به مالک بدهید (رمز فقط همین یک‌بار نمایش داده می‌شود):</p>
          <div className="space-y-2 rounded-xl bg-stone-900 p-4 text-left text-sm text-emerald-300" dir="ltr"><p>Email: {res.email}</p><p>Password: {res.password}</p><p>Menu: /m/{res.slug}</p></div>
          <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(`ایمیل: ${res.email}\nرمز: ${res.password}`).then(() => toast("کپی شد"))}>کپی</Button></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نام مالک *"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="نام کسب‌وکار *"><Input value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} /></Field>
          <Field label="ایمیل ورود *"><Input dir="ltr" className="text-left" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="رمز عبور" hint="خالی = ساخت خودکار"><Input dir="ltr" className="text-left" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="پلن"><Select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>{PLANS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</Select></Field>
          {f.plan !== "basic" && <Field label="مدت اشتراک (ماه)" hint="۰ = بدون محدودیت زمانی"><Input inputMode="numeric" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} /></Field>}
        </div>
      )}
    </Modal>
  );
}

function Detail({ id, onClose, me, changed }: { id: number | null; onClose: () => void; me: Me; changed: () => void }) {
  const toast = useToast();
  const write = me.perms.includes("businesses_write");
  const { data: d, loading, reload } = useGet<any>(id ? `/api/admin/businesses/${id}` : null);
  const [ov, setOv] = useState<Record<string, boolean>>({});
  const [matrix, setMatrix] = useState<any>(null);
  const [note, setNote] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [showOv, setShowOv] = useState(false);
  const [pwd, setPwd] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [confirm, setConfirm] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the detail form for the selected business
    if (d) { setOv({ ...(d.business.featureOverrides ?? {}) }); setNote(d.business.adminNote ?? ""); setEndsAt(d.business.subscriptionEndsAt ?? ""); setPwd(null); setShowOv(false); }
  }, [d]);
  useEffect(() => { if (id && me.perms.includes("plans") && !matrix) api<any>("/api/admin/plans").then((r) => setMatrix(r.overrides)).catch(() => setMatrix({})); }, [id, me.perms, matrix]);
  const patch = async (body: Record<string, unknown>, msg = "ذخیره شد") => { try { await api(`/api/admin/businesses/${id}`, { method: "PATCH", body }); toast(msg); reload(true); changed(); } catch (e) { toast((e as Error).message, "error"); } };
  const b = d?.business;
  const eff = b ? resolveFeatures(b.plan, ov, matrix ?? {}) : {};
  const base = b ? resolveFeatures(b.plan, {}, matrix ?? {}) : {};
  return (
    <Modal open={!!id} onClose={onClose} size="lg" title={b ? `${b.name}` : "…"}>
      <IconText>{loading && !d ? <Skeleton className="h-72" /> : !d ? null : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-xs"><Badge color={PLAN_COLOR[b.plan]}>{planName(b.plan)}</Badge>{b.effectivePlan !== b.plan && <Badge color="rose">در عمل: {planName(b.effectivePlan)} (اشتراک منقضی)</Badge>}{b.isSuspended ? <Badge color="rose">مسدود</Badge> : <Badge color="emerald">فعال</Badge>}<span className="text-stone-500">ثبت‌نام {formatDate(b.createdAt)}</span><a className="font-bold text-brand-600" target="_blank" href={`/m/${b.slug}`} dir="ltr">/m/{b.slug}</a></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="space-y-1 bg-stone-50 p-4 text-sm shadow-none"><p className="text-xs font-bold text-stone-500">مالک</p><p className="font-bold">{d.owner.name}</p><p className="text-xs" dir="ltr" style={{ textAlign: "start" }}>{d.owner.email}</p>{write && <Button size="sm" variant="secondary" className="mt-2" onClick={async () => { try { const r = await api<{ password: string }>(`/api/admin/businesses/${id}/reset-password`, { method: "POST", body: {} }); setPwd(r.password); } catch (e) { toast((e as Error).message, "error"); } }}>{<EmojiIcon emoji="" />} بازنشانی رمز</Button>}{pwd && <p className="mt-2 rounded-lg bg-stone-900 p-3 text-left text-sm text-emerald-300" dir="ltr">New password: <b>{pwd}</b></p>}</Card>
            <Card className="grid grid-cols-3 gap-2 bg-stone-50 p-4 text-center shadow-none">{([["محصول", d.usage.products], ["میز", d.usage.tables], ["کارمند", d.usage.staff], ["مشتری", d.usage.customers], ["سفارش", d.usage.orders], ["دسته", d.usage.categories]] as [string, number][]).map(([l, v]) => <div key={l}><p className="text-lg font-black">{toFa(v)}</p><p className="text-[10px] text-stone-500">{l}</p></div>)}<p className="col-span-3 mt-1 text-xs text-stone-500">فروش کل پرداخت‌شده: <b className="text-stone-800">{formatPrice(d.usage.gmv)}</b></p></Card>
          </div>

          <Card className="space-y-3 p-4 shadow-none ring-1 ring-stone-200">
            <h3 className="font-bold">اشتراک</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="پلن"><Select disabled={!write} value={b.plan} onChange={(e) => patch({ plan: e.target.value }, `پلن به ${planName(e.target.value)} تغییر کرد`)}>{PLANS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</Select></Field>
              <Field label="پایان اشتراک (شمسی)" hint="خالی = بدون محدودیت"><JalaliInput value={endsAt} onChange={setEndsAt} /></Field>
              <div className="flex items-end"><Button disabled={!write || (endsAt || "") === (b.subscriptionEndsAt ?? "")} onClick={() => patch({ subscriptionEndsAt: endsAt || null }, "تاریخ اشتراک ذخیره شد")}>ذخیره تاریخ</Button></div>
            </div>
            {b.upgradeRequest && <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">درخواست ارتقا به <b>{planName(b.upgradeRequest)}</b>{write && <><Button size="sm" className="ms-auto" onClick={() => patch({ approveUpgrade: true }, "ارتقا تأیید شد")}>تأیید</Button><Button size="sm" variant="ghost" onClick={() => patch({ rejectUpgrade: true }, "درخواست رد شد")}>رد</Button></>}</div>}
            <div><p className="mb-1.5 text-xs font-bold text-stone-500">فاکتورهای اشتراک</p>{d.invoices.length === 0 ? <p className="text-xs text-stone-400">فاکتوری ثبت نشده</p> : <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">{d.invoices.map((i: any) => <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs"><b>#{toFa(i.number)}</b><span>{planName(i.plan)} · {toFa(i.months)} ماه</span><b>{formatPrice(i.amount)}</b><Badge color={i.status === "paid" ? "emerald" : i.status === "void" ? "stone" : "amber"}>{i.status === "paid" ? "پرداخت شد" : i.status === "void" ? "باطل" : "پرداخت‌نشده"}</Badge><a className="ms-auto font-bold text-brand-600" href={`/print/invoice/${i.id}`} target="_blank">چاپ</a></li>)}</ul>}</div>
          </Card>

          <Card className="space-y-3 p-4 shadow-none ring-1 ring-stone-200">
            <div className="flex items-center justify-between"><h3 className="font-bold">کنترل دسترسی به امکانات</h3><Button size="sm" variant="secondary" onClick={() => setShowOv(!showOv)}>{showOv ? "بستن" : `ویرایش استثناها (${toFa(Object.keys(ov).length)})`}</Button></div>
            {showOv && (
              <div className="space-y-4">
                {Object.entries(GROUPS).map(([g, meta]) => (
                  <Fragment key={g}><p className="text-xs font-extrabold text-stone-600">{<EmojiIcon emoji={meta.emoji} /> } {meta.title}</p>
                    <div className="space-y-1.5">{FEATURES.filter((f) => f.group === g).map((f) => { const v = ov[f.key]; const st = v === true ? "on" : v === false ? "off" : "default"; return (
                      <div key={f.key} className="flex flex-wrap items-center gap-3 rounded-xl bg-stone-50 px-3 py-2"><span className="min-w-52 flex-1 text-sm">{f.label}</span><Badge color={eff[f.key] === "no" ? "rose" : "emerald"}>{eff[f.key] === "no" ? "قفل" : "فعال"}</Badge>
                        <div className="flex overflow-hidden rounded-lg text-xs font-semibold ring-1 ring-stone-200">{([["default", `پیش‌فرض (${base[f.key] === "no" ? "قفل" : "فعال"})`], ["on", "فعال"], ["off", "غیرفعال"]] as const).map(([k, l]) => <button key={k} disabled={!write} onClick={() => setOv((o) => { const n = { ...o }; if (k === "default") delete n[f.key]; else n[f.key] = k === "on"; return n; })} className={cn("px-2.5 py-1.5", st === k ? (k === "off" ? "bg-rose-500 text-white" : k === "on" ? "bg-emerald-500 text-white" : "bg-stone-800 text-white") : "bg-white hover:bg-stone-50")}>{l}</button>)}</div></div>); })}</div></Fragment>
                ))}
                <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOv({})} disabled={!write}>بازنشانی همه</Button><Button disabled={!write} onClick={() => patch({ featureOverrides: ov }, "دسترسی‌ها ذخیره شد")}>ذخیره استثناها</Button></div>
              </div>
            )}
          </Card>

          <Field label="یادداشت داخلی مدیر (برای مشتری نمایش داده نمی‌شود)"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} disabled={!write} /></Field>
          {write && note !== (b.adminNote ?? "") && <Button size="sm" onClick={() => patch({ adminNote: note }, "یادداشت ذخیره شد")}>ذخیره یادداشت</Button>}

          {d.tickets.length > 0 && <div><p className="mb-1.5 text-xs font-bold text-stone-500">آخرین تیکت‌ها</p><ul className="space-y-1">{d.tickets.map((t: any) => <li key={t.id} className="flex items-center gap-2 text-xs"><Badge color={t.status === "open" ? "amber" : t.status === "answered" ? "emerald" : "stone"}>{t.status === "open" ? "باز" : t.status === "answered" ? "پاسخ داده شد" : "بسته"}</Badge>{t.subject}</li>)}</ul></div>}

          <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
            {me.perms.includes("impersonate") && !d.owner.isAdmin && <Button variant="secondary" onClick={async () => { try { await api(`/api/admin/businesses/${id}/impersonate`, { method: "POST", body: {} }); location.href = "/dashboard"; } catch (e) { toast((e as Error).message, "error"); } }}>{<EmojiIcon emoji="" />} ورود به حساب مالک</Button>}
            {write && b.id !== me.businessId && <Button variant="ghost" className={b.isSuspended ? "text-emerald-600" : "text-rose-600"} onClick={() => patch({ isSuspended: !b.isSuspended }, b.isSuspended ? "حساب فعال شد" : "حساب مسدود شد")}>{b.isSuspended ? "رفع مسدودی" : "مسدودکردن حساب"}</Button>}
            {me.dept === "super" && b.id !== me.businessId && <Button variant="ghost" className="ms-auto text-rose-600" onClick={() => { setConfirm(""); setDel(true); }}><Icon name="trash" className="size-4" /> حذف کامل</Button>}
          </div>
          <Modal open={del} onClose={() => setDel(false)} size="sm" title="حذف کامل کسب‌وکار" footer={<><Button variant="ghost" onClick={() => setDel(false)}>انصراف</Button><Button variant="danger" disabled={confirm !== b.slug} onClick={async () => { try { await api(`/api/admin/businesses/${id}`, { method: "DELETE", body: { confirm } }); toast("کسب‌وکار حذف شد"); setDel(false); onClose(); changed(); } catch (e) { toast((e as Error).message, "error"); } }}>حذف همیشگی</Button></>}>
            <p className="mb-3 text-sm leading-7 text-rose-700">تمام اطلاعات این کسب‌وکار (منو، سفارش‌ها، مشتریان، اسناد حسابداری، کارمندان و حساب‌ها) برای همیشه پاک می‌شود و برگشت‌پذیر نیست.</p>
            <Field label={`برای تأیید، «${b.slug}» را بنویسید`}><Input dir="ltr" className="text-left" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          </Modal>
        </div>
      )}</IconText>
      <ConfirmDialog open={false} title="" message="" onConfirm={() => {}} onClose={() => {}} />
    </Modal>
  );
}
