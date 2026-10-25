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
        { key: "nationalId", label: "کد ملی", ltr: true, hint: "برای لیست بیمه و مالیات" },
        { key: "birthDate", label: "تاریخ تولد", type: "date" },
        { key: "fatherName", label: "نام پدر" },
        { key: "maritalStatus", label: "وضعیت تأهل", type: "select", options: [{ value: "single", label: "مجرد" }, { value: "married", label: "متأهل" }, { value: "unknown", label: "ثبت نشده" }] },
        { key: "employmentStartDate", label: "تاریخ شروع به کار", type: "date", hint: "برای محاسبه سابقه و پایه سنوات" },
        { key: "employmentEndDate", label: "تاریخ پایان همکاری", type: "date" },
        { key: "contractType", label: "نوع قرارداد", type: "select", options: [{ value: "permanent", label: "دائم" }, { value: "temporary", label: "موقت" }, { value: "fixed_term", label: "مدت‌معین" }, { value: "part_time", label: "پاره‌وقت" }, { value: "project", label: "پروژه‌ای" }] },
        { key: "jobTitle", label: "عنوان شغلی" },
        { key: "jobCode", label: "کد شغل بیمه", ltr: true },
        { key: "insuredHistoryDays", label: "سابقه بیمه (روز)", type: "number", initial: 0 },
        { key: "insuranceNumber", label: "شماره بیمه", ltr: true },
        { key: "childrenCount", label: "تعداد فرزندان", type: "number", initial: 0 },
        { key: "childAllowanceEligible", label: "احراز شرایط حق اولاد", type: "bool", hint: "پس از بررسی مدارک و سابقه بیمه" },
        { key: "salaryMode", label: "شیوه تعیین حقوق", type: "select", options: [{ value: "statutory", label: "حقوق پایه و مزایای انتخابی" }, { value: "fixed", label: "مبلغ ثابت توافقی" }] },
        { key: "monthlyBaseSalaryToman", label: "حقوق پایه ماهانه (تومان)", type: "money", initial: 0, hint: "اگر حقوق پایه ثبت نشود یا صفر باشد، حداقل مزد روزانهٔ سال انتخابی در حقوق و دستمزد خودکار مبنا قرار می‌گیرد؛ مزایا و پایه سنوات نیز طبق تنظیمات و اطلاعات استخدامی محاسبه می‌شوند." },
        { key: "fixedAgreedSalaryToman", label: "حقوق توافقی ثابت ماهانه (تومان)", type: "money", initial: 0, hint: "در قرارداد مبلغ ثابت؛ اگر صفر باشد حداقل مزد قانونی سال انتخابی مبنا می‌شود. بیمه و مالیات همچنان طبق وضعیت انتخابی محاسبه می‌شود." },
        { key: "managementAllowanceToman", label: "حق مدیریت ماهانه (تومان)", type: "money", initial: 0 },
        { key: "annualServiceBaseToman", label: "پایه سنوات ماهانه (تومان)", type: "money", initial: 0, hint: "برای سابقهٔ حداقل یک‌سال؛ خالی/صفر باشد مبلغ سال جاری از تنظیمات حقوق گرفته می‌شود." },
        { key: "overtimeEligible", label: "امکان محاسبه اضافه‌کاری", type: "bool", initial: true },
        { key: "includeHousing", label: "محاسبه کمک‌هزینه مسکن", type: "bool", initial: true },
        { key: "includeFood", label: "محاسبه بن و اقلام مصرفی", type: "bool", initial: true },
        { key: "includeMaritalAllowance", label: "محاسبه حق تأهل", type: "bool", initial: true },
        { key: "includeChildAllowance", label: "محاسبه حق اولاد", type: "bool", initial: true },
        { key: "includeSeniority", label: "محاسبه پایه سنوات", type: "bool", initial: true },
        { key: "insuranceEnabled", label: "مشمول بیمه تأمین اجتماعی", type: "bool", initial: true },
        { key: "incomeTaxEnabled", label: "مشمول محاسبه مالیات حقوق", type: "bool", initial: true },
        { key: "bankAccountName", label: "نام صاحب حساب", hint: "برای درج روی فیش و پرداخت حقوق" },
        { key: "bankAccountNumber", label: "شماره حساب", ltr: true },
        { key: "iban", label: "شماره شبا", ltr: true, hint: "با IR وارد شود" },
      ]}
      fieldGroups={[
        { label: "اطلاعات پایه", keys: ["name", "role", "phone", "email", "password", "nationalId", "birthDate", "fatherName", "maritalStatus", "childrenCount"] },
        { label: "قرارداد و حقوق", keys: ["employmentStartDate", "employmentEndDate", "contractType", "jobTitle", "salaryMode", "monthlyBaseSalaryToman", "fixedAgreedSalaryToman", "managementAllowanceToman", "annualServiceBaseToman", "overtimeEligible", "includeHousing", "includeFood", "includeMaritalAllowance", "includeChildAllowance", "includeSeniority"] },
        { label: "بیمه، مالیات و بانک", keys: ["jobCode", "insuranceNumber", "insuredHistoryDays", "childAllowanceEligible", "insuranceEnabled", "incomeTaxEnabled", "bankAccountName", "bankAccountNumber", "iban"] },
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
