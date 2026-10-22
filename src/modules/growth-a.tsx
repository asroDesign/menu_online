"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, useCollection } from "@/lib/api";
import { JMONTHS, fmtJ } from "@/lib/jalali";
import { SEGMENTS, mergeSeg, segMeta, type SegCfg } from "@/lib/segments";
import { SmsSendModal } from "@/components/sms-send";
import { useFeatures } from "@/components/features";
import { formatDate, formatNumber, formatPrice, timeAgo, toFa } from "@/lib/format";
import { ResourcePage } from "@/components/resource-page";
import { SettingCard } from "@/components/setting-card";
import { CashbackSettingsCard } from "@/components/cashback-settings";
import { MembershipTierManager } from "@/components/membership-tier-manager";
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, IconButton, Input, AmountInput, Modal, PageHeader, Select, Skeleton, Switch, Textarea, cn, useToast, iconGlyph, EmojiIcon, IconText} from "@/components/ui";

type Customer = { id: number; name: string; phone: string; note: string; points: number; walletBalance: number; totalSpent: number; ordersCount: number; birthMonth: number | null; birthDay: number | null; smsOptIn: boolean; lastOrderAt: string | null; segment: string };

function SegmentSettings() {
  const toast = useToast();
  const [v, setV] = useState<Record<string, string> | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open && !v) api<{ item: { settings: { segments?: Partial<SegCfg> } } }>("/api/business").then((r) => { const c = mergeSeg(r.item.settings.segments); setV(Object.fromEntries(Object.entries(c).map(([k, x]) => [k, String(x)]))); }); }, [open, v]);
  const F: [keyof SegCfg, string, string][] = [["vipOrders", "VIP: حداقل تعداد خرید", "بار"], ["vipSpent", "VIP: حداقل مبلغ کل خرید", "تومان"], ["loyalOrders", "وفادار: حداقل تعداد خرید", "بار"], ["loyalSpent", "وفادار: یا حداقل مبلغ خرید", "تومان"], ["atRiskDays", "در خطر ریزش: روز از آخرین خرید", "روز"], ["lostDays", "ازدست‌رفته: روز از آخرین خرید", "روز"]];
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><IconText>{<EmojiIcon emoji="" />}</IconText> قوانین طبقه‌بندی</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="قوانین طبقه‌بندی خودکار مشتریان" size="md" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button><Button onClick={async () => { try { await api("/api/business", { method: "PATCH", body: { settings: { segments: Object.fromEntries(Object.entries(v ?? {}).map(([k, x]) => [k, Number(x.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, ""))])) } } }); toast("قوانین ذخیره شد؛ طبقه‌بندی به‌روز می‌شود"); setOpen(false); location.reload(); } catch (e) { toast((e as Error).message, "error"); } }}>ذخیره</Button></>}>
        {!v ? <div className="skeleton h-40" /> : <div className="grid gap-4 sm:grid-cols-2">{F.map(([k, l, u]) => <Field key={k} label={l} hint={u}>{k.endsWith("Spent") ? <AmountInput value={v[k]} onValueChange={(value) => setV({ ...v, [k]: value })} /> : <Input inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}</Field>)}</div>}
        <p className="mt-4 text-xs leading-6 text-stone-500">طبقه‌بندی به‌صورت خودکار و بر اساس سفارش‌های پرداخت‌شده محاسبه می‌شود؛ نیازی به ثبت دستی نیست.</p>
      </Modal>
    </>
  );
}

export function Customers() {
  const f = useFeatures();
  const [seg, setSeg] = useState("all");
  const [sms, setSms] = useState<{ audience: string; numbers?: string; count: number; title: string } | null>(null);
  const canSms = f.has("sms") && f.isManager;
  return (
    <>
      <ResourcePage<Customer>
        title="باشگاه مشتریان"
        subtitle="مشتریان به‌صورت خودکار بر اساس تعداد و مبلغ خرید و زمان آخرین خرید طبقه‌بندی می‌شوند"
        endpoint="/api/r/customers"
        emoji=""
        emptyTitle="هنوز مشتری ثبت نشده"
        emptyDesc="مشتریان با ثبت شماره موبایل در سفارش‌ها به‌صورت خودکار به باشگاه اضافه می‌شوند؛ می‌توانید دستی هم اضافه کنید."
        addLabel="مشتری جدید"
        selectable={canSms}
        optimisticExtra={{ points: 0, walletBalance: 0, totalSpent: 0, ordersCount: 0, birthMonth: null, birthDay: null, lastOrderAt: null, segment: "none" }}
        rowFilter={(r) => seg === "all" || r.segment === seg}
        fields={[
          { key: "name", label: "نام", required: true },
          { key: "phone", label: "موبایل", required: true, ltr: true, placeholder: "09121234567" },
          { key: "birthMonth", label: "ماه تولد (شمسی)", type: "select", options: [{ value: "", label: "—" }, ...JMONTHS.map((m, i) => ({ value: String(i + 1), label: m }))] },
          { key: "birthDay", label: "روز تولد", type: "number", placeholder: "۱ تا ۳۱" },
          { key: "points", label: "امتیاز", type: "number", initial: "0" },
          { key: "smsOptIn", label: "دریافت پیامک تبلیغاتی و مناسبتی", type: "bool" },
          { key: "note", label: "یادداشت", type: "textarea" },
        ]}
        search={(r, t) => r.name.includes(t) || r.phone.includes(t)}
        header={({ items }) => (
          <div className="mb-4 space-y-3">
            {f.isManager && <div className="flex flex-wrap justify-end gap-2"><MembershipTierManager /><Button size="sm" variant="secondary" onClick={() => window.location.assign("/api/customers/export")}><Icon name="download" className="size-4"/> خروجی CSV همه مشتریان</Button></div>}
            <SettingCard title="نرخ کسب امتیاز" desc="به ازای هر چند تومان خرید، ۱ امتیاز به مشتری تعلق می‌گیرد." k="pointsPerToman" suffix="تومان = ۱ امتیاز" />
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              <IconText>{[{ key: "all", label: "همه", emoji: "" }, ...SEGMENTS].map((s) => {
                const n = s.key === "all" ? items.length : items.filter((c) => c.segment === s.key).length;
                return <button key={s.key} onClick={() => setSeg(s.key)} title={"desc" in s ? s.desc : undefined} className={cn("flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition", seg === s.key ? "bg-stone-900 text-white shadow" : "bg-white ring-1 ring-stone-200 hover:bg-stone-50")}><span>{<EmojiIcon emoji={s.emoji} /> }</span>{s.label}<span className={cn("rounded-md px-1.5 text-[11px]", seg === s.key ? "bg-white/20" : "bg-stone-100 text-stone-500")}>{toFa(n)}</span></button>;
              })}</IconText>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
              <span>{seg !== "all" ? segMeta(seg).desc : "برای فیلتر، یک گروه را انتخاب کنید"}</span>
              {f.isManager && f.has("loyalty") && <SegmentSettings />}
            </div>
          </div>
        )}
        renderBar={({ filtered, selected, clear }) => canSms && (filtered.length > 0) ? (
          <div className="no-print mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-brand-50 p-3 ring-1 ring-brand-200">
            <span className="text-sm font-semibold text-brand-900"><IconText>{<EmojiIcon emoji="" />}</IconText> ارسال پیامک:</span>
            {seg !== "all" && seg !== "none" && <Button size="sm" onClick={() => setSms({ audience: `seg:${seg}`, count: filtered.filter((c) => c.smsOptIn).length, title: `گروه ${segMeta(seg).label}` })}>به کل گروه «{segMeta(seg).label}» ({toFa(filtered.filter((c) => c.smsOptIn).length)})</Button>}
            <Button size="sm" variant="secondary" disabled={selected.length === 0} onClick={() => setSms({ audience: "manual", numbers: selected.filter((c) => c.smsOptIn).map((c) => c.phone).join(","), count: selected.filter((c) => c.smsOptIn).length, title: "مشتریان انتخاب‌شده" })}>به انتخاب‌شده‌ها ({toFa(selected.length)})</Button>
            {selected.length > 0 && <button className="text-xs text-stone-500 underline" onClick={clear}>لغو انتخاب</button>}
          </div>
        ) : null}
        columns={[
          { label: "مشتری", render: (r) => <div><p className="font-bold">{r.name}</p><p className="text-xs text-stone-400" dir="ltr">{r.phone}</p></div> },
          { label: "طبقه", render: (r) => <Badge color={segMeta(r.segment).color}><EmojiIcon emoji={segMeta(r.segment).emoji} /> {segMeta(r.segment).label}</Badge> },
          { label: "تعداد خرید", render: (r) => toFa(r.ordersCount) },
          { label: "مجموع خرید", render: (r) => formatPrice(r.totalSpent) },
          { label: "آخرین خرید", render: (r) => (r.lastOrderAt ? <span className="whitespace-nowrap text-xs">{fmtJ(r.lastOrderAt)} <span className="text-stone-400">({toFa(Math.floor((Date.now() - new Date(r.lastOrderAt).getTime()) / 86400_000))} روز پیش)</span></span> : "—") },
          { label: "امتیاز", render: (r) => <b>{formatNumber(r.points)}</b> },
          { label: "تولد", render: (r) => (r.birthMonth && r.birthDay ? `${toFa(r.birthDay)} ${JMONTHS[r.birthMonth - 1]}` : "—") },
        ]}
      />
      <SmsSendModal open={!!sms} onClose={() => setSms(null)} audience={sms?.audience ?? ""} numbers={sms?.numbers} count={sms?.count ?? 0} title={sms?.title ?? ""} />
    </>
  );
}

type WalletRow = { id: number; customerName: string; phone: string; kind: string; amount: number; note: string; createdAt: string };
const kindLabel: Record<string, [string, string]> = { earn: ["دریافت کش‌بک", "emerald"], spend: ["استفاده", "amber"], refund: ["بازگشت", "blue"], adjust: ["تعدیل دستی", "stone"] };

export function Cashback() {
  const toast = useToast();
  const ledger = useCollection<WalletRow>("/api/r/walletlog");
  return (
    <ResourcePage<Customer>
      title="تخفیف کش‌بک"
      subtitle="بخشی از مبلغ هر خرید به‌صورت اعتبار به کیف پول مشتری برمی‌گردد و در خرید بعدی قابل استفاده است"
      endpoint="/api/r/customers"
      emoji=""
      emptyTitle="مشتری‌ای برای کش‌بک وجود ندارد"
      emptyDesc="با ثبت سفارش همراه شماره موبایل، مشتریان ساخته می‌شوند."
      fields={[]}
      canDelete={false}
      search={(r, t) => r.name.includes(t) || r.phone.includes(t)}
      header={() => <div className="mb-5"><CashbackSettingsCard /></div>}
      columns={[
        { label: "مشتری", render: (r) => <div><p className="font-bold">{r.name}</p><p className="text-xs text-stone-400" dir="ltr">{r.phone}</p></div> },
        { label: "اعتبار فعلی", render: (r) => <b className={r.walletBalance ? "text-emerald-600" : "text-stone-400"}>{formatPrice(r.walletBalance)}</b> },
        { label: "مجموع خرید", render: (r) => formatPrice(r.totalSpent) },
      ]}
      rowActions={(r, ctx) => (
        <Button size="sm" variant="secondary" onClick={async () => {
          const v = window.prompt(`مبلغ اعتبار برای ${r.name} (تومان). برای کسر عدد منفی وارد کنید:`, "50000");
          if (!v) return;
          try {
            await api("/api/r/walletlog", { method: "POST", body: { customerId: r.id, amount: Number(v.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))), note: "تعدیل دستی توسط مدیر", idempotencyKey: crypto.randomUUID() } });
            ctx.reload();
            ledger.reload(true);
            toast("اعتبار ثبت شد");
          } catch (e) { toast((e as Error).message, "error"); }
        }}>± اعتبار</Button>
      )}
      footer={
        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-stone-100 p-4 font-bold">گردش اعتبار کش‌بک</div>
          {ledger.loading ? <Skeleton className="m-4 h-24" /> : ledger.items.length === 0 ? <p className="p-8 text-center text-sm text-stone-400">هنوز تراکنشی ثبت نشده است</p> : (
            <ul className="divide-y divide-stone-100">
              {ledger.items.slice(0, 30).map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Badge color={kindLabel[e.kind]?.[1]}>{kindLabel[e.kind]?.[0] ?? e.kind}</Badge>
                  <span className="min-w-0 flex-1 truncate">{e.customerName} <span className="text-xs text-stone-400">· {e.note}</span></span>
                  <b className={e.amount >= 0 ? "text-emerald-600" : "text-rose-600"} dir="ltr">{e.amount >= 0 ? "+" : "-"}{formatNumber(Math.abs(e.amount))}</b>
                  <span className="hidden text-xs text-stone-400 sm:block">{timeAgo(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      }
    />
  );
}

type Discount = { id: number; code: string; type: string; value: number; minOrder: number; maxUses: number; usedCount: number; expiresAt: string | null; isActive: boolean };

export function Discounts() {
  return (
    <ResourcePage<Discount>
      title="کدهای تخفیف"
      subtitle="کد تخفیف درصدی یا مبلغ ثابت برای کمپین‌ها؛ مشتری در منو، گارسون و صندوق می‌توانند آن را اعمال کنند"
      endpoint="/api/r/discounts"
      emoji=""
      emptyTitle="هنوز کد تخفیفی نساخته‌اید"
      emptyDesc="مثلاً WELCOME10 برای ۱۰٪ تخفیف اولین خرید."
      addLabel="کد جدید"
      optimisticExtra={{ usedCount: 0 }}
      fields={[
        { key: "code", label: "کد (انگلیسی)", required: true, ltr: true, placeholder: "WELCOME10" },
        { key: "type", label: "نوع تخفیف", type: "select", options: [{ value: "percent", label: "درصدی" }, { value: "fixed", label: "مبلغ ثابت (تومان)" }] },
        { key: "value", label: "مقدار", type: "number", required: true, hint: "درصد یا تومان، بسته به نوع" },
        { key: "minOrder", label: "حداقل مبلغ سفارش", type: "money", initial: "0" },
        { key: "maxUses", label: "حداکثر دفعات استفاده", type: "number", initial: "0", hint: "۰ = نامحدود" },
        { key: "expiresAt", label: "تاریخ انقضا", type: "date" },
        { key: "isActive", label: "فعال", type: "bool" },
      ]}
      columns={[
        { label: "کد", render: (r) => <code className="rounded-lg bg-stone-100 px-2 py-1 font-bold tracking-wider" dir="ltr">{r.code}</code> },
        { label: "تخفیف", render: (r) => <b>{r.type === "percent" ? `${toFa(r.value)}٪` : formatPrice(r.value)}</b> },
        { label: "حداقل سفارش", render: (r) => (r.minOrder ? formatPrice(r.minOrder) : "—") },
        { label: "استفاده", render: (r) => <span>{toFa(r.usedCount)}{r.maxUses ? ` از ${toFa(r.maxUses)}` : ""}</span> },
        { label: "انقضا", render: (r) => (r.expiresAt ? formatDate(r.expiresAt) : "بدون انقضا") },
        { label: "وضعیت", render: (r) => {
          const expired = r.expiresAt && new Date(r.expiresAt).getTime() < Date.now();
          const full = r.maxUses > 0 && r.usedCount >= r.maxUses;
          return expired ? <Badge color="rose">منقضی</Badge> : full ? <Badge color="amber">تکمیل ظرفیت</Badge> : r.isActive ? <Badge color="emerald">فعال</Badge> : <Badge>غیرفعال</Badge>;
        } },
      ]}
    />
  );
}

/* ---------------- Surveys ---------------- */
type Q = { id: string; text: string; type: "rating" | "choice" | "text"; options?: string[] };
type Survey = { id: number; title: string; description: string; questions: Q[]; isActive: boolean; responseCount: number; createdAt: string };
type Response_ = { id: number; customerName: string; answers: Record<string, string | number>; createdAt: string };
type QDraft = { id: string; text: string; type: Q["type"]; options: string };

export function Surveys() {
  const sv = useCollection<Survey>("/api/r/surveys");
  const toast = useToast();
  const [origin, setOrigin] = useState("");
  const [editing, setEditing] = useState<Survey | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [qs, setQs] = useState<QDraft[]>([]);
  const [results, setResults] = useState<{ survey: Survey; responses: Response_[] } | null>(null);
  const [share, setShare] = useState<Survey | null>(null);
  const [del, setDel] = useState<Survey | null>(null);

  const blankQ = (n: number): QDraft => ({ id: `q${n}`, text: "", type: "rating", options: "" });
  function openNew() { setTitle(""); setDesc(""); setQs([blankQ(1)]); setEditing("new"); }
  function openEdit(s: Survey) { setTitle(s.title); setDesc(s.description); setQs(s.questions.map((q) => ({ id: q.id, text: q.text, type: q.type, options: (q.options ?? []).join("، ") }))); setEditing(s); }

  async function save() {
    const questions = qs.filter((q) => q.text.trim()).map((q) => ({ id: q.id, text: q.text.trim(), type: q.type, ...(q.type === "choice" ? { options: q.options.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean) } : {}) }));
    if (!title.trim()) return toast("عنوان را وارد کنید", "error");
    if (!questions.length) return toast("حداقل یک سؤال اضافه کنید", "error");
    if (questions.some((q) => q.type === "choice" && (q.options?.length ?? 0) < 2)) return toast("سؤال‌های چندگزینه‌ای حداقل ۲ گزینه نیاز دارند", "error");
    const target = editing;
    setEditing(null);
    const payload = { title: title.trim(), description: desc.trim(), questions };
    try {
      if (target === "new") { await sv.create({ ...payload, isActive: true }, { ...payload, isActive: true, responseCount: 0, createdAt: new Date().toISOString() } as never); toast("نظرسنجی ساخته شد"); }
      else if (target) { await sv.update(target.id, payload); toast("ذخیره شد"); }
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function openResults(s: Survey) {
    try { setResults(await api(`/api/r/surveys/${s.id}`)); } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="نظرسنجی مشتریان" subtitle="فرم بازخورد بسازید، لینک یا QR آن را به اشتراک بگذارید و نتایج را ببینید" actions={<Button onClick={openNew}><Icon name="plus" className="size-4" /> نظرسنجی جدید</Button>} />
      <IconText>{sv.loading ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
        : sv.error ? <ErrorState message={sv.error} onRetry={() => sv.reload()} />
        : sv.items.length === 0 ? <EmptyState emoji="" title="هنوز نظرسنجی‌ای ندارید" description="با چند سؤال ساده از مشتریان بازخورد بگیرید." action={<Button onClick={openNew}>ساخت نظرسنجی</Button>} />
        : <div className="grid gap-4 md:grid-cols-2">
          {sv.items.map((s) => (
            <Card key={s.id} className={cn("flex flex-col p-5 animate-pop", s.id < 0 && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h3 className="font-bold">{s.title}</h3><p className="mt-1 line-clamp-2 text-xs leading-6 text-stone-500">{s.description || "—"}</p></div>
                <Switch checked={s.isActive} label="فعال" onChange={(v) => sv.update(s.id, { isActive: v }).catch((e) => toast(e.message, "error"))} />
              </div>
              <div className="mt-4 flex gap-2 text-xs"><Badge color="brand">{toFa(s.questions.length)} سؤال</Badge><Badge color="emerald">{toFa(s.responseCount)} پاسخ</Badge>{!s.isActive && <Badge>غیرفعال</Badge>}</div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
                <Button size="sm" onClick={() => openResults(s)}>{<EmojiIcon emoji="" />} نتایج</Button>
                <Button size="sm" variant="secondary" onClick={() => { setOrigin(location.origin); setShare(s); }}><Icon name="qr" className="size-4" /> اشتراک‌گذاری</Button>
                <span className="ms-auto flex"><IconButton icon="edit" label="ویرایش" onClick={() => openEdit(s)} /><IconButton icon="trash" label="حذف" className="hover:bg-rose-50 hover:text-rose-600" onClick={() => setDel(s)} /></span>
              </div>
            </Card>
          ))}
        </div>}</IconText>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "نظرسنجی جدید" : "ویرایش نظرسنجی"} size="lg" footer={<><Button variant="ghost" onClick={() => setEditing(null)}>انصراف</Button><Button onClick={save}>ذخیره</Button></>}>
        <div className="space-y-4">
          <Field label="عنوان *"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="توضیح"><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <div className="space-y-3">
            {qs.map((q, i) => (
              <div key={q.id} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
                <div className="flex gap-2">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold">{toFa(i + 1)}</span>
                  <Input value={q.text} placeholder="متن سؤال" onChange={(e) => setQs(qs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                  <Select className="w-36" value={q.type} onChange={(e) => setQs(qs.map((x, j) => (j === i ? { ...x, type: e.target.value as Q["type"] } : x)))}>
                    <option value="rating">امتیاز ۱ تا ۵</option><option value="choice">چندگزینه‌ای</option><option value="text">پاسخ متنی</option>
                  </Select>
                  <IconButton icon="trash" label="حذف سؤال" disabled={qs.length === 1} onClick={() => setQs(qs.filter((_, j) => j !== i))} />
                </div>
                {q.type === "choice" && <Input className="mt-2" placeholder="گزینه‌ها را با ویرگول جدا کنید: اینستاگرام، دوستان، گوگل" value={q.options} onChange={(e) => setQs(qs.map((x, j) => (j === i ? { ...x, options: e.target.value } : x)))} />}
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setQs([...qs, blankQ(Math.max(0, ...qs.map((x) => Number(x.id.slice(1)) || 0)) + 1)])}><Icon name="plus" className="size-4" /> افزودن سؤال</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!share} onClose={() => setShare(null)} title="اشتراک‌گذاری نظرسنجی" size="sm" footer={share && <><Button variant="secondary" onClick={() => navigator.clipboard.writeText(`${origin}/survey/${share.id}`).then(() => toast("لینک کپی شد"))}><Icon name="copy" className="size-4" /> کپی لینک</Button><a href={`/survey/${share.id}`} target="_blank"><Button>باز کردن</Button></a></>}>
        {share && <div className="text-center"><div className="inline-block rounded-2xl border-2 border-dashed border-brand-300 p-4"><QRCodeSVG value={`${origin}/survey/${share.id}`} size={190} marginSize={0} /></div><p className="mt-3 break-all text-xs text-stone-500" dir="ltr">{origin}/survey/{share.id}</p></div>}
      </Modal>

      <Modal open={!!results} onClose={() => setResults(null)} title={results ? `نتایج: ${results.survey.title}` : ""} size="lg">
        <IconText>{results && (results.responses.length === 0 ? <p className="py-10 text-center text-sm text-stone-400">هنوز پاسخی ثبت نشده است.</p> : (
          <div className="space-y-6">
            <p className="text-sm text-stone-500">مجموع پاسخ‌ها: <b className="text-stone-800">{toFa(results.responses.length)}</b></p>
            {results.survey.questions.map((q) => {
              const vals = results.responses.map((r) => r.answers[q.id]).filter((v) => v !== undefined);
              return (
                <div key={q.id}>
                  <p className="mb-2 text-sm font-bold">{q.text} <span className="text-xs font-normal text-stone-400">({toFa(vals.length)} پاسخ)</span></p>
                  {q.type === "rating" && (() => {
                    const nums = vals.map(Number); const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
                    return <div><p className="mb-2 text-2xl font-extrabold text-brand-600">{toFa(avg.toFixed(1))} <span className="text-sm text-stone-400">از ۵</span></p>{[5, 4, 3, 2, 1].map((n) => { const c = nums.filter((x) => x === n).length; return <div key={n} className="mb-1 flex items-center gap-2 text-xs"><span className="w-6">{toFa(n)}{<EmojiIcon emoji="" />}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${nums.length ? (c / nums.length) * 100 : 0}%` }} /></div><span className="w-6 text-stone-500">{toFa(c)}</span></div>; })}</div>;
                  })()}
                  {q.type === "choice" && (q.options ?? []).map((o) => { const c = vals.filter((v) => v === o).length; return <div key={o} className="mb-1.5 flex items-center gap-2 text-xs"><span className="w-28 truncate">{o}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-brand-400" style={{ width: `${vals.length ? (c / vals.length) * 100 : 0}%` }} /></div><span className="w-6 text-stone-500">{toFa(c)}</span></div>; })}
                  {q.type === "text" && <ul className="space-y-1.5">{vals.slice(0, 12).map((v, i) => <li key={i} className="rounded-lg bg-stone-50 px-3 py-2 text-sm">{<EmojiIcon emoji="" />} {String(v)}</li>)}{vals.length === 0 && <li className="text-xs text-stone-400">پاسخی نیست</li>}</ul>}
                </div>
              );
            })}
          </div>
        ))}</IconText>
      </Modal>
      <ConfirmDialog open={!!del} title="حذف نظرسنجی" message="نظرسنجی و همه‌ی پاسخ‌های آن حذف می‌شود." onConfirm={() => del && sv.remove(del.id).catch((e) => toast(e.message, "error"))} onClose={() => setDel(null)} />
    </div>
  );
}
