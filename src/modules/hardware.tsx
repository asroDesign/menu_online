"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, useCollection } from "@/lib/api";
import { formatPrice, formatTime, timeAgo, toFa } from "@/lib/format";
import { ResourcePage } from "@/components/resource-page";
import { DELIVERY_STATUS } from "@/lib/admin-meta";
import type { Order, Product } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Field, Icon, IconButton, Input, Modal, PageHeader, Select, Skeleton, Switch, cn, useToast } from "@/components/ui";

/* ---------- generic device registry ---------- */
type Device = { id: number; kind: string; name: string; code: string; lastSeenAt: string | null; lastValue: number };
const KIND: Record<string, string> = { tablet: "تبلت", pos: "دستگاه پوز", printer: "پرینتر ابری", scale: "ترازو", caller_id: "کالر آیدی", pager: "فرستنده‌ی پیجر" };
const online = (d: Device) => !!d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < 5 * 60_000;

function DevicePanel({ resource, kinds, extra, hint }: { resource: string; kinds: string[]; extra?: (d: Device) => ReactNode; hint?: (d: Device) => string }) {
  const col = useCollection<Device>(`/api/r/${resource}`, { poll: 10000 });
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState(kinds[0]);
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(location.origin); }, []);
  async function add() {
    if (!name.trim()) return;
    setOpen(false);
    try { await col.create({ name: name.trim(), kind }, { name: name.trim(), kind, code: "…", lastSeenAt: null, lastValue: 0 }); setName(""); toast("دستگاه اضافه شد"); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function ping(d: Device) {
    try { await api(`/api/device/${d.code}/ping`); col.reload(true); toast("ارتباط برقرار است ✅"); } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">دستگاه‌های متصل</h2><Button size="sm" onClick={() => { setKind(kinds[0]); setOpen(true); }}><Icon name="plus" className="size-4" /> دستگاه جدید</Button></div>
      {col.loading ? <Skeleton className="h-28 rounded-2xl" /> : col.items.length === 0 ? <EmptyState emoji="🔌" title="دستگاهی ثبت نشده" description="دستگاه را اضافه کنید و کد اتصال آن را در سخت‌افزار/نرم‌افزار دستگاه وارد کنید." action={<Button onClick={() => setOpen(true)}>افزودن دستگاه</Button>} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{col.items.map((d) => (
          <Card key={d.id} className={cn("p-4 animate-pop", d.id < 0 && "opacity-60")}>
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-bold">{d.name}</p><p className="mt-0.5 text-xs text-stone-500">{KIND[d.kind]}</p></div>
              <Badge color={online(d) ? "emerald" : "stone"}>{online(d) ? "● آنلاین" : "○ آفلاین"}</Badge>
            </div>
            <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-xs"><span className="text-stone-500">کد اتصال: </span><code className="font-bold" dir="ltr">{d.code}</code></div>
            <p className="mt-2 break-all text-[11px] text-stone-400" dir="ltr">{origin}{hint ? hint(d) : `/api/device/${d.code}/ping`}</p>
            <p className="mt-2 text-[11px] text-stone-400">آخرین ارتباط: {d.lastSeenAt ? timeAgo(d.lastSeenAt) : "—"}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
              <Button size="sm" variant="secondary" onClick={() => ping(d)} disabled={d.id < 0}>تست اتصال</Button>
              {extra?.(d)}
              <IconButton icon="trash" label="حذف" className="ms-auto hover:bg-rose-50 hover:text-rose-600" onClick={() => col.remove(d.id).catch((e) => toast(e.message, "error"))} />
            </div>
          </Card>
        ))}</div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="دستگاه جدید" size="sm" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button><Button onClick={add} disabled={!name.trim()}>افزودن</Button></>}>
        <div className="space-y-4"><Field label="نام دستگاه"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="مثلاً پرینتر آشپزخانه" /></Field>{kinds.length > 1 && <Field label="نوع"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</Select></Field>}<p className="text-xs leading-6 text-stone-400">پس از افزودن، یک کد اتصال یکتا ساخته می‌شود.</p></div>
      </Modal>
    </div>
  );
}

/* ---------- couriers ---------- */
type Courier = { id: number; name: string; phone: string; vehicle: string; status: string; activeCount: number; email: string; hasLogin: boolean; deliveredToday: number; failedToday: number };
const CSTAT: Record<string, [string, string]> = { available: ["آماده", "emerald"], busy: ["در مسیر", "amber"], off: ["خارج از شیفت", "stone"] };

function DeliveryBoard() {
  const toast = useToast();
  const cs = useCollection<Courier>("/api/r/couriers");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [err, setErr] = useState("");
  const load = () => api<{ items: Order[] }>("/api/orders?status=pending,preparing,ready,served&limit=150").then((r) => setOrders(r.items.filter((o) => o.type === "delivery"))).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);
  async function assign(o: Order, courierId: string) {
    try {
      const { item } = await api<{ item: Order }>(`/api/orders/${o.id}`, { method: "PATCH", body: { courierId: courierId ? Number(courierId) : null } });
      setOrders((x) => x?.map((y) => (y.id === o.id ? item : y)) ?? x);
      cs.reload(true);
      toast(courierId ? "سفارش به پیک سپرده شد" : "پیک برداشته شد");
    } catch (e) { toast((e as Error).message, "error"); }
  }
  const sorted = (orders ?? []).slice().sort((a, b) => Number(["not_home", "failed"].includes(b.deliveryStatus)) - Number(["not_home", "failed"].includes(a.deliveryStatus)) || Number(a.deliveryStatus !== "none") - Number(b.deliveryStatus !== "none"));
  return (
    <Card className="mt-6 overflow-hidden">
      <div className="border-b border-stone-100 p-4 font-bold">🛵 سفارش‌های ارسال فعال و سپردن به پیک</div>
      {err ? <p className="p-6 text-center text-sm text-stone-400">{err}</p> : !orders ? <Skeleton className="m-4 h-24" /> : orders.length === 0 ? <p className="p-8 text-center text-sm text-stone-400">سفارش ارسالی در جریان نیست.</p> : (
        <ul className="divide-y divide-stone-100">{sorted.map((o) => {
          const locked = o.deliveryStatus === "picked_up" || o.deliveryStatus === "delivered";
          const ds = DELIVERY_STATUS[o.deliveryStatus] ?? DELIVERY_STATUS.none;
          return (
            <li key={o.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3 text-sm", ["not_home", "failed"].includes(o.deliveryStatus) && "bg-rose-50/60")}>
              <b>#{toFa(o.number)}</b>
              <span className="min-w-48 flex-1 text-stone-600">📍 {o.address || "—"}{o.lat != null && o.lng != null && <a className="ms-2 text-xs font-bold text-brand-600" target="_blank" href={`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`}>🧭 نقشه</a>}<span className="block text-xs text-stone-400">{o.customerName} · {o.customerPhone} · {o.status === "ready" ? "آماده تحویل" : o.status === "served" ? "تحویل‌گرفته‌شده" : "در حال آماده‌سازی"}</span>{o.courierNote && <span className="block text-xs font-semibold text-rose-700">«{o.courierNote}»</span>}</span>
              <Badge color={ds[1]}>{ds[0]}</Badge>
              <span className="font-bold">{formatPrice(o.total)}</span>
              <Select className="w-44" disabled={locked} value={o.courierId ?? ""} onChange={(e) => assign(o, e.target.value)}><option value="">— بدون پیک —</option>{cs.items.filter((c) => c.status !== "off" || c.id === o.courierId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            </li>
          );
        })}</ul>
      )}
    </Card>
  );
}
export function Couriers() {
  return (
    <ResourcePage<Courier>
      title="مدیریت پیک"
      subtitle="پیک‌ها هر کدام حساب ورود و پنل مخصوص خود را دارند؛ سفارش‌های ارسال را به آن‌ها بسپارید و وضعیت تحویل را زنده ببینید"
      endpoint="/api/r/couriers"
      emoji="🛵"
      poll={8000}
      emptyTitle="هنوز پیکی ثبت نشده"
      emptyDesc="پیک اضافه کنید، برایش ایمیل و رمز ورود بسازید و سفارش‌های ارسال را به او بسپارید."
      addLabel="پیک جدید"
      optimisticExtra={{ activeCount: 0, hasLogin: false, deliveredToday: 0, failedToday: 0, email: "" }}
      fields={[
        { key: "name", label: "نام پیک", required: true },
        { key: "phone", label: "موبایل", ltr: true },
        { key: "vehicle", label: "وسیله‌ی نقلیه", type: "select", options: ["موتور", "ماشین", "دوچرخه", "پیاده"].map((x) => ({ value: x, label: x })) },
        { key: "status", label: "وضعیت", type: "select", options: Object.entries(CSTAT).map(([k, v]) => ({ value: k, label: v[0] })) },
        { key: "email", label: "ایمیل ورود به پنل پیک", ltr: true, hint: "برای ساخت حساب ورود" },
        { key: "password", label: "رمز عبور", secret: true, hint: "هنگام ویرایش: خالی = بدون تغییر" },
      ]}
      header={() => <p className="mb-4 rounded-xl bg-sky-50 p-3 text-xs leading-6 text-sky-900">🔗 پیک با ایمیل و رمز خودش وارد می‌شود و مستقیم به <b>پنل پیک</b> می‌رود: سفارش‌های سپرده‌شده، تلفن و آدرس مشتری، مسیریابی، و دکمه‌های «تحویل گرفتم»، «تحویل داده شد»، «عدم حضور مشتری»، «عدم تحویل».</p>}
      columns={[
        { label: "پیک", render: (r) => <div><p className="font-bold">{r.name}</p><p className="text-xs text-stone-400" dir="ltr" style={{ textAlign: "start" }}>{r.phone}</p></div> },
        { label: "وسیله", render: (r) => r.vehicle },
        { label: "وضعیت", render: (r) => <Badge color={CSTAT[r.status]?.[1]}>{CSTAT[r.status]?.[0]}</Badge> },
        { label: "سفارش فعال", render: (r) => toFa(r.activeCount) },
        { label: "امروز", render: (r) => <span className="text-xs"><b className="text-emerald-700">{toFa(r.deliveredToday)} تحویل</b>{r.failedToday > 0 && <b className="ms-2 text-rose-600">{toFa(r.failedToday)} ناموفق</b>}</span> },
        { label: "حساب ورود", render: (r) => (r.hasLogin ? <span className="text-xs" dir="ltr">{r.email}</span> : <span className="text-xs text-stone-400">ندارد</span>) },
      ]}
      footer={<DeliveryBoard />}
    />
  );
}

type Zone = { id: number; name: string; fee: number; minOrder: number; etaMinutes: number; radiusKm: number; areas: string; isActive: boolean };
export function Zones() {
  return (
    <ResourcePage<Zone>
      title="محدوده و منطقه‌بندی"
      subtitle="محدوده‌های ارسال با هزینه، حداقل سفارش و زمان تحویل مخصوص هر منطقه"
      endpoint="/api/r/zones"
      emoji="🗺️"
      emptyTitle="محدوده‌ای تعریف نشده"
      emptyDesc="مثلاً «محدوده ۱ تا ۳ کیلومتر» با هزینه‌ی ارسال ۲۵ هزار تومان."
      addLabel="محدوده جدید"
      fields={[
        { key: "name", label: "نام محدوده", required: true },
        { key: "fee", label: "هزینه ارسال (تومان)", type: "money", initial: "0" },
        { key: "minOrder", label: "حداقل سفارش", type: "money", initial: "0" },
        { key: "etaMinutes", label: "زمان تحویل (دقیقه)", type: "number", initial: "30" },
        { key: "radiusKm", label: "شعاع محدوده از رستوران (کیلومتر)", type: "number", initial: "0", hint: "۰ = انتخاب دستی؛ با شعاع، محدوده از روی نقشه خودکار تعیین می‌شود (موقعیت رستوران را در تنظیمات ثبت کنید)" },
        { key: "areas", label: "محله‌ها / مناطق", type: "textarea", placeholder: "ولیعصر، زرتشت، فاطمی" },
        { key: "isActive", label: "فعال", type: "bool" },
      ]}
      columns={[
        { label: "محدوده", render: (r) => <div><p className="font-bold">{r.name}</p><p className="text-xs text-stone-400">{r.areas}</p></div> },
        { label: "هزینه ارسال", render: (r) => (r.fee ? formatPrice(r.fee) : "رایگان") },
        { label: "حداقل سفارش", render: (r) => (r.minOrder ? formatPrice(r.minOrder) : "—") },
        { label: "زمان تحویل", render: (r) => `${toFa(r.etaMinutes)} دقیقه` },
        { label: "شعاع", render: (r) => (r.radiusKm ? `تا ${toFa(r.radiusKm)} کیلومتر` : "دستی") },
        { label: "وضعیت", render: (r) => <Badge color={r.isActive ? "emerald" : "stone"}>{r.isActive ? "فعال" : "غیرفعال"}</Badge> },
      ]}
    />
  );
}

/* ---------- tablet & pos ---------- */
type PosReq = { id: number; orderNumber: number; amount: number; status: string; refNo: string; detail: string; createdAt: string };
function PosSetupLoader() {
  const col = useCollection<Device>("/api/r/dev_tablet");
  return <PosSetup devices={col.items} />;
}

function PosRequests() {
  const col = useCollection<PosReq>("/api/r/posrequests", { poll: 4000 });
  const toast = useToast();
  const st: Record<string, [string, string]> = { pending: ["در انتظار کارتخوان", "amber"], approved: ["پرداخت شد", "emerald"], failed: ["ناموفق", "rose"], canceled: ["لغو", "stone"] };
  const fin = async (r: PosReq, status: string) => {
    const refNo = status === "approved" ? window.prompt("شماره پیگیری / رسید کارتخوان (اختیاری):", "") ?? "" : "";
    try { await col.update(r.id, { status, refNo }); toast(status === "approved" ? "پرداخت ثبت شد" : "ثبت شد"); } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <div className="mb-8">
      <h2 className="mb-3 font-bold">💳 درخواست‌های پرداخت با کارتخوان</h2>
      {col.loading ? <Skeleton className="h-24 rounded-2xl" /> : col.items.length === 0 ? <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-400 ring-1 ring-stone-200">درخواستی نیست. از «سفارش‌ها ‹ جزئیات سفارش ‹ کارتخوان» مبلغ را به دستگاه بفرستید.</p> : (
        <Card className="divide-y divide-stone-100">{col.items.slice(0, 12).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"><b>سفارش #{toFa(r.orderNumber)}</b><span>{formatPrice(r.amount)}</span><Badge color={st[r.status]?.[1]}>{st[r.status]?.[0]}</Badge>{r.refNo && <span className="text-xs text-stone-500" dir="ltr">{r.refNo}</span>}{r.detail && r.status !== "approved" && <span className="max-w-72 truncate text-xs text-rose-600" title={r.detail}>{r.detail}</span>}<span className="text-xs text-stone-400">{timeAgo(r.createdAt)}</span>
            {(r.status === "pending" || r.status === "failed" || r.status === "canceled") && <span className="ms-auto flex gap-1"><Button size="sm" variant={r.status === "pending" ? "primary" : "secondary"} onClick={() => fin(r, "approved")}>{r.status === "pending" ? "تأیید دستی دریافت" : "پول کم شده؟ تأیید دستی"}</Button>{r.status === "pending" && <Button size="sm" variant="ghost" onClick={() => fin(r, "failed")}>ناموفق</Button>}</span>}</div>
        ))}</Card>
      )}
    </div>
  );
}

const POS_PROTOCOLS: Record<string, { label: string; hint: string }> = {
  "saman-ssp1126": { label: "سامان‌کیش (SSP1126) — TCP یا RS232", hint: "با SDK متن‌باز؛ نیازمند فعال‌سازی PC-POS روی دستگاه توسط سامان‌کیش" },
  http: { label: "سرویس HTTP محلی (نصب‌شده توسط PSP)", hint: "برای PSPهایی که یک سرویس ویندوز با API محلی می‌دهند" },
  exec: { label: "برنامه‌ی خط فرمان PSP", hint: "کد خروج ۰ = تأیید؛ آخرین کلمه‌ی خروجی = شماره پیگیری" },
  raw: { label: "فریم خام سریال/TCP (طبق مستند PSP)", hint: "فریم و الگوی پاسخ را از مستند فنی PSP وارد کنید" },
};
function PosSetup({ devices }: { devices: Device[] }) {
  const toast = useToast();
  const pos = devices.filter((d) => d.kind === "pos");
  const [code, setCode] = useState("");
  const [proto, setProto] = useState("saman-ssp1126");
  const [t, setT] = useState<"tcp" | "serial">("tcp");
  const [f, setF] = useState({ host: "192.168.1.70", port: "1197", path: "COM3", baud: "19200", url: "http://127.0.0.1:8080/pay", body: '{"amount":"{amountRial}"}', successPath: "code", successValue: "0", refPath: "rrn", exec: "C:\\pos\\pay.exe --amount {amountRial}", request: "\\x02SALE;{amountRial:12}\\x03", responseEnd: "\\x03", successRegex: "RC=00", refRegex: "RRN=(\\d+)" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const cur = code || pos[0]?.code || "pos01";
  const net = t === "tcp" ? { transport: "tcp", host: f.host, port: Number(f.port) } : { transport: "serial", path: f.path, baud: Number(f.baud) };
  let dev: Record<string, unknown> = { code: cur, kind: "pos", protocol: proto };
  if (proto === "saman-ssp1126") dev = { ...dev, ...net };
  if (proto === "http") { let body: unknown = f.body; try { body = JSON.parse(f.body); } catch { /* keep string */ } dev = { ...dev, url: f.url, method: "POST", body, successPath: f.successPath, successValue: f.successValue, refPath: f.refPath, messagePath: "message", timeoutSeconds: 120 }; }
  if (proto === "exec") dev = { ...dev, exec: f.exec, timeoutSeconds: 120 };
  if (proto === "raw") dev = { ...dev, ...net, request: f.request, lrc: "xor", responseEnd: f.responseEnd, successRegex: f.successRegex, refRegex: f.refRegex, timeoutSeconds: 120 };
  const conf = JSON.stringify({ server: typeof location !== "undefined" ? location.origin : "https://your-domain.ir", pollSeconds: 2, devices: [dev] }, null, 2);
  const isNet = proto === "saman-ssp1126" || proto === "raw";
  return (
    <Card className="mb-8 p-5">
      <h2 className="font-bold">🔧 راه‌اندازی اتصال کارتخوان (RS232 / شبکه)</h2>
      <p className="mt-1 text-xs leading-6 text-stone-500">پروتکل PC-POS هر PSP اختصاصی است و باید ابتدا توسط پشتیبانی همان شرکت (سامان‌کیش، به‌پرداخت، پارسیان، سداد، آسان‌پرداخت…) روی دستگاه فعال شود. سپس تنظیمات زیر را در برنامه‌ی پل روی رایانه‌ی صندوق بگذارید.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="دستگاه پوز (کد اتصال)"><Select value={cur} onChange={(e) => setCode(e.target.value)}>{pos.length === 0 && <option value="pos01">ابتدا دستگاه پوز بسازید</option>}{pos.map((d) => <option key={d.id} value={d.code}>{d.name} — {d.code}</option>)}</Select></Field>
          <Field label="پروتکل" hint={POS_PROTOCOLS[proto].hint}><Select value={proto} onChange={(e) => setProto(e.target.value)}>{Object.entries(POS_PROTOCOLS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
          {isNet && <Field label="نوع اتصال"><Select value={t} onChange={(e) => { setT(e.target.value as "tcp" | "serial"); setF((x) => ({ ...x, baud: proto === "saman-ssp1126" ? "19200" : "9600" })); }}><option value="tcp">شبکه (TCP / Ethernet)</option><option value="serial">کابل سریال RS232 / USB-Serial</option></Select></Field>}
          {isNet && t === "tcp" && <div className="grid grid-cols-2 gap-3"><Field label="IP دستگاه"><Input dir="ltr" className="text-left" value={f.host} onChange={set("host")} /></Field><Field label="پورت"><Input dir="ltr" className="text-left" value={f.port} onChange={set("port")} /></Field></div>}
          {isNet && t === "serial" && <div className="grid grid-cols-2 gap-3"><Field label="پورت (COM3 یا /dev/ttyUSB0)"><Input dir="ltr" className="text-left" value={f.path} onChange={set("path")} /></Field><Field label="Baud"><Input dir="ltr" className="text-left" value={f.baud} onChange={set("baud")} /></Field></div>}
          {proto === "http" && <><Field label="آدرس سرویس"><Input dir="ltr" className="text-left" value={f.url} onChange={set("url")} /></Field><Field label="بدنه‌ی درخواست (JSON)"><Input dir="ltr" className="text-left" value={f.body} onChange={set("body")} /></Field><div className="grid grid-cols-3 gap-2"><Field label="فیلد نتیجه"><Input dir="ltr" value={f.successPath} onChange={set("successPath")} /></Field><Field label="مقدار موفق"><Input dir="ltr" value={f.successValue} onChange={set("successValue")} /></Field><Field label="فیلد پیگیری"><Input dir="ltr" value={f.refPath} onChange={set("refPath")} /></Field></div></>}
          {proto === "exec" && <Field label="دستور"><Input dir="ltr" className="text-left" value={f.exec} onChange={set("exec")} /></Field>}
          {proto === "raw" && <><Field label="فریم درخواست" hint="\\x02 = STX ، \\x03 = ETX ، {amountRial:12} = مبلغ ۱۲ رقمی"><Input dir="ltr" className="text-left" value={f.request} onChange={set("request")} /></Field><div className="grid grid-cols-3 gap-2"><Field label="پایان پاسخ"><Input dir="ltr" value={f.responseEnd} onChange={set("responseEnd")} /></Field><Field label="Regex موفقیت"><Input dir="ltr" value={f.successRegex} onChange={set("successRegex")} /></Field><Field label="Regex پیگیری"><Input dir="ltr" value={f.refRegex} onChange={set("refRegex")} /></Field></div></>}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-stone-600">فایل <code>bridge.config.json</code></p>
          <pre className="max-h-80 overflow-auto rounded-xl bg-stone-900 p-4 text-left text-[11px] leading-5 text-emerald-300" dir="ltr">{conf}</pre>
          <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(conf).then(() => toast("تنظیمات کپی شد"))}><Icon name="copy" className="size-4" /> کپی</Button><a href="/bridge/agent.mjs" download><Button size="sm" variant="secondary">⬇ برنامه‌ی پل (agent.mjs)</Button></a><a href="/bridge/pos-emulator.mjs" download><Button size="sm" variant="ghost">⬇ شبیه‌ساز تست</Button></a></div>
          <p className="mt-3 text-[11px] leading-6 text-stone-500">اجرا: <code dir="ltr">node agent.mjs bridge.config.json</code>{proto === "saman-ssp1126" && <> — پیش‌نیاز: <code dir="ltr">npm i saman-payment-pos{t === "serial" ? " serialport" : ""}</code></>}{proto === "raw" && t === "serial" && <> — پیش‌نیاز: <code dir="ltr">npm i serialport</code></>}</p>
        </div>
      </div>
    </Card>
  );
}

export function Devices() {
  return (
    <div className="animate-fade-in">
      <PageHeader title="اتوماسیون تبلت و پوز" subtitle="تبلت آشپزخانه (نمایشگر سفارش‌ها) و دستگاه‌های پوز را به سیستم متصل کنید" />
      <DevicePanel resource="dev_tablet" kinds={["tablet", "pos"]} extra={(d) => d.kind === "tablet" ? <Link href={`/tablet/${d.code}`} target="_blank"><Button size="sm">باز کردن نمایشگر</Button></Link> : null} hint={(d) => (d.kind === "tablet" ? `/tablet/${d.code}` : `/api/device/${d.code}/ping`)} />
      <PosRequests />
      <PosSetupLoader />
      <Card className="p-5 text-sm leading-8 text-stone-600"><b className="text-stone-800">نمایشگر آشپزخانه:</b> آدرس «باز کردن نمایشگر» را روی تبلت آشپزخانه باز کنید؛ سفارش‌ها بدون نیاز به ورود نمایش داده می‌شوند و آشپز با یک لمس وضعیت را به «در حال آماده‌سازی» و «آماده» تغییر می‌دهد. دستگاه‌های پوز با کد اتصال خود از طریق <code dir="ltr">/api/device/&lt;code&gt;/ping</code> وضعیت آنلاین خود را اعلام می‌کنند.</Card>
    </div>
  );
}

/* ---------- cloud printers ---------- */
type Job = { id: number; orderId: number | null; deviceName: string; status: string; content: string; createdAt: string; printedAt: string | null };
export function Printers() {
  const jobs = useCollection<Job>("/api/r/printjobs", { poll: 6000 });
  const toast = useToast();
  const [view, setView] = useState<Job | null>(null);
  async function test() {
    try { await api("/api/r/printjobs", { method: "POST" }); jobs.reload(true); toast("چاپ آزمایشی در صف قرار گرفت"); } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <div className="animate-fade-in">
      <PageHeader title="اتوماسیون پرینتر ابری" subtitle="هر سفارش جدید به‌صورت خودکار در صف چاپ پرینترهای متصل قرار می‌گیرد" actions={<Button variant="secondary" onClick={test}>🖨️ چاپ آزمایشی</Button>} />
      <DevicePanel resource="dev_printer" kinds={["printer"]} hint={(d) => `/api/device/${d.code}/jobs`} />
      <h2 className="mb-3 font-bold">صف و تاریخچه‌ی چاپ</h2>
      {jobs.loading ? <Skeleton className="h-40 rounded-2xl" /> : jobs.items.length === 0 ? <EmptyState emoji="🖨️" title="کار چاپی وجود ندارد" description="پس از افزودن پرینتر، هر سفارش جدید خودکار اینجا صف می‌شود." /> : (
        <Card className="divide-y divide-stone-100">{jobs.items.slice(0, 30).map((j) => (
          <div key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <Badge color={j.status === "printed" ? "emerald" : j.status === "failed" ? "rose" : "amber"}>{j.status === "printed" ? "چاپ شد" : j.status === "failed" ? "خطا" : "در صف"}</Badge>
            <span className="font-semibold">{j.orderId ? `سفارش #${toFa(j.orderId)}` : "چاپ آزمایشی"}</span><span className="text-xs text-stone-500">{j.deviceName}</span>
            <span className="text-xs text-stone-400">{timeAgo(j.createdAt)}</span>
            <span className="ms-auto flex gap-1"><Button size="sm" variant="ghost" onClick={() => setView(j)}>مشاهده رسید</Button><Button size="sm" variant="secondary" onClick={() => jobs.update(j.id, { status: "pending" }).then(() => toast("دوباره در صف قرار گرفت")).catch((e) => toast(e.message, "error"))}>چاپ مجدد</Button><IconButton icon="trash" label="حذف" onClick={() => jobs.remove(j.id).catch((e) => toast(e.message, "error"))} /></span>
          </div>
        ))}</Card>
      )}
      <Modal open={!!view} onClose={() => setView(null)} title="پیش‌نمایش رسید" size="sm">{view && <pre className="whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-center font-mono text-xs leading-7">{view.content}</pre>}</Modal>
    </div>
  );
}

/* ---------- caller id ---------- */
type Call = { id: number; phone: string; handled: boolean; createdAt: string; customer: { id: number; name: string; points: number; ordersCount: number; totalSpent: number } | null };
export function CallerId() {
  const calls = useCollection<Call>("/api/r/calls", { poll: 4000 });
  const toast = useToast();
  const [phone, setPhone] = useState("");
  async function simulate() {
    if (!phone.trim()) return;
    try { await calls.create({ phone }, { phone, handled: false, createdAt: new Date().toISOString(), customer: null }); setPhone(""); calls.reload(true); } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <div className="animate-fade-in">
      <PageHeader title="کالر آیدی" subtitle="با هر تماس ورودی، شماره و مشخصات مشتری نمایش داده می‌شود و سفارش با یک کلیک ثبت می‌شود" />
      <DevicePanel resource="dev_caller" kinds={["caller_id"]} hint={(d) => `/api/device/${d.code}/call  (POST {"phone":"0912…"})`} />
      <Card className="mb-5 flex flex-wrap items-end gap-3 p-4"><Field label="ثبت دستی تماس (وقتی دستگاه کالر آیدی متصل نیست)" className="min-w-56 flex-1"><Input dir="ltr" className="text-left" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09121234567" onKeyDown={(e) => e.key === "Enter" && simulate()} /></Field><Button onClick={simulate} disabled={!phone.trim()}>☎️ ثبت تماس</Button></Card>
      <h2 className="mb-3 font-bold">تماس‌های اخیر</h2>
      {calls.loading ? <Skeleton className="h-40 rounded-2xl" /> : calls.items.length === 0 ? <EmptyState emoji="☎️" title="تماسی ثبت نشده" description="تماس‌های ورودی دستگاه کالر آیدی اینجا نمایش داده می‌شوند." /> : (
        <div className="space-y-2.5">{calls.items.map((c) => (
          <Card key={c.id} className={cn("flex flex-wrap items-center gap-3 p-4 animate-pop", !c.handled && "ring-2 ring-brand-300")}>
            <span className={cn("flex size-11 items-center justify-center rounded-full text-lg", c.handled ? "bg-stone-100" : "animate-pulse bg-brand-100")}>☎️</span>
            <div className="min-w-48 flex-1"><p className="font-bold" dir="ltr" style={{ textAlign: "start" }}>{c.phone}</p>{c.customer ? <p className="text-xs text-emerald-700">💎 {c.customer.name} · {toFa(c.customer.ordersCount)} سفارش · {toFa(c.customer.points)} امتیاز · مجموع {formatPrice(c.customer.totalSpent)}</p> : <p className="text-xs text-stone-400">مشتری جدید / ناشناس</p>}</div>
            <span className="text-xs text-stone-400">{formatTime(c.createdAt)} · {timeAgo(c.createdAt)}</span>
            <Link href={`/dashboard/cashier?phone=${c.phone}`}><Button size="sm">ثبت سفارش</Button></Link>
            {!c.handled && <Button size="sm" variant="secondary" onClick={() => calls.update(c.id, { handled: true }).catch((e) => toast(e.message, "error"))}>بررسی شد</Button>}
          </Card>
        ))}</div>
      )}
    </div>
  );
}

/* ---------- scale ---------- */
export function Scale() {
  const dev = useCollection<Device>("/api/r/dev_scale", { poll: 3000 });
  const prods = useCollection<Product>("/api/products");
  const toast = useToast();
  const [did, setDid] = useState("");
  const [pid, setPid] = useState("");
  const [sim, setSim] = useState("");
  const d = dev.items.find((x) => String(x.id) === did) ?? dev.items[0];
  const p = prods.items.find((x) => String(x.id) === pid) ?? prods.items[0];
  async function setWeight(v: number) {
    if (!d) return;
    try { await dev.update(d.id, { lastValue: v }); } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <div className="animate-fade-in">
      <PageHeader title="ترازوی دیجیتال" subtitle="وزن به‌صورت زنده از ترازو دریافت و قیمت محصول بر اساس کیلوگرم محاسبه می‌شود" />
      <DevicePanel resource="dev_scale" kinds={["scale"]} hint={(x) => `/api/device/${x.code}/weight  (POST {"value":0.45})`} />
      {d && p && (
        <Card className="grid gap-6 p-5 md:grid-cols-2">
          <div className="space-y-3">
            <Field label="ترازو"><Select value={String(d.id)} onChange={(e) => setDid(e.target.value)}>{dev.items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
            <Field label="محصول (قیمت محصول = قیمت هر کیلوگرم)"><Select value={String(p.id)} onChange={(e) => setPid(e.target.value)}>{prods.items.map((x) => <option key={x.id} value={x.id}>{x.emoji} {x.name} — {formatPrice(x.price)}</option>)}</Select></Field>
            <div className="flex gap-2"><Input inputMode="decimal" placeholder="ورود دستی وزن (کیلوگرم)" value={sim} onChange={(e) => setSim(e.target.value)} /><Button variant="secondary" onClick={() => { const v = Number(sim.replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))); if (Number.isFinite(v) && v >= 0) { setWeight(v); setSim(""); } }}>ثبت وزن</Button></div>
          </div>
          <div className="rounded-3xl bg-stone-900 p-6 text-center text-white">
            <p className="text-xs text-stone-400">وزن فعلی</p>
            <p className="mt-2 font-mono text-5xl font-black tracking-wider text-emerald-400" dir="ltr">{d.lastValue.toFixed(3)}<span className="ms-2 text-lg text-stone-400">kg</span></p>
            <div className="mt-5 border-t border-white/10 pt-5"><p className="text-xs text-stone-400">قیمت قابل پرداخت</p><p className="mt-1 text-3xl font-extrabold">{formatPrice(Math.round(d.lastValue * p.price))}</p></div>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ---------- voice pager ---------- */
export function VoicePager() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [auto, setAuto] = useState(true);
  const [voiceOk, setVoiceOk] = useState(true);
  const seen = useRef<Set<number> | null>(null);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const toast = useToast();
  function speak(n: number) {
    if (typeof speechSynthesis === "undefined") return setVoiceOk(false);
    const u = new SpeechSynthesisUtterance(`سفارش شماره ${n} آماده تحویل است`);
    u.lang = "fa-IR";
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
  useEffect(() => {
    let live = true;
    const tick = () => api<{ items: Order[] }>("/api/orders?status=ready&limit=50").then((r) => {
      if (!live) return;
      setOrders(r.items);
      if (seen.current === null) seen.current = new Set(r.items.map((o) => o.id));
      else for (const o of r.items) if (!seen.current.has(o.id)) { seen.current.add(o.id); if (autoRef.current) speak(o.number); }
    }).catch((e) => toast(e.message, "error"));
    tick();
    const t = setInterval(tick, 5000);
    return () => { live = false; clearInterval(t); };
  }, [toast]);
  return (
    <div className="animate-fade-in">
      <PageHeader title="پیجر صوتی شماره فاکتور" subtitle="وقتی سفارشی «آماده» شود، شماره‌ی آن با صدا اعلام می‌شود" actions={<label className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm ring-1 ring-stone-200">اعلام خودکار <Switch checked={auto} onChange={setAuto} label="اعلام خودکار" /></label>} />
      {!voiceOk && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">مرورگر شما از تبدیل متن به گفتار پشتیبانی نمی‌کند.</p>}
      <Card className="mb-5 flex flex-wrap items-center gap-3 p-4"><span className="text-sm text-stone-600">برای اطمینان از فعال‌بودن صدا (مرورگر نیاز به یک تعامل دارد):</span><Button size="sm" variant="secondary" onClick={() => speak(1234)}>🔊 آزمایش صدا</Button></Card>
      {!orders ? <Skeleton className="h-40 rounded-2xl" /> : orders.length === 0 ? <EmptyState emoji="📢" title="سفارش آماده‌ای وجود ندارد" description="با تغییر وضعیت سفارش به «آماده سرو»، اینجا نمایش داده و اعلام می‌شود." /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{orders.map((o) => (
          <Card key={o.id} className="p-5 text-center ring-2 ring-violet-300 animate-pop"><p className="text-xs text-stone-500">شماره سفارش</p><p className="my-2 text-5xl font-black text-violet-600">{toFa(o.number)}</p><p className="text-xs text-stone-500">{o.tableName ?? (o.type === "delivery" ? "ارسال" : "بیرون‌بر")} · {timeAgo(o.updatedAt)}</p><Button className="mt-4 w-full" onClick={() => speak(o.number)}>📢 اعلام صوتی</Button><Button className="mt-2 w-full" variant="secondary" size="sm" onClick={() => api(`/api/orders/${o.id}`, { method: "PATCH", body: { status: "served" } }).then(() => setOrders((x) => x?.filter((y) => y.id !== o.id) ?? x))}>تحویل داده شد</Button></Card>
        ))}</div>
      )}
    </div>
  );
}

/* ---------- food court pagers ---------- */
type Pager = { id: number; number: number; status: string; orderId: number | null; orderNumber: number | null; ringRequestedAt: string | null; ringSentAt: string | null };
const PST: Record<string, string> = { free: "bg-emerald-50 text-emerald-700 ring-emerald-200", busy: "bg-amber-50 text-amber-800 ring-amber-300", ringing: "bg-rose-100 text-rose-700 ring-rose-400 animate-pulse" };
/** Drives a USB/serial pager transmitter straight from the browser (Web Serial API — Chrome / Edge, HTTPS). */
function SerialPagerBridge({ pagers, reload }: { pagers: Pager[]; reload: () => void }) {
  const toast = useToast();
  const [port, setPort] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [fmt, setFmt] = useState("R{n}\r\n");
  const [baud, setBaud] = useState("9600");
  const sent = useRef<Set<string>>(new Set());
  const supported = typeof navigator !== "undefined" && "serial" in navigator;
  useEffect(() => { const f = localStorage.getItem("pager.fmt"); const b = localStorage.getItem("pager.baud"); if (f) setFmt(f); if (b) setBaud(b); }, []);
  const cmd = (n: number) => fmt.replace(/\\r/g, "\r").replace(/\\n/g, "\n").replace(/\{n(?::(\d+))?\}/g, (_, w) => String(n).padStart(Number(w ?? 0), "0"));
  async function write(n: number) {
    const w = port.writable.getWriter();
    try { await w.write(new TextEncoder().encode(cmd(n))); } finally { w.releaseLock(); }
  }
  async function connect() {
    try {
      const p = await (navigator as any).serial.requestPort(); // eslint-disable-line @typescript-eslint/no-explicit-any
      await p.open({ baudRate: Number(baud) || 9600 });
      localStorage.setItem("pager.fmt", fmt); localStorage.setItem("pager.baud", baud);
      setPort(p); toast("فرستنده‌ی پیجر متصل شد");
    } catch (e) { toast((e as Error).message, "error"); }
  }
  useEffect(() => {
    if (!port) return;
    const due = pagers.filter((p) => p.status === "ringing" && p.ringRequestedAt && (!p.ringSentAt || p.ringSentAt < p.ringRequestedAt) && !sent.current.has(`${p.id}:${p.ringRequestedAt}`));
    if (!due.length) return;
    (async () => {
      const ids: number[] = [];
      for (const p of due) { try { sent.current.add(`${p.id}:${p.ringRequestedAt}`); await write(p.number); ids.push(p.id); } catch (e) { toast(`ارسال به فرستنده ناموفق: ${(e as Error).message}`, "error"); } }
      if (ids.length) { await api("/api/r/pagerack", { method: "POST", body: { ids } }).catch(() => {}); reload(); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagers, port]);
  return (
    <Card className="mb-5 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1"><p className="font-bold">🔌 اتصال فرستنده‌ی پیجر از همین مرورگر (USB / Serial)</p><p className="mt-1 text-xs leading-6 text-stone-500">این صفحه باید روی رایانه‌ی صندوق باز بماند. هر زنگ‌خوردن پیجر، فرمان را مستقیم به فرستنده می‌فرستد.</p></div>
        <Field label="فرمان ارسال" hint="{n} = شماره پیجر، {n:3} = سه رقمی"><Input dir="ltr" className="w-40 text-left" value={fmt} onChange={(e) => setFmt(e.target.value)} disabled={!!port} /></Field>
        <Field label="Baud"><Input dir="ltr" className="w-24 text-left" value={baud} onChange={(e) => setBaud(e.target.value)} disabled={!!port} /></Field>
        {!supported ? <Badge color="rose">مرورگر پشتیبانی نمی‌کند (Chrome/Edge)</Badge> : port ? <><Badge color="emerald">● متصل</Badge><Button size="sm" variant="secondary" onClick={() => write(1).then(() => toast("فرمان آزمایشی برای پیجر ۱ ارسال شد")).catch((e) => toast(e.message, "error"))}>تست پیجر ۱</Button></> : <Button onClick={connect}>اتصال به فرستنده</Button>}
      </div>
      <p className="mt-3 text-[11px] leading-6 text-stone-400">قالب فرمان را از دفترچه‌ی فرستنده‌ی پیجر خود وارد کنید. اگر فرستنده روی شبکه یا رایانه‌ی دیگری است، از «برنامه‌ی پل» (Bridge Agent) استفاده کنید — راهنما در فایل <code>docs/DEVICES.md</code>.</p>
    </Card>
  );
}

export function FoodCourtPager() {
  const pg = useCollection<Pager>("/api/r/pagers", { poll: 5000 });
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [assign, setAssign] = useState<Pager | null>(null);
  const [num, setNum] = useState("");
  useEffect(() => { api<{ items: Order[] }>("/api/orders?status=pending,preparing,ready&limit=80").then((r) => setOrders(r.items)).catch(() => {}); }, [assign]);
  const used = new Set(pg.items.map((p) => p.orderId).filter(Boolean));
  const fail = (e: unknown) => toast((e as Error).message, "error");
  async function add() {
    const n = Number(num.replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))));
    if (!n) return;
    try { await pg.create({ number: n }, { number: n, status: "free", orderId: null, orderNumber: null, ringRequestedAt: null, ringSentAt: null }); setNum(""); } catch (e) { fail(e); }
  }
  return (
    <div className="animate-fade-in">
      <PageHeader title="پیجر فودکورتی" subtitle="پیجر را به سفارش تخصیص دهید؛ با آماده‌شدن سفارش، پیجر به‌صورت خودکار زنگ می‌خورد" actions={<div className="flex gap-2"><Input className="w-28" placeholder="شماره پیجر" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} /><Button onClick={add}><Icon name="plus" className="size-4" /> افزودن</Button></div>} />
      <SerialPagerBridge pagers={pg.items} reload={() => pg.reload(true)} />
      <DevicePanel resource="dev_pager" kinds={["pager"]} hint={(d) => `/api/device/${d.code}/pager`} />
      <div className="mb-4 flex gap-3 text-xs"><Badge color="emerald">آزاد</Badge><Badge color="amber">در اختیار مشتری</Badge><Badge color="rose">در حال زنگ‌خوردن</Badge></div>
      {pg.loading ? <Skeleton className="h-48 rounded-2xl" /> : pg.items.length === 0 ? <EmptyState emoji="🔔" title="پیجری ثبت نشده" description="شماره‌ی پیجرهای فودکورت را اضافه کنید." /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{pg.items.map((p) => (
          <div key={p.id} className={cn("relative rounded-2xl p-4 text-center ring-1 transition animate-pop", PST[p.status])}>
            <button aria-label="حذف" className="absolute end-2 top-2 text-current opacity-30 hover:opacity-80" onClick={() => pg.remove(p.id).catch(fail)}><Icon name="x" className="size-4" /></button>
            <p className="text-3xl font-black">{toFa(p.number)}</p>
            <p className="mt-1 h-4 text-[11px]">{p.status === "free" ? "آزاد" : p.orderNumber ? `سفارش #${toFa(p.orderNumber)}` : "مشتری"}</p>
            <div className="mt-3 space-y-1.5">
              {p.status === "free" && <Button size="sm" className="w-full" onClick={() => setAssign(p)}>تخصیص</Button>}
              {p.status === "busy" && <Button size="sm" className="w-full" variant="secondary" onClick={() => pg.update(p.id, { status: "ringing" }).catch(fail)}>🔔 زنگ بزن</Button>}
              {p.status !== "free" && <Button size="sm" className="w-full" variant="ghost" onClick={() => pg.update(p.id, { status: "free", orderId: null }).catch(fail)}>تحویل شد / آزاد</Button>}
            </div>
          </div>
        ))}</div>
      )}
      <Modal open={!!assign} onClose={() => setAssign(null)} title={assign ? `تخصیص پیجر ${toFa(assign.number)} به سفارش` : ""} size="sm">
        {orders.filter((o) => !used.has(o.id)).length === 0 ? <p className="py-8 text-center text-sm text-stone-400">سفارش فعالِ بدون پیجر وجود ندارد.</p> : (
          <ul className="space-y-2">{orders.filter((o) => !used.has(o.id)).map((o) => (
            <li key={o.id}><button className="flex w-full items-center justify-between rounded-xl bg-stone-50 px-4 py-3 text-start text-sm hover:bg-brand-50" onClick={() => { const a = assign!; setAssign(null); pg.update(a.id, { status: o.status === "ready" ? "ringing" : "busy", orderId: o.id }).then(() => toast("پیجر تخصیص یافت")).catch(fail); }}><span><b>#{toFa(o.number)}</b> <span className="text-xs text-stone-500">{o.items.length} آیتم · {formatTime(o.createdAt)}</span></span><span className="font-bold">{formatPrice(o.total)}</span></button></li>
          ))}</ul>
        )}
      </Modal>
    </div>
  );
}
