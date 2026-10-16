"use client";

import { ResourcePage } from "@/components/resource-page";
import { Badge, Card, Switch , IconText} from "@/components/ui";
import { STAFF_ROLE_LABELS } from "@/lib/roles";
import { toFa } from "@/lib/format";

type Member = { id: number; name: string; role: string; phone: string; email: string; hasLogin: boolean; isActive: boolean };
const COLOR: Record<string, string> = { waiter: "brand", cashier: "blue", chef: "violet", warehouse: "amber", accountant: "teal", manager: "rose" };
const ACCESS: [string, string][] = [
  ["waiter", "ثبت سفارش، میزها، پنل گارسون، مشتریان"],
  ["cashier", "همه‌ی امکانات گارسون + صندوق و دریافت وجه، پیک، پیجر، کالر آیدی"],
  ["chef", "نمایش سفارش‌ها، تبلت آشپزخانه، پیجر، مشاهده‌ی فرمول ساخت"],
  ["warehouse", "انبارداری، گردش و کنترل انبار، فرمول ساخت، بهای تمام‌شده"],
  ["accountant", "حسابداری، درآمد و هزینه، گزارش‌های مالی، بانک، اموال"],
  ["manager", "دسترسی کامل مانند مالک (به‌جز تنظیمات پلن)"],
];

export default function Staff() {
  return (
    <ResourcePage<Member>
      title="کارمندان"
      subtitle="هر کارمند می‌تواند با ایمیل و رمز خودش وارد شود و فقط به بخش مربوط به نقشش دسترسی دارد"
      endpoint="/api/staff"
      emoji=""
      emptyTitle="هنوز کارمندی ثبت نشده"
      emptyDesc="گارسون، آشپز، انباردار و حسابدار اضافه کنید و برایشان حساب ورود بسازید."
      addLabel="کارمند جدید"
      optimisticExtra={{ hasLogin: false, isActive: true }}
      search={(r, t) => r.name.includes(t) || r.email.includes(t)}
      fields={[
        { key: "name", label: "نام و نام خانوادگی", required: true },
        { key: "role", label: "نقش", type: "select", options: Object.entries(STAFF_ROLE_LABELS).map(([k, v]) => ({ value: k, label: v })) },
        { key: "phone", label: "موبایل" },
        { key: "email", label: "ایمیل ورود", ltr: true, hint: "برای ساخت حساب ورود" },
        { key: "password", label: "رمز عبور", secret: true, hint: "هنگام ویرایش: خالی = بدون تغییر" },
      ]}
      header={() => (
        <Card className="mb-5 p-4">
          <p className="mb-3 text-sm font-bold">سطح دسترسی هر نقش</p>
          <ul className="grid gap-2 text-xs text-stone-600 md:grid-cols-2">{ACCESS.map(([k, t]) => <li key={k} className="flex items-start gap-2"><Badge color={COLOR[k]}>{STAFF_ROLE_LABELS[k]}</Badge><span className="leading-6">{t}</span></li>)}</ul>
          <p className="mt-3 text-[11px] text-stone-400">دسترسی هر نقش با پلن رستوران هم محدود می‌شود؛ مثلاً حسابدار فقط در پلن‌هایی که حسابداری دارند کار می‌کند.</p>
        </Card>
      )}
      columns={[
        { label: "کارمند", render: (r) => <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-extrabold text-white">{r.name.trim()[0]}</span><div><p className="font-bold">{r.name}</p><p className="text-xs text-stone-400">{r.phone ? toFa(r.phone) : "—"}</p></div></div> },
        { label: "نقش", render: (r) => <Badge color={COLOR[r.role] ?? "stone"}>{STAFF_ROLE_LABELS[r.role] ?? r.role}</Badge> },
        { label: "حساب ورود", render: (r) => (r.hasLogin ? <span className="text-xs" dir="ltr"><IconText>{r.email || " دارد"}</IconText></span> : <span className="text-xs text-stone-400">ندارد</span>) },
        { label: "وضعیت", render: (r) => <span className="inline-flex items-center gap-2 text-xs">{r.isActive ? "فعال" : "غیرفعال"}</span> },
      ]}
      rowActions={(r, ctx) => <Switch checked={r.isActive} label="فعال" onChange={(v) => ctx.update(r.id, { isActive: v }).catch((e) => ctx.toast(e.message, "error"))} />}
    />
  );
}
