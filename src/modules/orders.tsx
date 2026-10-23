"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useCollection } from "@/lib/api";
import {
  ACTIVE_STATUSES,
  formatDate,
  formatPrice,
  formatTime,
  ORDER_STATUSES,
  SOURCES,
  statusInfo,
  timeAgo,
  toFa,
} from "@/lib/format";
import type { Order, StaffMember } from "@/lib/types";
import {
  Badge,
  Button,
  AmountInput,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  cn,
  useToast, iconGlyph, EmojiIcon, IconText, Field} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { DELIVERY_STATUS } from "@/lib/admin-meta";
import { MapPicker } from "@/components/map-picker";
import { useFeatures } from "@/components/features";
import { api } from "@/lib/api";
import { workflowDisplayStageIndex, workflowDisplayStages } from "@/lib/order-workflow-core";
import type { SettlementInput } from "@/lib/order-settlement-core";
import { ManualOrderPrintButton } from "@/components/manual-order-print-button";

const TABS = [
  { key: "active", label: "فعال" },
  { key: "unpaid", label: "پرداخت‌نشده" },
  { key: "all", label: "همه" },
  ...ORDER_STATUSES.filter((s) => s.key !== "awaiting_payment").map((s) => ({ key: s.key, label: s.short })),
];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقدی", pos: "کارتخوان", card: "کارت", card_to_card: "کارت‌به‌کارت",
  ipg: "آنلاین", cashback: "اعتبار کیف پول", credit: "پرداخت بعداً", mixed: "ترکیبی",
};
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "پرداخت‌نشده", pending: "در انتظار تأیید", paid: "پرداخت‌شده",
  failed: "ناموفق", refunded: "بازپرداخت‌شده",
};

function PaymentStatusBadge({ order }: { order: Order }) {
  const method = order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod : "روش پرداخت ثبت نشده";
  if (order.paymentStatus === "paid") return <Badge color="emerald"><Icon name="check" className="size-3.5" /> پرداخت‌شده · {method}</Badge>;
  if (order.paymentStatus === "unpaid") return <Badge color="amber"><Icon name="clock" className="size-3.5" /> پرداخت‌نشده · {method}</Badge>;
  return <Badge color="stone">{PAYMENT_STATUS_LABELS[order.paymentStatus] ?? "وضعیت پرداخت نامشخص"} · {method}</Badge>;
}

const stripe: Record<string, string> = {
  pending: "bg-amber-400",
  preparing: "bg-blue-400",
  ready: "bg-violet-400",
  served: "bg-teal-400",
  paid: "bg-emerald-400",
  canceled: "bg-rose-400",
};

export default function OrdersPage() {
  const feat = useFeatures();
  const [tab, setTab] = useState("active");
  const archiveActive = tab === "deleted";
  const receiptArchive = tab === "receipts";
  const orders = useCollection<Order>(archiveActive ? "/api/orders?deleted=true&limit=300" : "/api/orders?limit=300", { poll: 8000 });
  const staff = useCollection<StaffMember>("/api/staff");
  const couriers = useCollection<{ id: number; name: string; status: string; activeCount: number; vehicle: string }>("/api/r/couriers");
  const toast = useToast();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Order | null>(null);
  const [revokingTracking, setRevokingTracking] = useState<Order | null>(null);
  const [workflowPreset, setWorkflowPreset] = useState<1 | 2 | 3 | 4>(4);
  const [settlementOrder, setSettlementOrder] = useState<Order | null>(null);
  const [settlementOptions, setSettlementOptions] = useState<{ banks: { id: number; name: string; bank: string }[]; posDevices: { id: number; name: string; terminalNumber: string; settlementBankAccountId: number | null; bankName: string; cashierEnabled: boolean; kioskEnabled: boolean; online: boolean }[] }>({ banks: [], posDevices: [] });
  const [cashAmount, setCashAmount] = useState("0");
  const [bankAmount, setBankAmount] = useState("0");
  const [bankAccountId, setBankAccountId] = useState("");
  const [posAmount, setPosAmount] = useState("0");
  const [posDeviceId, setPosDeviceId] = useState("");
  const [allowDebt, setAllowDebt] = useState(false);
  const [debtorName, setDebtorName] = useState("");
  const [debtorPhone, setDebtorPhone] = useState("");
  const [debtDescription, setDebtDescription] = useState("");
  const [settlementBusy, setSettlementBusy] = useState(false);
  const [completeAfterPayment, setCompleteAfterPayment] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ item: { settings?: { orderWorkflowPreset?: number } } }>("/api/business")
      .then(({ item }) => { if (live && [1, 2, 3, 4].includes(item.settings?.orderWorkflowPreset ?? 4)) setWorkflowPreset((item.settings?.orderWorkflowPreset ?? 4) as 1 | 2 | 3 | 4); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (feat.role === "waiter") return;
    let live = true;
    api<typeof settlementOptions>("/api/orders/settlement-options")
      .then((options) => { if (live) setSettlementOptions(options); })
      .catch(() => {});
    return () => { live = false; };
  }, [feat.role]);

  const workflowStages = useMemo(() => workflowDisplayStages(workflowPreset), [workflowPreset]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: archiveActive ? 0 : orders.items.filter((o) => !o.deletedAt).length, active: 0, unpaid: 0, deleted: archiveActive ? orders.items.length : 0, receipts: 0 };
    for (const o of orders.items) {
      c[o.status] = (c[o.status] ?? 0) + 1;
      if (ACTIVE_STATUSES.includes(o.status)) c.active++;
      if (!o.deletedAt && o.status !== "canceled" && o.paymentStatus === "unpaid") c.unpaid++;
    }
    return c;
  }, [orders.items, archiveActive]);

  const tabs = feat.isManager ? [...TABS, { key: "receipts", label: "آرشیو رسیدها" }, { key: "deleted", label: "حذف‌شده‌ها" }] : TABS;

  const filtered = useMemo(() => {
    if (receiptArchive) return [];
    const term = q.trim();
    return orders.items.filter((o) => {
      if (tab === "deleted") {
        if (!o.deletedAt) return false;
      } else {
        if (o.deletedAt) return false;
        if (tab === "unpaid") {
          if (o.status === "canceled" || o.paymentStatus !== "unpaid") return false;
        } else if (tab === "active" ? !ACTIVE_STATUSES.includes(o.status) : tab !== "all" && o.status !== tab) return false;
      }
      if (!term) return true;
      return (
        String(o.number).includes(term.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))) ||
        (o.tableName ?? "").includes(term) ||
        o.customerName.includes(term)
      );
    });
  }, [orders.items, tab, q, receiptArchive]);

  const selected = orders.items.find((o) => o.id === selectedId) ?? null;
  const unpaidOrders = useMemo(() => orders.items.filter((o) => !o.deletedAt && o.status !== "canceled" && o.paymentStatus === "unpaid"), [orders.items]);
  const cashierPosDevices = useMemo(() => settlementOptions.posDevices.filter((device) => device.cashierEnabled && device.settlementBankAccountId), [settlementOptions.posDevices]);
  const collectedNow = Number(cashAmount || 0) + Number(bankAmount || 0) + Number(posAmount || 0);
  const debtRemainder = settlementOrder ? settlementOrder.total - collectedNow : 0;
  const defaultCashierPosDevice = cashierPosDevices.find((device) => device.online) ?? cashierPosDevices[0];
  const selectedPosDevice = cashierPosDevices.find((device) => String(device.id) === posDeviceId) ?? defaultCashierPosDevice;
  const settlementInvalid = debtRemainder < 0 || (debtRemainder > 0 && !allowDebt) || (Number(bankAmount || 0) > 0 && !bankAccountId) || (Number(posAmount || 0) > 0 && (!selectedPosDevice?.online || !selectedPosDevice.settlementBankAccountId));

  function openSettlement(o: Order, complete = false) {
    setSelectedId(null);
    setSettlementOrder(o);
    const bankPrefill = o.paymentMethod === "card_to_card" ? o.total : 0;
    setCashAmount("0");
    setBankAmount(String(bankPrefill));
    setBankAccountId(String(settlementOptions.banks[0]?.id ?? ""));
    setPosAmount("0");
    setPosDeviceId(String(defaultCashierPosDevice?.id ?? ""));
    setAllowDebt(false);
    setDebtorName(o.customerName || "");
    setDebtorPhone(o.customerPhone || "");
    setDebtDescription(`باقی‌ماندهٔ سفارش شماره ${o.number}`);
    setCompleteAfterPayment(complete);
  }

  async function setStatus(o: Order, status: string) {
    if (status === "paid") {
      openSettlement(o, true);
      return;
    }
    try {
      await orders.update(o.id, { status });
      toast(`سفارش #${toFa(o.number)}: ${statusInfo(status).label}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function submitSettlement(event: FormEvent) {
    event.preventDefault();
    if (!settlementOrder || settlementBusy) return;
    const cash = Number(cashAmount || 0), bank = Number(bankAmount || 0), pos = Number(posAmount || 0);
    const remaining = settlementOrder.total - cash - bank - pos;
    if (remaining < 0) { toast("جمع مبالغ از مبلغ فاکتور بیشتر است", "error"); return; }
    if (remaining > 0 && !allowDebt) { toast("باقی‌مانده را پرداخت کنید یا ثبت در دفتر بدهکاران را فعال کنید", "error"); return; }
    const plan: SettlementInput = {
      cashAmount: cash,
      bankAmount: bank,
      bankAccountId: bankAccountId ? Number(bankAccountId) : null,
      posAmount: pos,
      posDeviceId: selectedPosDevice?.id ?? null,
      posBankAccountId: selectedPosDevice?.settlementBankAccountId ?? null,
      allowDebt,
      creditDetails: remaining > 0 ? { name: debtorName, phone: debtorPhone, type: "person", companyName: "", dueAt: null, description: debtDescription } : null,
      idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `order-${settlementOrder.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      completeOrder: completeAfterPayment,
    };
    setSettlementBusy(true);
    try {
      const result = await api<{ ok: true; pendingPos?: boolean; amount?: number }>(`/api/orders/${settlementOrder.id}/cashier`, { method: "POST", body: { action: "settle", settlement: plan } });
      setSettlementOrder(null);
      await orders.reload(true);
      if (result.pendingPos) toast(`${formatPrice(result.amount ?? pos)} به کارتخوان ارسال شد؛ ثبت پرداخت پس از تأیید دستگاه انجام می‌شود`);
      else toast(`تسویهٔ سفارش #${toFa(settlementOrder.number)} ثبت شد؛ سند حسابداری و ماندهٔ بدهی به‌روزرسانی شدند`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSettlementBusy(false);
    }
  }

  async function del(o: Order) {
    try {
      await orders.remove(o.id);
      setSelectedId(null);
      toast("سفارش حذف شد");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function restore(o: Order) {
    try {
      await api(`/api/orders/${o.id}`, { method: "PATCH", body: { restore: true } });
      setSelectedId(null);
      orders.reload(true);
      toast(`سفارش #${toFa(o.number)} بازگردانی شد`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function revokeTracking(o: Order) {
    try {
      await api(`/api/orders/${o.id}`, { method: "PATCH", body: { revokeTracking: true } });
      await orders.reload(true);
      setRevokingTracking(null);
      toast("پیوند رهگیری مشتری باطل شد.");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="سفارش‌ها"
        subtitle="سفارش‌های گارسون و مشتریان را لحظه‌ای مدیریت کنید"
        actions={
          <Link href="/dashboard/waiter">
            <Button>
              <Icon name="plus" className="size-4" /> سفارش جدید
            </Button>
          </Link>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSelectedId(null); }}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition",
                tab === t.key ? "bg-stone-900 text-white shadow" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50",
              )}
            >
              {t.label}
              <span className={cn("rounded-md px-1.5 text-[11px] font-bold", tab === t.key ? "bg-white/20" : "bg-stone-100 text-stone-500")}>
                {toFa(counts[t.key] ?? 0)}
              </span>
            </button>
          ))}
        </div>
        {!receiptArchive && <div className="relative w-full lg:w-64">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <Input className="ps-9" placeholder="جستجو: شماره، میز، مشتری" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>}
      </div>

      <IconText>{receiptArchive ? <ReceiptArchivePanel canPrint={feat.has("cloud_printer")} /> : <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="max-h-[65vh] min-w-0 overflow-y-auto overscroll-contain pe-1 lg:max-h-[calc(100dvh-20rem)]">
      {orders.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : orders.error ? (
        <ErrorState message={orders.error} onRetry={() => orders.reload()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={archiveActive ? "trash" : "orders"}
          title={archiveActive ? "سفارشی در بایگانی نیست" : orders.items.length === 0 ? "هنوز سفارشی ثبت نشده" : "سفارشی با این فیلتر پیدا نشد"}
          description={archiveActive ? "سفارش‌هایی که حذف می‌کنید برای پیگیری و بازگردانی در این بخش می‌مانند." : orders.items.length === 0 ? "با پنل گارسون اولین سفارش را ثبت کنید یا منتظر سفارش مشتریان از طریق QR باشید." : "فیلتر یا عبارت جستجو را تغییر دهید."}
          action={
            orders.items.length === 0 && (
              <Link href="/dashboard/waiter">
                <Button>ثبت اولین سفارش</Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((o) => {
            const s = statusInfo(o.status);
            const pendingOpt = o.id < 0;
            const stageIndex = workflowDisplayStageIndex(workflowPreset, o.status);
            return (
              <Card key={o.id} className={cn("relative flex flex-col overflow-hidden animate-pop", pendingOpt && "opacity-60")}>
                <span className={cn("absolute inset-y-0 end-0 w-1", stripe[o.status])} />
                <button className="flex flex-1 flex-col p-4 pe-5 text-start" onClick={() => setSelectedId(o.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-extrabold">#{toFa(o.number)}</p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {formatTime(o.createdAt)} · {timeAgo(o.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {o.deletedAt && <Badge color="rose">حذف‌شده</Badge>}
                    <Badge color="brand">
                      <Icon name={o.type === "takeaway" ? "cart" : o.type === "delivery" ? "motorcycle" : "table"} className="size-3.5" />
                      {o.type === "takeaway" ? "بیرون‌بر" : o.type === "delivery" ? "ارسال" : o.tableName ?? "بدون میز"}
                    </Badge>
                    <Badge>
                      <Icon name={o.source === "customer" ? "mobile" : o.source === "kiosk" ? "desktop" : "utensils"} className="size-3.5" />
                      {SOURCES[o.source] ?? o.source}
                    </Badge>
                    {o.scheduledFor && <Badge color="violet">{<EmojiIcon emoji="" />} پیش‌سفارش {formatTime(o.scheduledFor)}</Badge>}
                    <PaymentStatusBadge order={o} />
                    {o.paymentMethod === "card_to_card" && o.paymentStatus !== "paid" && <Badge color="amber"><Icon name="bank" className="size-3.5" />نیازمند بررسی رسید</Badge>}
                    {o.type === "delivery" && o.deliveryStatus !== "none" && <Badge color={DELIVERY_STATUS[o.deliveryStatus]?.[1]}>{<EmojiIcon emoji="" />} {DELIVERY_STATUS[o.deliveryStatus]?.[0]}{o.courierName ? ` · ${o.courierName}` : ""}</Badge>}
                    {o.type === "delivery" && o.deliveryStatus === "none" && !["paid", "canceled"].includes(o.status) && <Badge color="amber">{<EmojiIcon emoji="" />} پیک تعیین نشده</Badge>}
                  </div>
                  {stageIndex >= 0 && <div className="mt-3" aria-label={`مرحله نمایشی ${workflowStages[stageIndex].label}، ${stageIndex + 1} از ${workflowStages.length}`}>
                    <div className="mb-1 flex justify-between gap-2 text-[10px] text-stone-500"><span>مرحلهٔ نمایشی {toFa(stageIndex + 1)} از {toFa(workflowStages.length)}</span><span className="font-semibold text-stone-700">{workflowStages[stageIndex].label}</span></div>
                    <div className="flex gap-1">{workflowStages.map((stage, index) => <span key={stage.label} title={stage.label} className={cn("h-1.5 flex-1 rounded-full", index <= stageIndex ? "bg-brand-500" : "bg-stone-100")} />)}</div>
                  </div>}
                  <ul className="mt-3 flex-1 space-y-1 text-sm text-stone-600">
                    {o.items.slice(0, 3).map((i) => (
                      <li key={i.id} className="flex justify-between gap-2">
                        <span className="truncate">{<EmojiIcon emoji={i.emoji} /> } {i.name}</span>
                        <span className="shrink-0 text-stone-400">×{toFa(i.quantity)}</span>
                      </li>
                    ))}
                    {o.items.length > 3 && <li className="text-xs text-stone-400">+{toFa(o.items.length - 3)} مورد دیگر</li>}
                  </ul>
                  {o.note && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">{<EmojiIcon emoji="" />} {o.note}</p>}
                  <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
                    <span className="text-xs text-stone-500">{o.waiterName ? `گارسون: ${o.waiterName}` : o.customerName || "—"}</span>
                    <span className="font-extrabold">{formatPrice(o.total)}</span>
                  </div>
                </button>
                {s.next && (
                  <div className="px-4 pb-4 pe-5">
                    <Button size="sm" className="w-full" disabled={pendingOpt} onClick={() => setStatus(o, s.next!)}>
                      {s.nextLabel}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}</div>
      {!archiveActive && tab !== "unpaid" && <aside className="order-first rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3.5 shadow-sm xl:sticky xl:top-4 xl:order-last">
        <div className="flex items-start justify-between gap-2"><div><h2 className="flex items-center gap-2 text-sm font-extrabold text-amber-950"><Icon name="clock" className="size-4"/> سفارش‌های پرداخت‌نشده</h2><p className="mt-1 text-xs text-amber-900/70">سفارش‌های باز که هنوز وجهشان ثبت نشده است</p></div><Badge color="amber">{toFa(unpaidOrders.length)}</Badge></div>
        {orders.loading ? <Skeleton className="mt-3 h-24 rounded-xl"/> : orders.error ? <p className="mt-3 rounded-xl bg-white p-3 text-xs text-rose-700">بارگذاری سفارش‌ها ناموفق بود.</p> : unpaidOrders.length ? <div className="mt-3 max-h-[min(46vh,34rem)] space-y-2 overflow-y-auto pe-1">
          {unpaidOrders.slice(0, 12).map((order) => <button key={order.id} type="button" onClick={() => setSelectedId(order.id)} className="w-full rounded-xl border border-amber-100 bg-white p-2.5 text-start transition hover:border-amber-300 hover:shadow-sm">
            <span className="flex items-center justify-between gap-2"><b className="text-xs">#{toFa(order.number)}</b><span className="truncate text-[10px] font-semibold text-amber-800">{order.paymentMethod === "card_to_card" ? "کارت‌به‌کارت" : order.paymentMethod === "credit" ? "پرداخت بعداً" : statusInfo(order.status).short}</span></span>
            <span className="mt-1 block truncate text-[11px] text-stone-500">{order.tableName || (order.type === "delivery" ? "ارسال" : "بیرون‌بر")} · {order.customerName || "مشتری"}</span>
            <span className="mt-1 flex items-center justify-between gap-2"><span className="text-[10px] text-stone-400">{formatTime(order.createdAt)}</span><b className="text-xs">{formatPrice(order.total)}</b></span>
          </button>)}
          {unpaidOrders.length > 12 && <p className="px-1 text-[11px] text-stone-500">۱۲ سفارش اخیر نشان داده می‌شود.</p>}
          <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => { setTab("unpaid"); setSelectedId(null); }}>نمایش همهٔ پرداخت‌نشده‌ها</Button>
        </div> : <div className="mt-3 rounded-xl border border-dashed border-amber-200 bg-white/70 px-3 py-5 text-center text-xs text-stone-500">سفارش پرداخت‌نشده‌ای وجود ندارد.</div>}
      </aside>}
      </div>}</IconText>

      {/* Detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? `سفارش #${toFa(selected.number)}` : ""}
        size="md"
        footer={
          selected && (
            selected.deletedAt ? <Button className="me-auto" onClick={() => restore(selected)}>بازگردانی سفارش</Button> : <>
              {feat.isManager && <Button variant="ghost" className="me-auto text-rose-600 hover:bg-rose-50" onClick={() => setDeleting(selected)}>
                <Icon name="trash" className="size-4" /> حذف
              </Button>}
              {feat.isManager && ["customer", "kiosk"].includes(selected.source) && selected.trackingActive && <Button variant="secondary" onClick={() => setRevokingTracking(selected)}>
                <Icon name="link" className="size-4" /> ابطال پیوند رهگیری
              </Button>}
              <ManualOrderPrintButton orderId={selected.id} kind="customer" label="رسید" disabled={!feat.has("cloud_printer")} />
              {feat.role !== "waiter" && selected.paymentStatus !== "paid" && selected.status !== "canceled" && !selected.paymentBreakdown && selected.paymentMethod !== "credit" && (
                <Button onClick={() => openSettlement(selected, selected.status === "served")}><Icon name="wallet" className="size-4" />ثبت پرداخت</Button>
              )}
              {feat.role !== "waiter" && (selected.paymentBreakdown?.creditAmount ?? 0) > 0 && <Link href="/dashboard/receivables"><Button variant="secondary"><Icon name="bank" className="size-4" />مشاهده بدهکاران</Button></Link>}
              {feat.role !== "waiter" && selected.paymentMethod === "credit" && !selected.paymentBreakdown && <Link href="/dashboard/receivables"><Button variant="secondary"><Icon name="bank" className="size-4" />مشاهده بدهکاران</Button></Link>}
              {selected.status !== "canceled" && selected.status !== "paid" && (
                <Button variant="secondary" onClick={() => setStatus(selected, "canceled")}>
                  لغو سفارش
                </Button>
              )}
              {statusInfo(selected.status).next && statusInfo(selected.status).next !== "paid" && (
                <Button onClick={() => setStatus(selected, statusInfo(selected.status).next!)}>{statusInfo(selected.status).nextLabel}</Button>
              )}
            </>
          )
        }
      >
        <IconText>{selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              {selected.deletedAt && <Badge color="rose">حذف‌شده</Badge>}
              <Badge color="brand">{selected.type === "takeaway" ? "بیرون‌بر" : selected.type === "delivery" ? "ارسال" : selected.tableName ?? "بدون میز"}</Badge>
              <PaymentStatusBadge order={selected} />
              <span className="text-xs text-stone-500">
                {formatDate(selected.createdAt)} · {formatTime(selected.createdAt)}
              </span>
              {selected.deletedAt && <span className="w-full rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">حذف‌شده در {formatDate(selected.deletedAt)}، ساعت {formatTime(selected.deletedAt)}{selected.deletedBy ? ` توسط ${selected.deletedBy}` : ""}</span>}
            </div>

            <div className="overflow-hidden rounded-xl ring-1 ring-stone-200">
              {selected.items.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 text-sm last:border-0">
                  <span className="min-w-0 truncate">
                    {<EmojiIcon emoji={i.emoji} /> } {i.name} <span className="text-stone-400">×{toFa(i.quantity)}</span>
                  </span>
                  <span className="shrink-0 font-semibold">{formatPrice(i.lineTotal ?? i.price * i.quantity)}</span>
                </div>
              ))}
              <div className="space-y-1.5 bg-stone-50 px-4 py-3 text-sm">
                <Row label="جمع اقلام" value={formatPrice(selected.subtotal)} />
                {selected.membershipDiscount > 0 && <Row label={`مزیت عضویت (${selected.membershipSnapshot?.tierName ?? "سطح مشتری"})`} value={`-${formatPrice(selected.membershipDiscount)}`} />}
                {selected.discountAmount > selected.membershipDiscount && <Row label={`تخفیف${selected.discountCode ? ` (${selected.discountCode})` : ""}`} value={`-${formatPrice(selected.discountAmount - selected.membershipDiscount)}`} />}
                {selected.deliveryFee > 0 && <Row label="هزینه ارسال" value={formatPrice(selected.deliveryFee)} />}
                {selected.cashbackUsed > 0 && <Row label="اعتبار کش‌بک" value={`-${formatPrice(selected.cashbackUsed)}`} />}
                {selected.tax > 0 && <Row label="مالیات" value={formatPrice(selected.tax)} />}
                {selected.service > 0 && <Row label="خدمات" value={formatPrice(selected.service)} />}
                <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-extrabold">
                  <span>مبلغ نهایی</span>
                  <span>{formatPrice(selected.total)}</span>
                </div>
              </div>
            </div>

            {selected.paymentBreakdown && <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm">
              <p className="mb-2 flex items-center gap-2 font-extrabold text-emerald-950"><Icon name="check" className="size-4"/>جزئیات ثبت تسویه</p>
              {selected.paymentBreakdown.cashAmount > 0 && <Row label="دریافت نقدی" value={formatPrice(selected.paymentBreakdown.cashAmount)} />}
              {selected.paymentBreakdown.bankAmount > 0 && <Row label={`واریز به ${selected.paymentBreakdown.bankAccountName || "بانک"}`} value={formatPrice(selected.paymentBreakdown.bankAmount)} />}
              {selected.paymentBreakdown.posAmount > 0 && <Row label={`کارتخوان ${selected.paymentBreakdown.posDeviceName || ""}${selected.paymentBreakdown.posTerminalNumber ? ` · شماره ${selected.paymentBreakdown.posTerminalNumber}` : ""} · ${selected.paymentBreakdown.posBankAccountName || "بانک"}`} value={`${formatPrice(selected.paymentBreakdown.posAmount)}${selected.paymentBreakdown.posRefNo ? ` · پیگیری ${selected.paymentBreakdown.posRefNo}` : ""}`} />}
              {selected.paymentBreakdown.creditAmount > 0 && <Row label={`ثبت در بدهکاران${selected.paymentBreakdown.creditCustomerName ? ` · ${selected.paymentBreakdown.creditCustomerName}` : ""}`} value={formatPrice(selected.paymentBreakdown.creditAmount)} />}
              <Row label="جمع فاکتور" value={formatPrice(selected.total)} />
            </div>}

            {selected.note && <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">{<EmojiIcon emoji="" />} {selected.note}</p>}
            {selected.address && <p className="rounded-xl bg-sky-50 px-3.5 py-2.5 text-sm text-sky-900">{<EmojiIcon emoji="" />} {selected.address}{selected.customerPhone && <span className="mt-1 block text-xs" dir="ltr" style={{ textAlign: "start" }}>{selected.customerPhone}</span>}{selected.courierName && <span className="mt-1 block text-xs">{<EmojiIcon emoji="" />} پیک: {selected.courierName}</span>}</p>}
            {selected.lat != null && selected.lng != null && <div className="space-y-2"><MapPicker readOnly height={190} value={{ lat: selected.lat, lng: selected.lng }} /><a className="inline-flex items-center gap-1 text-xs font-bold text-brand-600" target="_blank" href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}>{<EmojiIcon emoji="" />} مسیریابی تا مقصد</a></div>}
            {!selected.deletedAt && selected.type === "delivery" && selected.status !== "canceled" && (
              <div className="space-y-3 rounded-2xl bg-sky-50/70 p-4 ring-1 ring-sky-200">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-extrabold">{<EmojiIcon emoji="" />} ارسال با پیک</p><Badge color={DELIVERY_STATUS[selected.deliveryStatus]?.[1]}>{DELIVERY_STATUS[selected.deliveryStatus]?.[0]}</Badge></div>
                {(selected.deliveryStatus === "not_home" || selected.deliveryStatus === "failed") && <p className="rounded-xl bg-rose-100 p-3 text-sm font-semibold text-rose-800">{selected.deliveryStatus === "not_home" ? "پیک گزارش داد مشتری در محل حاضر نبود." : "پیک گزارش داد سفارش تحویل داده نشد."}{selected.courierNote && <span className="mt-1 block font-normal">«{selected.courierNote}»</span>} می‌توانید سفارش را به پیک دیگری بسپارید یا لغو کنید.</p>}
                {selected.deliveryStatus === "delivered" ? (
                  <p className="text-sm text-emerald-800">{<EmojiIcon emoji="" />} تحویل توسط <b>{selected.courierName}</b>{selected.deliveryFinishedAt && ` در ساعت ${formatTime(selected.deliveryFinishedAt)}`}.</p>
                ) : selected.deliveryStatus === "picked_up" ? (
                  <p className="text-sm text-amber-800">{<EmojiIcon emoji="" />} سفارش در دست <b>{selected.courierName}</b> و در مسیر مشتری است.</p>
                ) : !feat.has("courier") ? <p className="text-xs text-stone-500">قابلیت مدیریت پیک در پلن شما فعال نیست.</p> : couriers.items.length === 0 ? (
                  <p className="text-sm text-stone-600">هنوز پیکی تعریف نشده است. <Link href="/dashboard/couriers" className="font-bold text-brand-600 underline">افزودن پیک</Link></p>
                ) : (
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-stone-600">{selected.courierId ? "تغییر پیک" : "انتخاب پیک و ارسال"}</span>
                    <Select value={selected.courierId ?? ""} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; const c = couriers.items.find((x) => x.id === v); orders.update(selected.id, { courierId: v, courierName: c?.name ?? null, deliveryStatus: v ? "assigned" : "none" }).then(() => toast(v ? `سفارش به ${c?.name} سپرده شد` : "پیک برداشته شد")).catch((err) => toast(err.message, "error")); }}>
                      <option value="">— بدون پیک —</option>
                      {couriers.items.filter((c) => c.status !== "off" || c.id === selected.courierId).map((c) => <option key={c.id} value={c.id}>{c.name} — {c.vehicle}{c.activeCount ? ` (${toFa(c.activeCount)} سفارش فعال)` : ""}</option>)}
                    </Select></label>
                )}
                {selected.deliveryStatus === "assigned" && selected.status !== "ready" && selected.status !== "served" && <p className="text-xs text-stone-500">پیک می‌تواند پس از «آماده سرو» شدن سفارش، آن را تحویل بگیرد.</p>}
              </div>
            )}
            {selected.scheduledFor && <p className="rounded-xl bg-violet-50 px-3.5 py-2.5 text-sm text-violet-900">{<EmojiIcon emoji="" />} پیش‌سفارش برای {formatDate(selected.scheduledFor)} ساعت {formatTime(selected.scheduledFor)}</p>}
            {selected.customerName && <p className="text-sm text-stone-600">مشتری: <b>{selected.customerName}</b></p>}

            {!selected.deletedAt && <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-stone-600">گارسون</span>
                <Select
                  value={selected.waiterId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : null;
                    const w = staff.items.find((s) => s.id === v);
                    orders.update(selected.id, { waiterId: v, waiterName: w?.name ?? null }).catch((err) => toast(err.message, "error"));
                  }}
                >
                  <option value="">— بدون گارسون —</option>
                  {staff.items.filter((s) => s.role === "waiter" && s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-stone-600">تغییر وضعیت</span>
                <Select value={selected.status} onChange={(e) => setStatus(selected, e.target.value)}>
                  {ORDER_STATUSES.filter((s) => s.key !== "paid" || selected.status === "paid").map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </Select>
              </label>
            </div>}
          </div>
        )}</IconText>
      </Modal>

      <Modal
        open={!!settlementOrder}
        onClose={() => !settlementBusy && setSettlementOrder(null)}
        title={settlementOrder ? `ثبت تسویه سفارش #${toFa(settlementOrder.number)}` : "ثبت تسویه"}
        description="مبلغ فاکتور را بین دریافت نقدی، حساب بانکی، کارتخوان و ماندهٔ بدهکار تفکیک کنید. سند حسابداری با همین تفکیک ثبت می‌شود."
        size="lg"
        footer={<>
          <Button variant="secondary" disabled={settlementBusy} onClick={() => setSettlementOrder(null)}>انصراف</Button>
          <Button type="submit" form="order-settlement-form" disabled={settlementBusy || settlementInvalid} loading={settlementBusy}>
            <Icon name={Number(posAmount || 0) > 0 ? "send" : "check"} className="size-4" />
            {Number(posAmount || 0) > 0 ? "ارسال مبلغ پوز و انتظار تأیید" : "ثبت تسویه و سند"}
          </Button>
        </>}
      >
        {settlementOrder && <form id="order-settlement-form" onSubmit={submitSettlement} className="space-y-4">
          <div className="grid gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 sm:grid-cols-3">
            <div><p className="text-xs text-sky-800">مبلغ فاکتور</p><b className="mt-1 block text-base font-extrabold text-sky-950">{formatPrice(settlementOrder.total)}</b></div>
            <div><p className="text-xs text-sky-800">دریافتی فعلی</p><b className="mt-1 block text-base font-extrabold text-sky-950">{formatPrice(collectedNow)}</b></div>
            <div><p className="text-xs text-sky-800">ماندهٔ فاکتور</p><b className={cn("mt-1 block text-base font-extrabold", debtRemainder < 0 ? "text-rose-700" : debtRemainder > 0 ? "text-amber-800" : "text-emerald-800")}>{formatPrice(debtRemainder)}</b></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="دریافت نقدی (تومان)">
              <AmountInput value={cashAmount} onValueChange={setCashAmount} placeholder="۰" aria-label="مبلغ دریافتی نقدی" />
            </Field>
            <Field label="واریز بانکی یا کارت‌به‌کارت (تومان)">
              <AmountInput value={bankAmount} onValueChange={setBankAmount} placeholder="۰" aria-label="مبلغ واریز بانکی" />
            </Field>
            {Number(bankAmount || 0) > 0 && <Field label="حساب بانکی مقصد">
              <Select required value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)}>
                <option value="">انتخاب بانک</option>
                {settlementOptions.banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.bank ? `${bank.bank} — ` : ""}{bank.name}</option>)}
              </Select>
              {settlementOptions.banks.length === 0 && <span className="mt-1 block text-[11px] text-amber-700">برای ثبت دریافت بانکی ابتدا یک حساب در بخش <Link className="font-bold underline" href="/dashboard/bank">مدیریت بانک</Link> تعریف کنید.</span>}
            </Field>}
            {feat.has("tablet_pos") && <Field label="مبلغ کارتخوان (تومان)" hint="فقط همین مبلغ به دستگاه انتخاب‌شده فرستاده می‌شود.">
              <AmountInput value={posAmount} onValueChange={setPosAmount} placeholder="۰" aria-label="مبلغ کارتخوان" />
            </Field>}
            {feat.has("tablet_pos") && Number(posAmount || 0) > 0 && <Field label="دستگاه کارتخوان" hint="دستگاه پیش‌فرض صندوق انتخاب شده؛ می‌توانید آن را تغییر دهید.">
              <Select required value={String(selectedPosDevice?.id ?? "")} onChange={(event) => {
                const nextId = event.target.value;
                setPosDeviceId(nextId);
              }}>
                <option value="">انتخاب کارتخوان متصل</option>
                {cashierPosDevices.map((device) => <option key={device.id} value={device.id} disabled={!device.online}>{device.name}{device.terminalNumber ? ` · شماره ${device.terminalNumber}` : ""}{device.online ? " — آنلاین" : " — آفلاین"}</option>)}
              </Select>
              {cashierPosDevices.length === 0 && <span className="mt-1 block text-[11px] text-amber-700">کارتخوانی به صندوق سفارش و حساب بانکی متصل نشده است. تنظیمات را در بخش <Link className="font-bold underline" href="/dashboard/devices">تبلت و پوز</Link> تکمیل کنید.</span>}
              {cashierPosDevices.length > 0 && !cashierPosDevices.some((device) => device.online) && <span className="mt-1 block text-[11px] text-amber-700">کارتخوان صندوق آنلاین نیست؛ اتصال عامل کارتخوان را بررسی کنید.</span>}
            </Field>}
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <input type="checkbox" className="checkbox checkbox-sm mt-0.5" checked={allowDebt} onChange={(event) => setAllowDebt(event.target.checked)} />
            <span><b>ثبت باقیمانده در دفتر بدهکاران</b><span className="mt-0.5 block text-xs leading-5 text-amber-900">مانده به نام مشتری ثبت و در دریافتنی‌ها و سند حسابداری منظور می‌شود.</span></span>
          </label>

          {allowDebt && debtRemainder > 0 && <div className="grid gap-3 rounded-xl border border-amber-200 p-3 sm:grid-cols-2">
            <Field label="نام بدهکار"><Input required maxLength={80} value={debtorName} onChange={(event) => setDebtorName(event.target.value)} placeholder="نام مشتری یا مسئول حساب" /></Field>
            <Field label="شماره موبایل بدهکار"><Input required inputMode="tel" maxLength={20} value={debtorPhone} onChange={(event) => setDebtorPhone(event.target.value)} placeholder="۰۹۱۲…" /></Field>
            <Field label="شرح بدهی (اختیاری)" className="sm:col-span-2"><Input maxLength={500} value={debtDescription} onChange={(event) => setDebtDescription(event.target.value)} placeholder="شرح ثبت در دفتر بدهکاران" /></Field>
          </div>}

          {debtRemainder < 0 && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">جمع مبالغ دریافتی از مبلغ فاکتور بیشتر است.</p>}
          {debtRemainder > 0 && !allowDebt && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">برای ثبت پرداخت ناقص، مانده را در دفتر بدهکاران ثبت کنید یا مبلغ‌های دریافتی را کامل کنید.</p>}
        </form>}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="حذف سفارش"
        message={deleting ? `سفارش #${toFa(deleting.number)} از فهرست جاری خارج می‌شود و برای پیگیری یا بازگردانی در بخش «حذف‌شده‌ها» نگه داشته می‌شود.` : ""}
        onConfirm={() => deleting && del(deleting)}
        onClose={() => setDeleting(null)}
      />
      <ConfirmDialog
        open={!!revokingTracking}
        title="ابطال پیوند رهگیری"
        message={revokingTracking ? `پیوند رهگیری سفارش #${toFa(revokingTracking.number)} دیگر برای مشتری قابل استفاده نخواهد بود.` : ""}
        onConfirm={() => revokingTracking && revokeTracking(revokingTracking)}
        onClose={() => setRevokingTracking(null)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-stone-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

type ArchiveReceipt = { id: number; number: number; createdAt: string; status: string; paymentStatus: string; total: number; type: string };
function ReceiptArchivePanel({ canPrint }: { canPrint: boolean }) {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [version, setVersion] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [items, setItems] = useState<ArchiveReceipt[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams();
    if (appliedQuery) params.set("q", appliedQuery);
    if (cursor !== null) params.set("cursor", String(cursor));
    api<{ items: ArchiveReceipt[]; nextCursor: number | null }>(`/api/receipt-archive?${params.toString()}`)
      .then((result) => {
        if (!live) return;
        setItems((existing) => cursor === null ? result.items : [...existing, ...result.items]);
        setNextCursor(result.nextCursor);
        setError("");
      })
      .catch((cause) => { if (live) setError((cause as Error).message); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [appliedQuery, cursor, version]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setItems([]);
    setNextCursor(null);
    setCursor(null);
    setAppliedQuery(query.trim());
    setVersion((current) => current + 1);
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-bold">آرشیو سفارش برای چاپ مجدد رسید</h2><p className="mt-1 text-xs text-stone-500">جست‌وجوی سروری در شماره سفارش یا اطلاعات ثبت‌شده؛ هر صفحه حداکثر ۵۰ رسید است.</p></div>
      <form onSubmit={search} className="flex w-full gap-2 sm:w-auto"><Input className="min-w-0 sm:w-72" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="شماره سفارش، نام یا موبایل" /><Button type="submit" variant="secondary"><Icon name="search" className="size-4" /> جست‌وجو</Button></form>
    </div>
    {error ? <ErrorState message={error} onRetry={() => { setBusy(true); setVersion((current) => current + 1); }} /> : items.length === 0 && !busy ? <EmptyState icon="receipt" title="رسیدی پیدا نشد" description="عبارت جست‌وجو را تغییر دهید یا شماره سفارش را وارد کنید." /> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Card key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="font-extrabold">سفارش #{toFa(item.number)}</p><p className="mt-1 text-xs text-stone-500">{formatDate(item.createdAt)} · {formatTime(item.createdAt)} · {statusInfo(item.status).label}</p><p className="mt-1 text-sm font-bold">{formatPrice(item.total)}{item.paymentStatus === "paid" ? " · پرداخت‌شده" : " · تسویه‌نشده"}</p></div>
        <ManualOrderPrintButton orderId={item.id} kind="customer" label="چاپ مجدد" disabled={!canPrint} />
      </Card>)}</div>
      {busy && <Skeleton className="h-20 rounded-2xl" />}
      {!busy && nextCursor !== null && <div className="flex justify-center"><Button variant="secondary" onClick={() => { setBusy(true); setCursor(nextCursor); }}>رسیدهای قدیمی‌تر</Button></div>}
    </>}
    <p className="text-xs leading-6 text-stone-500">رسید از snapshot نام و قیمت ذخیره‌شده در اقلام سفارش چاپ می‌شود؛ بازچاپ وضعیت سفارش/پرداخت را تغییر نمی‌دهد.</p>
  </div>;
}
