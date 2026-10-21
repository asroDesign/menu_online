"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useFeatures } from "@/components/features";
import { Badge, Button, Card, ErrorState, Field, Icon, Input, Modal, PageHeader, PersianDateInput, Select, Skeleton, useToast } from "@/components/ui";

type StaffOption = { id: number; name: string; role: string; isActive: boolean };
type Schedule = { id: number; staffId: number; staffName: string; startsAt: string; endsAt: string; location: string; version: number };
type Leave = { id: number; staffId: number; staffName: string; startsAt: string; endsAt: string; kind: string; reason: string; status: string; decisionNote: string };
type Data = { items: Schedule[]; leaveRequests: Leave[]; mine: boolean; staffId: number | null };

const roleNames: Record<string, string> = { waiter: "گارسون", cashier: "صندوقدار", chef: "آشپزخانه", warehouse: "انباردار", accountant: "حسابدار", manager: "مدیر" };
const leaveNames: Record<string, string> = { personal: "شخصی", sick: "استعلاجی", unpaid: "بدون حقوق" };
const formatDateTime = (value: string) => `${formatDate(value)}، ${new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" }).format(new Date(value))}`;

export default function StaffSchedule() {
  const { isManager } = useFeatures();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [employees, setEmployees] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [leaveKind, setLeaveKind] = useState("personal");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    await Promise.resolve();
    setLoading(true); setError("");
    try {
      const result = await api<Data>("/api/staff-schedule");
      setData(result);
      if (isManager) {
        const staffResult = await api<{ items: StaffOption[] }>("/api/staff");
        setEmployees(staffResult.items.filter((member) => member.isActive));
      }
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, [isManager]);

  useEffect(() => { const task = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(task); }, [load, refresh]);

  async function createSchedule() {
    const id = Number(staffId || employees[0]?.id);
    if (!id || !startsAt || !endsAt) return toast("کارمند و بازه زمانی شیفت را وارد کنید.", "error");
    setBusy(true);
    try {
      await api("/api/staff-schedule", { method: "POST", body: { staffId: id, startsAt, endsAt, location } });
      setScheduleOpen(false); setStartsAt(""); setEndsAt(""); setLocation(""); setRefresh((value) => value + 1); toast("شیفت ثبت شد.");
    } catch (cause) { toast((cause as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function requestLeave() {
    if (!startsAt || !endsAt) return toast("بازه مرخصی را وارد کنید.", "error");
    setBusy(true);
    try {
      await api("/api/staff-schedule/leave", { method: "POST", body: { startsAt, endsAt, kind: leaveKind, reason } });
      setLeaveOpen(false); setStartsAt(""); setEndsAt(""); setReason(""); setRefresh((value) => value + 1); toast("درخواست مرخصی برای بررسی مدیر ارسال شد.");
    } catch (cause) { toast((cause as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function decideLeave(item: Leave, status: "approved" | "rejected") {
    try { await api("/api/staff-schedule/leave", { method: "PATCH", body: { id: item.id, status } }); setRefresh((value) => value + 1); toast(status === "approved" ? "مرخصی تأیید شد." : "درخواست رد شد."); }
    catch (cause) { toast((cause as Error).message, "error"); }
  }
  async function cancelShift(item: Schedule) {
    try { await api(`/api/staff-schedule/${item.id}`, { method: "PATCH", body: { status: "canceled" } }); setRefresh((value) => value + 1); toast("شیفت لغو شد."); }
    catch (cause) { toast((cause as Error).message, "error"); }
  }

  return <div className="animate-fade-in">
    <PageHeader title="برنامه شیفت و مرخصی" subtitle={data?.mine ? "برنامه کاری و وضعیت درخواست‌های مرخصی شما" : "برنامه هفتگی کارکنان؛ همه زمان‌ها بر اساس تهران ثبت و نمایش داده می‌شوند."} actions={<div className="flex flex-wrap gap-2">{!isManager && <Button variant="secondary" onClick={() => setLeaveOpen(true)}><Icon name="calendar" className="size-4"/>درخواست مرخصی</Button>}{isManager && <Button onClick={() => { setScheduleOpen(true); setStaffId(String(employees[0]?.id ?? "")); }}><Icon name="plus" className="size-4"/>ثبت شیفت</Button>}</div>} />
    {loading ? <Skeleton className="h-72 rounded-2xl"/> : error ? <ErrorState message={error} onRetry={() => setRefresh((value) => value + 1)}/> : <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="overflow-hidden"><div className="border-b border-base-300 p-4 font-bold">شیفت‌های ۷ روز گذشته تا ۳۰ روز آینده</div>{data?.items.length ? <div className="divide-y divide-base-300">{data.items.map((item) => <article key={item.id} className="flex flex-wrap items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-bold">{item.staffName}</p><p className="mt-1 text-sm text-base-content/65">{formatDateTime(item.startsAt)} تا {formatDateTime(item.endsAt)}</p><p className="text-xs text-base-content/55">{item.location || "بدون محل مشخص"}</p></div>{isManager && <Button size="sm" variant="ghost" onClick={() => void cancelShift(item)}>لغو شیفت</Button>}</article>)}</div> : <div className="p-8 text-center text-sm text-base-content/60">برای این بازه شیفتی ثبت نشده است.</div>}</Card>
      <Card className="overflow-hidden"><div className="border-b border-base-300 p-4 font-bold">درخواست‌های مرخصی</div>{data?.leaveRequests.length ? <div className="divide-y divide-base-300">{data.leaveRequests.map((item) => <article key={item.id} className="space-y-2 p-4"><div className="flex items-center justify-between gap-2"><b>{item.staffName}</b><Badge color={item.status === "approved" ? "emerald" : item.status === "rejected" ? "rose" : "amber"}>{item.status === "pending" ? "در انتظار بررسی" : item.status === "approved" ? "تأییدشده" : "ردشده"}</Badge></div><p className="text-sm text-base-content/65">{formatDateTime(item.startsAt)} تا {formatDateTime(item.endsAt)} · {leaveNames[item.kind] ?? item.kind}</p>{item.reason && <p className="text-xs text-base-content/55">{item.reason}</p>}{isManager && item.status === "pending" && <div className="flex gap-2"><Button size="sm" onClick={() => void decideLeave(item, "approved")}>تأیید</Button><Button size="sm" variant="secondary" onClick={() => void decideLeave(item, "rejected")}>رد درخواست</Button></div>}</article>)}</div> : <div className="p-8 text-center text-sm text-base-content/60">درخواستی برای این بازه ثبت نشده است.</div>}</Card>
    </div>}

    <Modal open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="ثبت شیفت" footer={<><Button variant="ghost" onClick={() => setScheduleOpen(false)}>انصراف</Button><Button loading={busy} onClick={() => void createSchedule()}>ثبت شیفت</Button></>}>
      <div className="space-y-4"><Field label="کارمند"><Select value={staffId} onChange={(event) => setStaffId(event.target.value)}>{employees.map((member) => <option key={member.id} value={member.id}>{member.name} · {roleNames[member.role] ?? member.role}</option>)}</Select></Field><Field label="شروع"><PersianDateInput value={startsAt} onChange={setStartsAt} withTime/></Field><Field label="پایان"><PersianDateInput value={endsAt} onChange={setEndsAt} withTime/></Field><Field label="محل انجام کار (اختیاری)"><Input value={location} maxLength={100} onChange={(event) => setLocation(event.target.value)}/></Field></div>
    </Modal>
    <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title="درخواست مرخصی" footer={<><Button variant="ghost" onClick={() => setLeaveOpen(false)}>انصراف</Button><Button loading={busy} onClick={() => void requestLeave()}>ارسال درخواست</Button></>}>
      <div className="space-y-4"><Field label="نوع"><Select value={leaveKind} onChange={(event) => setLeaveKind(event.target.value)}><option value="personal">شخصی</option><option value="sick">استعلاجی</option><option value="unpaid">بدون حقوق</option></Select></Field><Field label="شروع"><PersianDateInput value={startsAt} onChange={setStartsAt} withTime/></Field><Field label="پایان"><PersianDateInput value={endsAt} onChange={setEndsAt} withTime/></Field><Field label="توضیح (اختیاری)"><Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)}/></Field></div>
    </Modal>
  </div>;
}
