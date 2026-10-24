"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toFa } from "@/lib/format";
import { Button, Card, Icon, PageHeader, Select, useToast } from "@/components/ui";

type Feedback = {
  id: number;
  type: "suggestion" | "complaint";
  message: string;
  status: "open" | "in_progress" | "resolved";
  customerName: string;
  customerPhone: string;
  createdAt: string;
};

const STATUS: Record<Feedback["status"], string> = {
  open: "جدید",
  in_progress: "در حال پیگیری",
  resolved: "رسیدگی‌شده",
};

export default function CustomerFeedback() {
  const toast = useToast();
  const [items, setItems] = useState<Feedback[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(0);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ items: Feedback[] }>("/api/r/customer_feedback");
      setItems(result.items);
    } catch (cause) {
      setError((cause as Error).message || "دریافت پیام‌ها انجام نشد");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function updateStatus(item: Feedback, status: Feedback["status"]) {
    setBusyId(item.id);
    try {
      await api(`/api/r/customer_feedback/${item.id}`, { method: "PATCH", body: { status } });
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, status } : row));
      toast("وضعیت پیام به‌روز شد");
    } catch (cause) {
      toast((cause as Error).message || "ذخیره وضعیت انجام نشد", "error");
    } finally {
      setBusyId(0);
    }
  }

  const filtered = filter === "all" ? items : items.filter((item) => item.status === filter);

  return <>
    <PageHeader title="پیشنهادها و شکایت‌های مشتریان" subtitle="پیام‌های ثبت‌شده در پروفایل منوی آنلاین را بررسی و وضعیت رسیدگی را مشخص کنید."
      actions={<Button variant="secondary" size="sm" onClick={() => void load()} loading={loading}><Icon name="refresh" className="size-4" /> تازه‌سازی</Button>} />
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-blue-50 px-3 py-1.5 font-bold text-blue-800">{toFa(items.filter((item) => item.status === "open").length)} پیام جدید</span>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 font-bold text-amber-800">{toFa(items.filter((item) => item.status === "in_progress").length)} در حال پیگیری</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-bold text-emerald-800">{toFa(items.filter((item) => item.status === "resolved").length)} رسیدگی‌شده</span>
        </div>
        <Select aria-label="فیلتر وضعیت پیام" className="w-full sm:w-48" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">همه پیام‌ها</option>
          <option value="open">جدید</option>
          <option value="in_progress">در حال پیگیری</option>
          <option value="resolved">رسیدگی‌شده</option>
        </Select>
      </div>
      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {loading ? <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((key) => <div key={key} className="skeleton h-40 rounded-2xl" />)}</div>
        : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-base-300 px-4 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-base-200 text-base-content/50"><Icon name="message" /></span>
          <p className="mt-3 text-sm font-bold">{items.length ? "پیامی در این وضعیت نیست" : "هنوز پیشنهادی یا شکایتی ثبت نشده"}</p>
          <p className="mt-1 text-xs leading-6 text-base-content/55">با فعال‌کردن این امکان در تنظیمات، مشتریان می‌توانند از پروفایل خود پیام بفرستند.</p>
        </div> : <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((item) => <article key={item.id} className="rounded-2xl border border-base-300 bg-base-100 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${item.type === "complaint" ? "bg-rose-50 text-rose-800" : "bg-sky-50 text-sky-800"}`}>{item.type === "complaint" ? "شکایت" : "پیشنهاد"}</span>
                <span className="text-[11px] text-base-content/50">{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</span>
              </div>
              <Select aria-label="وضعیت رسیدگی" className="h-9 w-40 text-xs" value={item.status} disabled={busyId === item.id} onChange={(event) => void updateStatus(item, event.target.value as Feedback["status"])}>
                {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <Icon name="users" className="size-4 text-base-content/45" />
              <span className="font-bold">{item.customerName}</span>
              <span dir="ltr" className="text-base-content/55">{item.customerPhone}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-base-content/85">{item.message}</p>
          </article>)}
        </div>}
    </Card>
  </>;
}
