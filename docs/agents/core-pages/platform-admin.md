# پنل مدیر سامانه

> مشخصات بازسازی عامل برای صفحه/جریان عمومی یا سیستمی.

- مسیر: `/admin`
- منبع فعلی: `src/app/admin/page.tsx + src/components/admin/*`
- هدف: مدیریت چند tenant و عملیات پلتفرم؛ از dashboard رستوران جداست.

## رابط و جریان

AdminShell با ناوبری overview, businesses, accounting/plans, misc, tickets, users؛ overview آمار؛ مدیریت کسب‌وکار/تعلیق/تعرفه؛ بررسی حسابداری و تیکت؛ مدیریت user. دسترسی با permsOf و role admin.

## API و داده

API namespace /api/admin/[...path]؛ صفحات/کامپوننت src/components/admin/{overview,businesses,accounting,plans,misc,tickets,users,shell}.

## قواعد بازسازی

RBAC ادمین در سرور؛ هر action حساس audit/confirm؛ عدم استفاده از tenant route عمومی؛ نگهداری pagination و وضعیت خطا.

برای schema دقیق و شرط‌های موجود، فایل‌های source و API بالا را بخوان. UI عمومی باید tenant-isolated، RTL و responsive باشد.

## مشخصات سطح پیاده‌سازی

### دسترسی و ناوبری

`/admin` با shell مستقل از پنل tenant رندر می‌شود و route سرور/لایه `permsOf` مجوزهای platform admin را بررسی می‌کند. بخش‌ها طبق فایل‌های `src/components/admin/{shell,overview,businesses,accounting,plans,misc,tickets,users}` تفکیک شده‌اند: شاخص کلی، tenantها و وضعیت تعلیق، تعرفه/فاکتور پلتفرم، تنظیم‌های عمومی، تیکت‌ها و کاربران.

### عملیات حساس

هر عملیات باید از `src/app/api/admin/[...path]/route.ts` و مجوز دقیق action پیروی کند؛ این API یک catch-all است و endpoint/body هر tab را از dispatch map استخراج کن، نه از نام UI حدس بزن. تغییر تعرفه، تعلیق یا دستکاری دسترسی tenant، تغییر کاربر و عملیات مالی باید confirmation، نتیجه API و audit trail موجود را حفظ کنند. نمای admin نباید از endpoint `/api/r` tenant استفاده کند.

### بازسازی و پذیرش

RBAC در سرور مرجع است، مخفی‌کردن یک تب در React جای authorization نیست. Loading/error/empty برای هر تب جدا، pagination/filter اگر موجود، و نمایش خطا در عملیات mutation لازم است. tenant انتخاب‌شده باید در کل مسیر API و لینک‌ها ثابت و واضح باشد؛ داده محرمانه tenantهای غیرمجاز نباید در کلاینت cache شود. برای تغییر routeهای مدیر، تمام مجوزها و تست‌های `src/app/api/admin` را مرور کن.

