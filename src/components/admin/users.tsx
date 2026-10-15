"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { ADMIN_DEPTS } from "@/lib/admin-meta";
import { STAFF_ROLE_LABELS } from "@/lib/roles";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, Select, Skeleton, Switch, useToast } from "@/components/ui";
import { useGet, type Me } from "@/components/admin/common";

const ROLE: Record<string, string> = { owner: "مالک رستوران", staff: "کارمند", courier: "پیک", admin: "تیم مدیریت", "": "مالک رستوران" };

export function UsersTab({ me }: { me: Me }) {
  const toast = useToast();
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const { data, error, loading, reload, setData } = useGet<{ items: any[] }>(`/api/admin/users?role=${role}&q=${encodeURIComponent(q)}`);
  const [create, setCreate] = useState<any>(null);
  const [pwd, setPwd] = useState<{ email: string; password: string } | null>(null);
  const [del, setDel] = useState<any>(null);
  const fail = (e: unknown) => toast((e as Error).message, "error");

  async function toggle(u: any, v: boolean) {
    setData((d) => (d ? { items: d.items.map((x) => (x.id === u.id ? { ...x, isActive: v } : x)) } : d));
    try { await api(`/api/admin/users/${u.id}`, { method: "PATCH", body: { isActive: v } }); toast(v ? "حساب فعال شد" : "حساب غیرفعال شد و از همه‌ی دستگاه‌ها خارج شد"); } catch (e) { fail(e); reload(true); }
  }
  async function reset(u: any) {
    try { const r = await api<{ password: string }>(`/api/admin/users/${u.id}`, { method: "PATCH", body: { resetPassword: true } }); setPwd({ email: u.email, password: r.password }); } catch (e) { fail(e); }
  }
  async function changeDept(u: any, dept: string) {
    try { await api(`/api/admin/users/${u.id}`, { method: "PATCH", body: { dept } }); toast("دپارتمان تغییر کرد"); reload(true); } catch (e) { fail(e); }
  }
  const admins = (data?.items ?? []).filter((u) => u.role === "admin");
  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-xl font-extrabold sm:text-2xl">کاربران و تیم مدیریت</h1><p className="mt-1 text-sm text-stone-500">اعضای تیم پشتیبانی/مالی/فروش با دسترسی محدود به دپارتمان خودشان، و مدیریت حساب همه‌ی کاربران</p></div><Button onClick={() => setCreate({ name: "", email: "", password: "", dept: "support" })}><Icon name="plus" className="size-4" /> عضو جدید تیم</Button></div>
      <Card className="p-4"><p className="mb-3 text-sm font-bold">دسترسی هر دپارتمان</p><ul className="grid gap-2 text-xs leading-6 text-stone-600 md:grid-cols-2">
        {([["super", "همه‌ی بخش‌ها، حذف کسب‌وکار، کاربران، تنظیمات و گزارش فعالیت"], ["support", "نمای کلی، مشاهده‌ی کسب‌وکارها و ورود به حساب، تیکت‌ها، اطلاعیه‌ها"], ["tech", "نمای کلی، مشاهده‌ی کسب‌وکارها و ورود به حساب، تیکت‌های فنی"], ["finance", "حسابداری و فاکتورها، مشاهده‌ی کسب‌وکارها، تیکت‌ها"], ["sales", "کسب‌وکارها (ایجاد/ویرایش)، پلن‌ها و قیمت‌ها، فاکتورها، تیکت‌ها"]] as const).map(([k, t]) => <li key={k} className="flex items-start gap-2"><Badge color="rose">{ADMIN_DEPTS[k].emoji} {ADMIN_DEPTS[k].label}</Badge><span>{t}</span></li>)}</ul></Card>

      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-44" value={role} onChange={(e) => setRole(e.target.value)}><option value="">همه نقش‌ها</option><option value="admin">تیم مدیریت</option><option value="staff">کارمندان</option><option value="courier">پیک‌ها</option><option value="owner">مالکان</option></Select>
        <div className="relative w-64"><Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><Input className="ps-9" placeholder="نام یا ایمیل…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="text-xs text-stone-400">{admins.length ? `${admins.length.toLocaleString("fa-IR")} عضو تیم مدیریت` : ""}</span>
      </div>
      {error ? <ErrorState message={error} onRetry={() => reload()} /> : loading && !data ? <Skeleton className="h-64 rounded-2xl" /> : !data?.items.length ? <EmptyState emoji="👥" title="کاربری پیدا نشد" /> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead><tr className="border-b bg-stone-50 text-xs text-stone-500"><th className="p-3 text-start">کاربر</th><th className="p-3 text-start">نقش</th><th className="p-3 text-start">کسب‌وکار</th><th className="p-3 text-start">عضویت</th><th className="p-3 text-start">فعال</th><th className="p-3" /></tr></thead>
          <tbody className="divide-y divide-stone-100">{data.items.map((u) => {
            const isMe = u.id === me.id;
            return (
              <tr key={u.id} className="hover:bg-stone-50/70"><td className="p-3"><p className="font-bold">{u.name} {isMe && <Badge color="brand">شما</Badge>}</p><p className="text-xs text-stone-400" dir="ltr" style={{ textAlign: "start" }}>{u.email}</p></td>
                <td className="p-3">{u.role === "admin" ? <Select className="!h-8 w-32 !text-xs" value={u.dept ?? "super"} disabled={isMe} onChange={(e) => changeDept(u, e.target.value)}>{Object.entries(ADMIN_DEPTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select> : <Badge color={u.role === "courier" ? "amber" : u.role === "staff" ? "blue" : "stone"}>{u.role === "staff" ? STAFF_ROLE_LABELS[u.dept] ?? "کارمند" : ROLE[u.role]}</Badge>}</td>
                <td className="p-3 text-xs text-stone-600">{u.businessName || "—"}</td><td className="p-3 text-xs text-stone-500">{formatDate(u.createdAt)}</td>
                <td className="p-3"><Switch checked={u.isActive} disabled={isMe} onChange={(v) => toggle(u, v)} label="فعال" /></td>
                <td className="p-2"><div className="flex justify-end gap-1"><Button size="sm" variant="secondary" onClick={() => reset(u)}>🔑 بازنشانی رمز</Button>{u.role === "admin" && !isMe && <IconButton icon="trash" label="حذف" className="hover:text-rose-600" onClick={() => setDel(u)} />}</div></td></tr>
            );
          })}</tbody></table></Card>
      )}
      <Modal open={!!create} onClose={() => setCreate(null)} size="sm" title="عضو جدید تیم مدیریت" footer={<><Button variant="ghost" onClick={() => setCreate(null)}>انصراف</Button><Button onClick={async () => { try { const r = await api<{ item: { email: string; password: string } }>("/api/admin/users", { method: "POST", body: create }); setCreate(null); setPwd(r.item); toast("عضو جدید اضافه شد"); reload(true); } catch (e) { fail(e); } }}>افزودن</Button></>}>
        {create && <div className="space-y-4"><Field label="نام و نام خانوادگی"><Input value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} /></Field><Field label="ایمیل ورود"><Input dir="ltr" className="text-left" value={create.email} onChange={(e) => setCreate({ ...create, email: e.target.value })} /></Field><Field label="دپارتمان"><Select value={create.dept} onChange={(e) => setCreate({ ...create, dept: e.target.value })}>{Object.entries(ADMIN_DEPTS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}</Select></Field><Field label="رمز عبور" hint="خالی = ساخت خودکار"><Input dir="ltr" className="text-left" value={create.password} onChange={(e) => setCreate({ ...create, password: e.target.value })} /></Field></div>}
      </Modal>
      <Modal open={!!pwd} onClose={() => setPwd(null)} size="sm" title="مشخصات ورود" footer={<><Button variant="secondary" onClick={() => pwd && navigator.clipboard.writeText(`ایمیل: ${pwd.email}\nرمز: ${pwd.password}`).then(() => toast("کپی شد"))}>کپی</Button><Button onClick={() => setPwd(null)}>تمام</Button></>}>
        {pwd && <div className="space-y-3"><p className="text-sm text-amber-800">رمز فقط همین یک‌بار نمایش داده می‌شود. کاربر از همه‌ی دستگاه‌ها خارج شده است.</p><div className="space-y-1 rounded-xl bg-stone-900 p-4 text-left text-sm text-emerald-300" dir="ltr"><p>Email: {pwd.email}</p><p>Password: {pwd.password}</p></div></div>}
      </Modal>
      <ConfirmDialog open={!!del} title="حذف عضو تیم" message={del ? `«${del.name}» از تیم مدیریت حذف می‌شود و تیکت‌های تخصیص‌یافته به او بدون کارشناس می‌شوند.` : ""} onClose={() => setDel(null)} onConfirm={async () => { try { await api(`/api/admin/users/${del.id}`, { method: "DELETE" }); toast("حذف شد"); reload(true); } catch (e) { fail(e); } }} />
    </div>
  );
}
