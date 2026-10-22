"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { buildStaffCalendarMonth, jalaliMonthStart, nextJalaliMonthStart, shiftJalaliMonth, tehranDateKey } from "@/lib/staff-calendar";
import { useFeatures } from "@/components/features";
import { Badge, Button, Card, ErrorState, Field, Icon, Input, Modal, PageHeader, PersianDateInput, Select, Skeleton, Textarea, useToast } from "@/components/ui";

type StaffOption = { id: number; name: string; role: string };
type Schedule = { id: number; staffId: number; staffName: string; startsAt: string; endsAt: string; location: string; status: "scheduled" | "canceled" | "absent"; absenceNote: string; version: number };
type Leave = { id: number; staffId: number; staffName: string; startsAt: string; endsAt: string; kind: string; reason: string; status: string; decisionNote: string };
type Swap = { id: number; scheduleId: number; fromStaffId: number; fromStaffName: string; toStaffId: number; toStaffName: string; status: string; reason: string; decisionNote: string; startsAt: string; endsAt: string };
type Template = { id: number; staffId: number; staffName: string; name: string; weekdays: string; startTime: string; endTime: string; location: string; isActive: boolean };
type Attendance = { scheduleId: number; staffId: number; staffName: string; startsAt: string; endsAt: string; location: string; scheduleStatus: string; attendanceId: number | null; checkInAt: string | null; checkOutAt: string | null };
type Data = { items: Schedule[]; leaveRequests: Leave[]; staff: StaffOption[]; mine: boolean; staffId: number | null };

const roleNames: Record<string, string> = { waiter: "گارسون", cashier: "صندوقدار", chef: "آشپزخانه", warehouse: "انباردار", accountant: "حسابدار", manager: "مدیر" };
const leaveNames: Record<string, string> = { personal: "شخصی", sick: "استعلاجی", unpaid: "بدون حقوق" };
const weekdays = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
const calendarWeekdays = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const formatDateTime = (value: string) => `${formatDate(value)}، ${new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" }).format(new Date(value))}`;
const addDays = (key: string, amount: number) => {
  const [year, month, day] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
};
const boundary = (key: string) => new Date(`${key}T00:00:00+03:30`).toISOString();
const swapStatus = (status: string) => status === "pending_target" ? "در انتظار پاسخ همکار" : status === "pending_manager" ? "در انتظار تأیید مدیر" : status === "approved" ? "تأیید و جابه‌جا شد" : "ردشده";

export default function StaffSchedule() {
  const { isManager } = useFeatures();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [rangeStart, setRangeStart] = useState(() => jalaliMonthStart(tehranDateKey(new Date())));
  const [selectedDay, setSelectedDay] = useState(() => tehranDateKey(new Date()));
  const [staffFilter, setStaffFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scheduleView, setScheduleView] = useState<"calendar" | "table">("calendar");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [patternOpen, setPatternOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [absence, setAbsence] = useState<Schedule | null>(null);
  const [absenceNote, setAbsenceNote] = useState("");
  const [attendanceEdit, setAttendanceEdit] = useState<{ item: Attendance; action: "adjust_check_in" | "adjust_check_out" } | null>(null);
  const [attendanceEditAt, setAttendanceEditAt] = useState("");
  const [attendanceEditReason, setAttendanceEditReason] = useState("");
  const [staffId, setStaffId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [leaveKind, setLeaveKind] = useState("personal");
  const [reason, setReason] = useState("");
  const [patternName, setPatternName] = useState("شیفت ثابت");
  const [patternStaffId, setPatternStaffId] = useState("");
  const [patternWeekdays, setPatternWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [patternStart, setPatternStart] = useState("09:00");
  const [patternEnd, setPatternEnd] = useState("17:00");
  const [patternLocation, setPatternLocation] = useState("");
  const [swapShift, setSwapShift] = useState<Schedule | null>(null);
  const [swapTargetId, setSwapTargetId] = useState("");
  const [swapReason, setSwapReason] = useState("");
  const [busy, setBusy] = useState(false);

  const rangeEnd = nextJalaliMonthStart(rangeStart);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ from: boundary(rangeStart), to: boundary(rangeEnd) });
      const today = tehranDateKey(new Date());
      const attendanceQuery = new URLSearchParams({ from: boundary(addDays(today, -30)), to: boundary(addDays(today, 1)) });
      const [result, swapResult, templateResult, attendanceResult] = await Promise.all([
        api<Data>(`/api/staff-schedule?${query.toString()}`),
        api<{ items: Swap[] }>("/api/staff-schedule/swaps"),
        isManager ? api<{ items: Template[] }>("/api/staff-schedule/templates") : Promise.resolve({ items: [] as Template[] }),
        api<{ items: Attendance[] }>(`/api/staff-schedule/attendance?${attendanceQuery.toString()}`),
      ]);
      setData(result); setSwaps(swapResult.items); setTemplates(templateResult.items); setAttendance(attendanceResult.items);
      if (result.staff[0]) {
        setStaffId((value) => value || String(result.staff[0].id));
        setPatternStaffId((value) => value || String(result.staff[0].id));
      }
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, [isManager, rangeStart, rangeEnd]);

  useEffect(() => { const task = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(task); }, [load, refresh]);
  useEffect(() => { const update = () => setNow(Date.now()); update(); const timer = window.setInterval(update, 60_000); return () => window.clearInterval(timer); }, []);

  const visibleSchedules = useMemo(() => (data?.items ?? []).filter((item) => staffFilter === "all" || item.staffId === Number(staffFilter)), [data, staffFilter]);
  const filteredSchedules = useMemo(() => visibleSchedules.filter((item) => statusFilter === "all" || item.status === statusFilter), [visibleSchedules, statusFilter]);
  const monthInfo = useMemo(() => buildStaffCalendarMonth(rangeStart), [rangeStart]);
  const scheduleByDay = useMemo(() => {
    const result = new Map<string, Schedule[]>();
    for (const item of filteredSchedules) {
      const key = tehranDateKey(new Date(item.startsAt));
      result.set(key, [...(result.get(key) ?? []), item]);
    }
    return result;
  }, [filteredSchedules]);
  const selectedDaySchedules = scheduleByDay.get(selectedDay) ?? [];
  const rangeLabel = monthInfo.label;
  const attendanceSummary = useMemo(() => {
    const completed = attendance.filter((item) => item.scheduleStatus === "scheduled" && new Date(item.endsAt).getTime() < now);
    const checkedIn = completed.filter((item) => item.checkInAt);
    const late = checkedIn.filter((item) => new Date(item.checkInAt!).getTime() - new Date(item.startsAt).getTime() > 5 * 60_000);
    const hours = attendance.reduce((sum, item) => item.checkInAt && item.checkOutAt ? sum + (new Date(item.checkOutAt).getTime() - new Date(item.checkInAt).getTime()) / 3_600_000 : sum, 0);
    return { shifts: completed.length, checkedIn: checkedIn.length, late: late.length, hours };
  }, [attendance, now]);

  async function createSchedule() {
    const id = Number(staffId);
    if (!id || !startsAt || !endsAt) return toast("کارمند و بازه زمانی شیفت را وارد کنید.", "error");
    setBusy(true);
    try {
      if (editingSchedule) await api(`/api/staff-schedule/${editingSchedule.id}`, { method: "PATCH", body: { status: "scheduled", version: editingSchedule.version, staffId: id, startsAt, endsAt, location } });
      else await api("/api/staff-schedule", { method: "POST", body: { staffId: id, startsAt, endsAt, location } });
      setScheduleOpen(false); setEditingSchedule(null); setStartsAt(""); setEndsAt(""); setLocation(""); setRefresh((value) => value + 1); toast(editingSchedule ? "تغییرات شیفت ذخیره شد." : "شیفت ثبت شد.");
    } catch (cause) { toast((cause as Error).message, "error"); }
    finally { setBusy(false); }
  }

  function openScheduleEdit(item: Schedule) {
    setEditingSchedule(item); setStaffId(String(item.staffId)); setStartsAt(item.startsAt); setEndsAt(item.endsAt); setLocation(item.location); setScheduleOpen(true);
  }

  async function punchAttendance(item: Attendance, action: "check_in" | "check_out") {
    setBusy(true);
    try {
      await api("/api/staff-schedule/attendance", { method: "POST", body: { scheduleId: item.scheduleId, action } });
      setRefresh((value) => value + 1); toast(action === "check_in" ? "ورود شما ثبت شد." : "خروج شما ثبت شد.");
    } catch (cause) { toast((cause as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function correctAttendance() {
    if (!attendanceEdit || !attendanceEditAt || attendanceEditReason.trim().length < 3) return toast("زمان و دلیل اصلاح را وارد کنید.", "error");
    setBusy(true);
    try {
      await api("/api/staff-schedule/attendance", { method: "PATCH", body: { recordId: attendanceEdit.item.attendanceId, action: attendanceEdit.action, at: attendanceEditAt, reason: attendanceEditReason } });
      setAttendanceEdit(null); setAttendanceEditAt(""); setAttendanceEditReason(""); setRefresh((value) => value + 1); toast("اصلاح حضور با ثبت دلیل در سوابق انجام شد.");
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
    try { await api("/api/staff-schedule/leave", { method: "PATCH", body: { id: item.id, status } }); setRefresh((value) => value + 1); toast(status === "approved" ? "مرخصی تأیید شد." : "درخواست مرخصی رد شد."); }
    catch (cause) { toast((cause as Error).message, "error"); }
  }

  async function cancelShift(item: Schedule) {
    try { await api(`/api/staff-schedule/${item.id}`, { method: "PATCH", body: { status: "canceled" } }); setRefresh((value) => value + 1); toast("شیفت لغو شد."); }
    catch (cause) { toast((cause as Error).message, "error"); }
  }

  async function recordAbsence() {
    if (!absence) return;
    setBusy(true);
    try { await api(`/api/staff-schedule/${absence.id}`, { method: "PATCH", body: { status: "absent", note: absenceNote } }); setAbsence(null); setAbsenceNote(""); setRefresh((value) => value + 1); toast("غیبت در سوابق شیفت ثبت شد."); }
    catch (cause) { toast((cause as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function submitPattern(templateId?: number) {
    if (!templateId && (!patternStaffId || !patternName.trim() || patternWeekdays.length === 0)) return toast("کارمند، نام الگو و روزهای هفته را انتخاب کنید.", "error");
    setBusy(true);
    try {
      const body = templateId
        ? { templateId, from: boundary(rangeStart), to: boundary(rangeEnd) }
        : { name: patternName, staffId: Number(patternStaffId), weekdays: patternWeekdays, startTime: patternStart, endTime: patternEnd, location: patternLocation, from: boundary(rangeStart), to: boundary(rangeEnd) };
      const result = await api<{ createdCount: number; existingCount: number }>("/api/staff-schedule/templates", { method: "POST", body });
      setPatternOpen(false); setRefresh((value) => value + 1);
      toast(`${result.createdCount} شیفت ثبت شد${result.existingCount ? `؛ ${result.existingCount} مورد قبلاً ثبت شده بود` : ""}.`);
    } catch (cause) { toast((cause as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function requestSwap() {
    if (!swapShift || !swapTargetId) return toast("همکار مقصد را انتخاب کنید.", "error");
    setBusy(true);
    try { await api("/api/staff-schedule/swaps", { method: "POST", body: { scheduleId: swapShift.id, targetStaffId: Number(swapTargetId), reason: swapReason } }); setSwapOpen(false); setSwapShift(null); setSwapReason(""); setRefresh((value) => value + 1); toast("درخواست جابه‌جایی برای همکار ارسال شد."); }
    catch (cause) { toast((cause as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function answerSwap(item: Swap, decision: "accept" | "reject") {
    try { await api("/api/staff-schedule/swaps", { method: "PATCH", body: { id: item.id, action: "respond", decision } }); setRefresh((value) => value + 1); toast(decision === "accept" ? "پاسخ ثبت شد؛ جابه‌جایی برای تأیید مدیر ارسال شد." : "درخواست جابه‌جایی رد شد."); }
    catch (cause) { toast((cause as Error).message, "error"); }
  }

  async function decideSwap(item: Swap, decision: "approve" | "reject") {
    try { await api("/api/staff-schedule/swaps", { method: "PATCH", body: { id: item.id, action: "decide", decision } }); setRefresh((value) => value + 1); toast(decision === "approve" ? "شیفت با موفقیت به همکار منتقل شد." : "درخواست جابه‌جایی رد شد."); }
    catch (cause) { toast((cause as Error).message, "error"); }
  }

  function moveMonth(offset: number) {
    const next = shiftJalaliMonth(rangeStart, offset);
    setRangeStart(next);
    setSelectedDay(next);
  }

  function goToCurrentMonth() {
    const today = tehranDateKey(new Date());
    setRangeStart(jalaliMonthStart(today));
    setSelectedDay(today);
  }

  function startScheduleOn(dateKey = selectedDay) {
    setEditingSchedule(null);
    setStaffId(staffFilter === "all" ? String(data?.staff[0]?.id ?? "") : staffFilter);
    setStartsAt(`${dateKey}T09:00`);
    setEndsAt(`${dateKey}T17:00`);
    setLocation("");
    setScheduleOpen(true);
  }

  function shiftActions(item: Schedule) {
    const startsInFuture = new Date(item.startsAt).getTime() > now;
    if (isManager && item.status === "scheduled") return <div className="flex flex-wrap gap-1.5">
      {startsInFuture && <Button size="sm" variant="ghost" onClick={() => openScheduleEdit(item)}>ویرایش</Button>}
      <Button size="sm" variant="ghost" onClick={() => void cancelShift(item)}>لغو</Button>
      {!startsInFuture && now > 0 && <Button size="sm" variant="danger" onClick={() => { setAbsence(item); setAbsenceNote(""); }}>ثبت غیبت</Button>}
    </div>;
    if (!isManager && item.status === "scheduled" && now > 0 && startsInFuture) return <Button size="sm" variant="secondary" onClick={() => { setSwapShift(item); setSwapOpen(true); }}>درخواست جابه‌جایی</Button>;
    return null;
  }

  return <div className="animate-fade-in">
    <PageHeader title="برنامه شیفت و نیروی انسانی" subtitle={data?.mine ? "برنامه کاری، ثبت ورود و خروج، مرخصی و جابه‌جایی شیفت" : "برنامه‌ریزی، حضور و غیاب، مرخصی و گردش تغییر شیفت کارکنان"} actions={<div className="flex flex-wrap gap-2">{!isManager && <><Button variant="secondary" onClick={() => { setStartsAt(""); setEndsAt(""); setLeaveOpen(true); }}><Icon name="calendar" className="size-4"/>درخواست مرخصی</Button><Button variant="ghost" onClick={() => document.getElementById("staff-shift-swaps")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Icon name="users" className="size-4"/>درخواست‌های جابه‌جایی</Button></>}{isManager && <><Button variant="secondary" onClick={() => setPatternOpen(true)}><Icon name="calendar" className="size-4"/>الگوی شیفت</Button><Button onClick={() => startScheduleOn()}><Icon name="plus" className="size-4"/>ثبت شیفت</Button></>}</div>} />
    {loading ? <Skeleton className="h-72 rounded-2xl"/> : error ? <ErrorState message={error} onRetry={() => setRefresh((value) => value + 1)}/> : <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-3"><p className="text-xs text-base-content/60">شیفت در برنامه</p><p className="mt-1 text-xl font-extrabold">{visibleSchedules.filter((item) => item.status === "scheduled").length}</p><p className="text-[11px] text-base-content/50">در {rangeLabel}</p></Card>
        <Card className="p-3"><p className="text-xs text-base-content/60">کارکنان برنامه‌ریزی‌شده</p><p className="mt-1 text-xl font-extrabold">{new Set(visibleSchedules.filter((item) => item.status === "scheduled").map((item) => item.staffId)).size}</p><p className="text-[11px] text-base-content/50">از {data?.staff.length ?? 0} نیروی فعال</p></Card>
        <Card className="p-3"><p className="text-xs text-base-content/60">ساعت ثبت‌شده</p><p className="mt-1 text-xl font-extrabold">{attendanceSummary.hours.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}</p><p className="text-[11px] text-base-content/50">بر پایه ورود و خروج</p></Card>
        <Card className="p-3"><p className="text-xs text-base-content/60">ورود دیرهنگام</p><p className="mt-1 text-xl font-extrabold">{attendanceSummary.late.toLocaleString("fa-IR")}</p><p className="text-[11px] text-base-content/50">بیش از ۵ دقیقه پس از شروع</p></Card>
      </div>
      <Card className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <Button size="sm" variant="secondary" aria-label="ماه قبل" title="ماه قبل" onClick={() => moveMonth(-1)}><Icon name="arrowRight" className="size-4"/></Button>
            <div className="min-w-0 flex-1 px-1 text-center sm:min-w-44"><p className="truncate text-base font-extrabold">{rangeLabel}</p><p className="mt-0.5 text-[11px] text-base-content/55">{formatDate(boundary(rangeStart))} تا {formatDate(boundary(addDays(rangeEnd, -1)))}</p></div>
            <Button size="sm" variant="secondary" aria-label="ماه بعد" title="ماه بعد" onClick={() => moveMonth(1)}><Icon name="arrowLeft" className="size-4"/></Button>
            <Button size="sm" variant="ghost" onClick={goToCurrentMonth}>امروز</Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {isManager && <Field label="کارمند" className="min-w-36 flex-1 sm:w-48"><Select value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)}><option key="all" value="all">همه کارکنان</option>{data?.staff.map((member) => <option key={member.id} value={member.id}>{member.name} · {roleNames[member.role] ?? member.role}</option>)}</Select></Field>}
            <Field label="وضعیت شیفت" className="min-w-32 flex-1 sm:w-40"><Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option key="all-status" value="all">همه وضعیت‌ها</option><option key="scheduled-status" value="scheduled">برنامه‌ریزی‌شده</option><option key="absent-status" value="absent">غیبت</option><option key="canceled-status" value="canceled">لغوشده</option></Select></Field>
            <div className="join rounded-xl border border-base-300 bg-base-200/60 p-1" role="group" aria-label="نحوه نمایش برنامه">
              <Button size="sm" variant={scheduleView === "calendar" ? "primary" : "ghost"} className="join-item h-9 px-2.5" aria-pressed={scheduleView === "calendar"} onClick={() => setScheduleView("calendar")}><Icon name="calendar" className="size-4"/><span className="hidden sm:inline">تقویم</span></Button>
              <Button size="sm" variant={scheduleView === "table" ? "primary" : "ghost"} className="join-item h-9 px-2.5" aria-pressed={scheduleView === "table"} onClick={() => setScheduleView("table")}><Icon name="list" className="size-4"/><span className="hidden sm:inline">جدول</span></Button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-200 pt-3 text-[11px] text-base-content/60">
          <span>{filteredSchedules.length.toLocaleString("fa-IR")} شیفت{staffFilter !== "all" ? " برای کارمند انتخاب‌شده" : " در این ماه"}</span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="راهنمای وضعیت شیفت"><span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-primary"/>برنامه‌ریزی‌شده</span><span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-rose-500"/>غیبت</span><span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-base-content/35"/>لغو</span><span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-amber-500"/>مرخصی</span></div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 marker:hidden [&::-webkit-details-marker]:hidden"><div><h2 className="font-bold">گزارش حضور و غیاب · ۳۰ روز اخیر</h2><p className="mt-1 text-xs text-base-content/60">برای مشاهدهٔ ورود، خروج و اصلاحات ثبت‌شده باز کنید.</p></div><div className="flex items-center gap-2"><Badge color="blue">{attendanceSummary.shifts.toLocaleString("fa-IR")} شیفت گذشته</Badge><Badge color="emerald">{attendanceSummary.checkedIn.toLocaleString("fa-IR")} ورود</Badge><Icon name="chevronDown" className="size-4 text-base-content/55 transition-transform group-open:rotate-180"/></div></summary>
        <div className="border-t border-base-300">
        {attendance.length ? <div className="max-h-[420px] divide-y divide-base-300 overflow-y-auto">{attendance.map((item) => {
          const start = new Date(item.startsAt).getTime(), end = new Date(item.endsAt).getTime();
          const canCheckIn = data?.mine && item.scheduleStatus === "scheduled" && !item.checkInAt && now >= start - 2 * 60 * 60_000 && now <= end + 2 * 60 * 60_000;
          const canCheckOut = data?.mine && item.scheduleStatus === "scheduled" && !!item.checkInAt && !item.checkOutAt && now >= start && now <= end + 12 * 60 * 60_000;
          const duration = item.checkInAt && item.checkOutAt ? Math.max(0, new Date(item.checkOutAt).getTime() - new Date(item.checkInAt).getTime()) / 3_600_000 : null;
          const completed = end < now;
          return <article key={item.scheduleId} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="text-sm">{item.staffName}</b><Badge color={item.scheduleStatus === "absent" ? "rose" : item.checkOutAt ? "emerald" : item.checkInAt ? "blue" : completed ? "amber" : "stone"}>{item.scheduleStatus === "absent" ? "غیبت" : item.checkOutAt ? "تکمیل حضور" : item.checkInAt ? "در شیفت" : completed ? "حضور ثبت نشده" : "در انتظار شیفت"}</Badge></div>
              <p className="mt-1 text-xs text-base-content/65">{formatDateTime(item.startsAt)} تا {formatDateTime(item.endsAt)}{item.location ? ` · ${item.location}` : ""}</p>
              <p className="mt-1 text-xs text-base-content/55">ورود: {item.checkInAt ? formatDateTime(item.checkInAt) : "—"} · خروج: {item.checkOutAt ? formatDateTime(item.checkOutAt) : "—"}{duration !== null ? ` · ${duration.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ساعت` : ""}</p>
            </div>
            {canCheckIn && <Button size="sm" disabled={busy} onClick={() => void punchAttendance(item, "check_in")}>ثبت ورود</Button>}
            {canCheckOut && <Button size="sm" disabled={busy} onClick={() => void punchAttendance(item, "check_out")}>ثبت خروج</Button>}
            {isManager && item.scheduleStatus === "scheduled" && !item.checkInAt && completed && <Button size="sm" variant="danger" onClick={() => void api(`/api/staff-schedule/${item.scheduleId}`, { method: "PATCH", body: { status: "absent", note: "عدم ثبت ورود در زمان شیفت" } }).then(() => { setRefresh((value) => value + 1); toast("عدم حضور به‌عنوان غیبت ثبت شد."); }).catch((cause) => toast((cause as Error).message, "error"))}>ثبت غیبت</Button>}
            {isManager && item.attendanceId && item.checkInAt && <Button size="sm" variant="ghost" onClick={() => { setAttendanceEdit({ item, action: "adjust_check_in" }); setAttendanceEditAt(item.checkInAt!); setAttendanceEditReason(""); }}>اصلاح ورود</Button>}
            {isManager && item.attendanceId && item.checkOutAt && <Button size="sm" variant="ghost" onClick={() => { setAttendanceEdit({ item, action: "adjust_check_out" }); setAttendanceEditAt(item.checkOutAt!); setAttendanceEditReason(""); }}>اصلاح خروج</Button>}
          </article>;
        })}</div> : <div className="p-8 text-center text-sm text-base-content/60">برای ۳۰ روز اخیر شیفتی در گزارش حضور و غیاب وجود ندارد.</div>}
        </div>
        </details>
      </Card>

      {isManager && templates.length > 0 && <Card className="overflow-hidden p-0"><details className="group"><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 marker:hidden [&::-webkit-details-marker]:hidden"><div><h2 className="font-bold">الگوهای شیفت ثابت</h2><p className="mt-1 text-xs text-base-content/60">الگوهای ذخیره‌شده را برای ماه جاری اعمال کنید.</p></div><div className="flex items-center gap-2"><Badge color="blue">{templates.length.toLocaleString("fa-IR")} الگو</Badge><Icon name="chevronDown" className="size-4 text-base-content/55 transition-transform group-open:rotate-180"/></div></summary><div className="flex flex-wrap gap-2 border-t border-base-300 p-4">{templates.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-base-300 bg-base-100 p-2"><span className="text-xs font-semibold">{item.name} · {item.staffName} · {item.startTime}–{item.endTime}</span><Button size="sm" variant="secondary" disabled={busy} onClick={() => void submitPattern(item.id)}>اعمال در این ماه</Button></div>)}</div></details></Card>}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-5">
          {scheduleView === "calendar" ? <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 bg-base-200/35 px-3 py-3 sm:px-4"><div><h2 className="font-bold">تقویم شیفت‌ها</h2><p className="mt-0.5 text-[11px] text-base-content/60">برای دیدن جزئیات روز، تاریخ را انتخاب کنید.</p></div><Badge color="blue">{filteredSchedules.length.toLocaleString("fa-IR")} شیفت</Badge></div>
            <div className="divide-y divide-base-200" role="grid" aria-label={`تقویم شیفت ${rangeLabel}`}>
              <div className="grid grid-cols-7 bg-base-200/55" role="row">{calendarWeekdays.map((day, index) => <div key={day} role="columnheader" className="py-2 text-center text-[10px] font-bold text-base-content/60 sm:text-xs">{day}<span className="sr-only">، ستون {index + 1}</span></div>)}</div>
              {monthInfo.rows.map((week, weekIndex) => <div key={`week-${weekIndex}`} className="grid grid-cols-7" role="row">
              {week.map((day, index) => {
                if (!day) return <div key={`blank-${weekIndex}-${index}`} role="presentation" aria-hidden="true" className="min-h-[68px] border-s border-base-200 bg-base-200/20 sm:min-h-28" />;
                const dayItems = scheduleByDay.get(day.dateKey) ?? [];
                const dayStart = new Date(boundary(day.dateKey)).getTime();
                const dayLeaves = (data?.leaveRequests ?? []).filter((leave) => leave.status !== "rejected" && new Date(leave.startsAt).getTime() < dayStart + 86_400_000 && new Date(leave.endsAt).getTime() > dayStart);
                const selected = selectedDay === day.dateKey;
                const today = tehranDateKey(new Date()) === day.dateKey;
                return <div key={day.dateKey} role="gridcell" aria-label={`${formatDate(boundary(day.dateKey))}، ${dayItems.length} شیفت${dayLeaves.length ? `، ${dayLeaves.length} مرخصی` : ""}`} className={`relative min-h-[68px] border-s border-base-200 p-1 transition sm:min-h-28 sm:p-2 ${selected ? "bg-primary/[0.07] ring-2 ring-inset ring-primary/70" : today ? "bg-blue-50/70" : "bg-base-100"}`}>
                  <div className="flex items-center justify-between gap-0.5">
                    <button type="button" aria-pressed={selected} onClick={() => setSelectedDay(day.dateKey)} className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition sm:size-8 sm:text-xs ${selected ? "bg-primary text-primary-content shadow-sm" : today ? "bg-blue-100 text-blue-800" : "hover:bg-base-200"}`}>{day.number.toLocaleString("fa-IR")}</button>
                    <div className="flex items-center gap-1">
                      {dayLeaves.length > 0 && <span title={`${dayLeaves.length.toLocaleString("fa-IR")} درخواست فعال مرخصی`} aria-hidden="true" className="absolute end-1 top-1 size-1.5 rounded-full bg-amber-500 sm:static sm:flex sm:size-5 sm:shrink-0 sm:items-center sm:justify-center sm:rounded-full sm:bg-amber-100 sm:text-[9px] sm:font-bold sm:text-amber-800"><span className="hidden sm:inline">م{dayLeaves.length > 1 ? dayLeaves.length.toLocaleString("fa-IR") : ""}</span></span>}
                      {isManager && <button type="button" aria-label={`ثبت شیفت در ${formatDate(boundary(day.dateKey))}`} onClick={() => startScheduleOn(day.dateKey)} className="hidden size-6 items-center justify-center rounded-full text-primary transition hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:flex"><Icon name="plus" className="size-3.5"/></button>}
                    </div>
                  </div>
                  <div className="mt-1 hidden space-y-1 sm:block">
                    {dayItems.slice(0, 2).map((item) => <button key={item.id} type="button" onClick={() => setSelectedDay(day.dateKey)} className={`block w-full truncate rounded-md px-1.5 py-1 text-start text-[10px] font-semibold leading-4 ${item.status === "scheduled" ? "bg-primary/10 text-primary" : item.status === "absent" ? "bg-rose-50 text-rose-700" : "bg-base-200 text-base-content/55"}`} title={`${item.staffName} · ${formatDateTime(item.startsAt)}`}><span className="me-1 tabular-nums">{new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" }).format(new Date(item.startsAt))}</span>{item.staffName}</button>)}
                    {dayItems.length > 2 && <button type="button" onClick={() => setSelectedDay(day.dateKey)} className="px-1 text-[10px] font-bold text-primary hover:underline">+{(dayItems.length - 2).toLocaleString("fa-IR")} مورد دیگر</button>}
                    {dayLeaves.length > 0 && <p className="truncate px-1 text-[9px] font-semibold text-amber-800">{dayLeaves.length.toLocaleString("fa-IR")} مرخصی</p>}
                  </div>
                  <div className="mt-1 flex min-h-2 items-center justify-center gap-1 sm:hidden" aria-hidden="true">{dayItems.slice(0, 4).map((item) => <i key={item.id} className={`size-1.5 rounded-full ${item.status === "scheduled" ? "bg-primary" : item.status === "absent" ? "bg-rose-500" : "bg-base-content/35"}`} />)}{dayItems.length > 4 && <i className="text-[8px] not-italic text-base-content/60">+{(dayItems.length - 4).toLocaleString("fa-IR")}</i>}</div>
                </div>;
              })}
              </div>)}
            </div>
          </Card> : <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 bg-base-200/35 p-3 sm:p-4"><div><h2 className="font-bold">جدول شیفت‌های {rangeLabel}</h2><p className="mt-0.5 text-[11px] text-base-content/60">نمایش بر اساس شروع شیفت؛ فیلترهای بالا روی همین جدول اعمال می‌شوند.</p></div><Badge color="blue">{filteredSchedules.length.toLocaleString("fa-IR")} ردیف</Badge></div>
            {filteredSchedules.length ? <><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[720px] text-sm"><thead className="bg-base-200/50 text-xs text-base-content/60"><tr><th className="px-4 py-3 text-start">کارمند</th><th className="px-4 py-3 text-start">تاریخ و ساعت</th><th className="px-4 py-3 text-start">محل</th><th className="px-4 py-3 text-start">وضعیت</th><th className="px-4 py-3 text-end">عملیات</th></tr></thead><tbody>{[...filteredSchedules].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((item) => <tr key={item.id} className="border-t border-base-200 align-middle"><td className="px-4 py-3 font-bold">{item.staffName}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-base-content/70">{formatDateTime(item.startsAt)}<span className="mx-1">تا</span>{new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" }).format(new Date(item.endsAt))}</td><td className="px-4 py-3 text-xs text-base-content/65">{item.location || "—"}{item.absenceNote ? <span className="mt-1 block text-rose-700">{item.absenceNote}</span> : null}</td><td className="px-4 py-3"><Badge color={item.status === "scheduled" ? "blue" : item.status === "absent" ? "rose" : "stone"}>{item.status === "scheduled" ? "برنامه‌ریزی‌شده" : item.status === "absent" ? "غیبت" : "لغو"}</Badge></td><td className="px-4 py-3 text-end">{shiftActions(item)}</td></tr>)}</tbody></table></div><div className="divide-y divide-base-200 md:hidden">{[...filteredSchedules].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((item) => <article key={item.id} className="space-y-2 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{item.staffName}</b><Badge color={item.status === "scheduled" ? "blue" : item.status === "absent" ? "rose" : "stone"}>{item.status === "scheduled" ? "برنامه‌ریزی‌شده" : item.status === "absent" ? "غیبت" : "لغو"}</Badge></div><p className="text-xs text-base-content/70">{formatDateTime(item.startsAt)} تا {new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" }).format(new Date(item.endsAt))}</p><p className="text-xs text-base-content/55">{item.location || "بدون محل مشخص"}{item.absenceNote ? ` · ${item.absenceNote}` : ""}</p>{shiftActions(item)}</article>)}</div></> : <div className="p-8 text-center text-sm text-base-content/60">با این فیلتر، شیفتی در {rangeLabel} پیدا نشد.</div>}
          </Card>}

          {scheduleView === "calendar" && <Card className="overflow-hidden p-0"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 p-3 sm:p-4"><div><h2 className="font-bold">جزئیات {formatDate(boundary(selectedDay))}</h2><p className="mt-0.5 text-xs text-base-content/60">{selectedDaySchedules.length.toLocaleString("fa-IR")} شیفت · {(data?.leaveRequests ?? []).filter((leave) => leave.status !== "rejected" && new Date(leave.startsAt).getTime() < new Date(boundary(selectedDay)).getTime() + 86_400_000 && new Date(leave.endsAt).getTime() > new Date(boundary(selectedDay)).getTime()).length.toLocaleString("fa-IR")} مرخصی فعال</p></div>{isManager && <Button size="sm" onClick={() => startScheduleOn(selectedDay)}><Icon name="plus" className="size-4"/>ثبت شیفت این روز</Button>}</div>{selectedDaySchedules.length ? <div className="divide-y divide-base-200">{selectedDaySchedules.map((item) => <article key={item.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="text-sm">{item.staffName}</b><Badge color={item.status === "scheduled" ? "blue" : item.status === "absent" ? "rose" : "stone"}>{item.status === "scheduled" ? "برنامه‌ریزی‌شده" : item.status === "absent" ? "غیبت ثبت‌شده" : "لغوشده"}</Badge></div><p className="mt-1 text-xs text-base-content/70">{formatDateTime(item.startsAt)} تا {formatDateTime(item.endsAt)}</p><p className="mt-1 text-[11px] text-base-content/55">{item.location || "بدون محل مشخص"}{item.absenceNote ? ` · ${item.absenceNote}` : ""}</p></div>{shiftActions(item)}</article>)}</div> : <div className="p-7 text-center"><span className="mx-auto flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon name="calendar" className="size-5"/></span><p className="mt-2 text-sm font-bold">برای این روز شیفتی پیدا نشد</p><p className="mt-1 text-xs text-base-content/55">تاریخ دیگری را انتخاب کنید یا برنامهٔ تازه‌ای بسازید.</p>{isManager && <Button size="sm" className="mt-3" onClick={() => startScheduleOn(selectedDay)}>ثبت شیفت برای این روز</Button>}</div>}</Card>}
        </div>

        <div className="space-y-5"><Card className="overflow-hidden"><div className="border-b border-base-300 p-4"><h2 className="font-bold">درخواست‌های مرخصی</h2><p className="mt-1 text-xs text-base-content/60">مدیر می‌تواند درخواست‌ها را تأیید یا رد کند.</p></div>{data?.leaveRequests.length ? <div className="max-h-[560px] divide-y divide-base-300 overflow-y-auto">{data.leaveRequests.map((item) => <article key={item.id} className="space-y-2 p-4"><div className="flex items-center justify-between gap-2"><b className="text-sm">{item.staffName} · {leaveNames[item.kind] ?? item.kind}</b><Badge color={item.status === "approved" ? "emerald" : item.status === "rejected" ? "rose" : "amber"}>{item.status === "pending" ? "در انتظار بررسی" : item.status === "approved" ? "تأییدشده" : "ردشده"}</Badge></div><p className="text-xs text-base-content/65">{formatDateTime(item.startsAt)} تا {formatDateTime(item.endsAt)}</p>{item.reason && <p className="text-xs text-base-content/55">{item.reason}</p>}{item.decisionNote && <p className="text-xs text-base-content/55">پاسخ مدیر: {item.decisionNote}</p>}{isManager && item.status === "pending" && <div className="flex gap-2"><Button size="sm" onClick={() => void decideLeave(item, "approved")}>تأیید مرخصی</Button><Button size="sm" variant="secondary" onClick={() => void decideLeave(item, "rejected")}>رد مرخصی</Button></div>}</article>)}</div> : <div className="p-6 text-center text-sm text-base-content/60">درخواستی برای این بازه ثبت نشده است.</div>}</Card>

          <Card className="overflow-hidden"><div id="staff-shift-swaps" className="scroll-mt-4 border-b border-base-300 p-4"><h2 className="font-bold">درخواست‌های جابه‌جایی شیفت</h2><p className="mt-1 text-xs text-base-content/60">جابه‌جایی پس از پاسخ همکار با تأیید مدیر نهایی می‌شود.</p></div>{swaps.length ? <div className="max-h-[560px] divide-y divide-base-300 overflow-y-auto">{swaps.map((item) => <article key={item.id} className="space-y-2 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{item.fromStaffName} ← {item.toStaffName}</b><Badge color={item.status === "approved" ? "emerald" : item.status === "rejected" ? "rose" : "amber"}>{swapStatus(item.status)}</Badge></div><p className="text-xs text-base-content/65">{formatDateTime(item.startsAt)} تا {formatDateTime(item.endsAt)}</p>{item.reason && <p className="text-xs text-base-content/55">علت: {item.reason}</p>}{item.decisionNote && <p className="text-xs text-base-content/55">یادداشت: {item.decisionNote}</p>}{!isManager && item.status === "pending_target" && item.toStaffId === data?.staffId && <div className="flex gap-2"><Button size="sm" onClick={() => void answerSwap(item, "accept")}>قبول درخواست</Button><Button size="sm" variant="secondary" onClick={() => void answerSwap(item, "reject")}>رد درخواست</Button></div>}{isManager && item.status === "pending_manager" && <div className="flex gap-2"><Button size="sm" onClick={() => void decideSwap(item, "approve")}>تأیید و جابه‌جایی</Button><Button size="sm" variant="secondary" onClick={() => void decideSwap(item, "reject")}>رد درخواست</Button></div>}</article>)}</div> : <div className="p-6 text-center text-sm text-base-content/60">درخواست جابه‌جایی ثبت نشده است.</div>}</Card></div>
      </div>
    </div>}

    <Modal open={scheduleOpen} onClose={() => { setScheduleOpen(false); setEditingSchedule(null); }} title={editingSchedule ? "ویرایش شیفت" : "ثبت شیفت تکی"} description="برنامهٔ کارکنان با کنترل تداخل شیفت و مرخصی ذخیره می‌شود." footer={<><Button variant="ghost" onClick={() => { setScheduleOpen(false); setEditingSchedule(null); }}>انصراف</Button><Button loading={busy} onClick={() => void createSchedule()}>{editingSchedule ? "ذخیره تغییرات" : "ثبت شیفت"}</Button></>}>
      <div className="space-y-4"><Field label="کارمند"><Select value={staffId} onChange={(event) => setStaffId(event.target.value)}>{data?.staff.map((member) => <option key={member.id} value={member.id}>{member.name} · {roleNames[member.role] ?? member.role}</option>)}</Select></Field><Field label="شروع"><PersianDateInput value={startsAt} onChange={setStartsAt} withTime/></Field><Field label="پایان"><PersianDateInput value={endsAt} onChange={setEndsAt} withTime/></Field><Field label="محل انجام کار (اختیاری)"><Input value={location} maxLength={100} onChange={(event) => setLocation(event.target.value)}/></Field></div>
    </Modal>
    <Modal open={!!attendanceEdit} onClose={() => setAttendanceEdit(null)} title={attendanceEdit?.action === "adjust_check_in" ? "اصلاح زمان ورود" : "اصلاح زمان خروج"} description={attendanceEdit ? `${attendanceEdit.item.staffName} · ${formatDateTime(attendanceEdit.item.startsAt)}` : undefined} footer={<><Button variant="ghost" onClick={() => setAttendanceEdit(null)}>انصراف</Button><Button loading={busy} onClick={() => void correctAttendance()}>ثبت اصلاح</Button></>}>
      <div className="space-y-4"><Field label="زمان صحیح"><PersianDateInput value={attendanceEditAt} onChange={setAttendanceEditAt} withTime/></Field><Field label="دلیل اصلاح"><Textarea value={attendanceEditReason} maxLength={300} onChange={(event) => setAttendanceEditReason(event.target.value)} placeholder="مثلاً ثبت اشتباه ساعت توسط کارمند"/></Field><p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">زمان قبلی و دلیل این تغییر برای پیگیری در تاریخچهٔ حضور ذخیره می‌شود.</p></div>
    </Modal>
    <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title="درخواست مرخصی" footer={<><Button variant="ghost" onClick={() => setLeaveOpen(false)}>انصراف</Button><Button loading={busy} onClick={() => void requestLeave()}>ارسال درخواست</Button></>}>
      <div className="space-y-4"><Field label="نوع مرخصی"><Select value={leaveKind} onChange={(event) => setLeaveKind(event.target.value)}><option key="personal" value="personal">شخصی</option><option key="sick" value="sick">استعلاجی</option><option key="unpaid" value="unpaid">بدون حقوق</option></Select></Field><Field label="شروع"><PersianDateInput value={startsAt} onChange={setStartsAt} withTime/></Field><Field label="پایان"><PersianDateInput value={endsAt} onChange={setEndsAt} withTime/></Field><Field label="توضیح (اختیاری)"><Textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)}/></Field></div>
    </Modal>
    <Modal open={patternOpen} onClose={() => setPatternOpen(false)} title="الگوی شیفت ثابت" description={`شیفت‌های انتخاب‌شده در بازهٔ ${rangeLabel} ساخته می‌شوند.`} footer={<><Button variant="ghost" onClick={() => setPatternOpen(false)}>انصراف</Button><Button loading={busy} onClick={() => void submitPattern()}>ثبت الگو و برنامه‌ریزی</Button></>}>
      <div className="space-y-4"><Field label="نام الگو"><Input value={patternName} maxLength={80} onChange={(event) => setPatternName(event.target.value)}/></Field><Field label="کارمند"><Select value={patternStaffId} onChange={(event) => setPatternStaffId(event.target.value)}>{data?.staff.map((member) => <option key={member.id} value={member.id}>{member.name} · {roleNames[member.role] ?? member.role}</option>)}</Select></Field><fieldset><legend className="mb-2 text-xs font-semibold text-stone-600">روزهای تکرار</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{weekdays.map((label, day) => <label key={label} className="flex items-center gap-2 rounded-lg border border-base-300 p-2 text-xs"><input type="checkbox" className="checkbox checkbox-sm" checked={patternWeekdays.includes(day)} onChange={(event) => setPatternWeekdays((value) => event.target.checked ? [...value, day].sort((a, b) => a - b) : value.filter((item) => item !== day))}/>{label}</label>)}</div></fieldset><div className="grid grid-cols-2 gap-3"><Field label="شروع"><Input type="time" value={patternStart} onChange={(event) => setPatternStart(event.target.value)}/></Field><Field label="پایان"><Input type="time" value={patternEnd} onChange={(event) => setPatternEnd(event.target.value)}/></Field></div><Field label="محل انجام کار (اختیاری)"><Input value={patternLocation} maxLength={100} onChange={(event) => setPatternLocation(event.target.value)}/></Field><p className="rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-800">الگو ذخیره می‌شود و شیفت‌های این بازه را یکجا می‌سازد. در صورت تداخل با شیفت یا مرخصی تأییدشده، هیچ‌کدام از شیفت‌های همان عملیات ثبت نخواهد شد.</p></div>
    </Modal>
    <Modal open={swapOpen} onClose={() => { setSwapOpen(false); setSwapShift(null); }} title={swapShift ? "درخواست جابه‌جایی شیفت" : "جابه‌جایی‌های شیفت"}>
      {swapShift ? <div className="space-y-4"><p className="rounded-xl bg-base-200 p-3 text-sm">{formatDateTime(swapShift.startsAt)} تا {formatDateTime(swapShift.endsAt)}</p><Field label="همکار مقصد"><Select value={swapTargetId} onChange={(event) => setSwapTargetId(event.target.value)}><option key="empty" value="">انتخاب همکار</option>{data?.staff.filter((member) => member.id !== data.staffId).map((member) => <option key={member.id} value={member.id}>{member.name} · {roleNames[member.role] ?? member.role}</option>)}</Select></Field><Field label="توضیح (اختیاری)"><Textarea value={swapReason} maxLength={300} onChange={(event) => setSwapReason(event.target.value)}/></Field><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setSwapOpen(false)}>انصراف</Button><Button loading={busy} onClick={() => void requestSwap()}>ارسال برای همکار</Button></div></div> : <div className="space-y-3"><p className="text-sm text-base-content/70">درخواست‌های باز را در بخش «درخواست‌های جابه‌جایی شیفت» بررسی کنید. برای ساخت درخواست، از روی شیفت آیندهٔ خود گزینهٔ «درخواست جابه‌جایی» را بزنید.</p><Button variant="secondary" onClick={() => setSwapOpen(false)}>بستن</Button></div>}
    </Modal>
    <Modal open={!!absence} onClose={() => setAbsence(null)} title="ثبت غیبت" description={absence ? `${absence.staffName} · ${formatDateTime(absence.startsAt)}` : undefined} footer={<><Button variant="ghost" onClick={() => setAbsence(null)}>انصراف</Button><Button variant="danger" loading={busy} onClick={() => void recordAbsence()}>ثبت غیبت</Button></>}>
      <Field label="توضیح یا علت غیبت (اختیاری)"><Textarea value={absenceNote} maxLength={300} onChange={(event) => setAbsenceNote(event.target.value)}/></Field>
    </Modal>
  </div>;
}
