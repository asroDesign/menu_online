import Link from "next/link";
import { Icon, cn } from "@/components/ui";

const GROUPS = [
  {
    title: "پروفایل و هویت",
    icon: "building",
    items: [
      ["اطلاعات پایه", "نام تجاری، تلفن و نشانی", "#business-info", "building"],
      ["لوگو و برندینگ", "معرفی و رنگ سازمانی کسب‌وکار", "#identity", "layers"],
      ["ساعت کاری", "روزها و بازهٔ فعالیت", "#operating-hours", "clock"],
    ],
  },
  {
    title: "منوی دیجیتال",
    icon: "utensils",
    items: [
      ["قالب و ظاهر منو", "پوسته، رنگ و پیش‌نمایش", "#menu-theme", "layers"],
      ["آدرس منو", "پیوند اختصاصی و QR", "#menu-url", "qr"],
      ["بنرهای تبلیغاتی", "تصاویر و پیوندهای منوی عمومی", "#menu-banners", "image"],
    ],
  },
  {
    title: "فروش و سفارش",
    icon: "cart",
    items: [
      ["امکانات سفارش‌گیری", "مراحل، مالیات و پذیرش سفارش", "#order-settings", "orders"],
      ["انبار", "موجودی و گردش کالا", "/dashboard/inventory", "box"],
      ["پیامک و اطلاع‌رسانی", "تنظیمات و ارسال پیامک", "/dashboard/sms", "envelope"],
      ["پرینترها", "دستگاه‌ها و ایستگاه‌های چاپ", "/dashboard/settings/printers/devices", "print"],
      ["کارت‌های بانکی", "حساب‌های تسویه و کارت‌به‌کارت", "#card-transfer", "bank"],
    ],
  },
  {
    title: "مشتریان",
    icon: "users",
    items: [
      ["وفاداری و سطح عضویت", "قواعد عضویت و مزایا", "/dashboard/customers#membership-tiers", "star"],
      ["باشگاه مشتریان", "فهرست و دسته‌بندی مشتریان", "/dashboard/customers", "users"],
    ],
  },
  {
    title: "تنظیمات پیشرفته",
    icon: "settings",
    items: [
      ["اشتراک و صورتحساب", "پلن، امکانات و پرداخت", "/dashboard/plan", "credit-card"],
      ["امنیت حساب", "تغییر گذرواژهٔ ورود", "#account-security", "shield"],
      ["تیم و دسترسی‌ها", "کارمندان و نقش‌های عملیاتی", "/dashboard/staff", "users"],
    ],
  },
] as const;

export function SettingsCenter() {
  return (
    <section aria-labelledby="settings-center-title" className="mb-6 scroll-mt-24">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><h2 id="settings-center-title" className="text-lg font-extrabold">مرکز تنظیمات کافه</h2><p className="mt-1 text-sm text-base-content/60">تنظیمات کسب‌وکار را بر اساس موضوع پیدا و مدیریت کنید.</p></div>
        <span className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary sm:inline-flex">۵ بخش مدیریتی</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {GROUPS.map((group) => <section key={group.title} className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-3 p-4">
            <h3 className="flex items-center gap-2 font-bold"><span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name={group.icon} className="size-4" /></span>{group.title}</h3>
            <div className="grid gap-1">
              {group.items.map(([title, description, href, icon]) => <Link key={title} href={href} className={cn("group flex min-h-12 items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-base-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary", "text-base-content")}>
                <Icon name={icon} className="size-4 shrink-0 text-base-content/55 group-hover:text-primary" />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="block truncate text-xs text-base-content/55">{description}</span></span>
                <Icon name="chevronLeft" className="size-4 shrink-0 text-base-content/40" />
              </Link>)}
            </div>
          </div>
        </section>)}
      </div>
    </section>
  );
}
