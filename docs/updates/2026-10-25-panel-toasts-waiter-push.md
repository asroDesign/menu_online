# Toast سراسری پنل و اعلان پس‌زمینهٔ گارسون — ۲۰۲۶-۱۰-۲۵

## مسئله و رفتار جدید

در صفحه‌هایی مانند دفتر چک، مرکز اعلان فقط زنگ هدر را تازه می‌کرد و رویداد درخواست گارسون در همان صفحه toast نمی‌شد. صدای مرورگر نیز پیش از تعامل کاربر مجاز نبود و toast اختصاصی گارسون در بالای صفحه قرار داشت. این تغییر مرکز اعلان را به toast سراسری پایین صفحه وصل می‌کند و برای زمانی که صفحه بسته یا پس‌زمینه است، Web Push اختیاری برای نقش گارسون اضافه می‌کند.

- مرکز اعلان رویدادهای مجاز هر حساب را با toast پایین صفحه نشان می‌دهد: تماس/پیام مشتری، سفارش آنلاین و تغییر وضعیت، رزرو، هشدار انبار/انقضا و چک سررسید. دسترسی هر گروه همچنان از entitlement همان کاربر و فیلترهای tenant-scoped API پیروی می‌کند.
- مرکز اعلان هر ۱۵ ثانیه در تب باز و قابل‌مشاهده refresh می‌شود و هنگام برگشت تب نیز داده را می‌گیرد. شناسهٔ رویداد به تفکیک کسب‌وکار، نقش و گروه dedupe می‌شود تا polling یا push یک رویداد را چند بار toast نکند.
- toast تفصیلی درخواست مشتری در سفارش‌گیر گارسون/صندوق پایین صفحه قرار دارد. اولین تعامل کاربر در مرورگر صدای foreground را برای اعلان‌های بعدی unlock می‌کند؛ دکمهٔ تست صدا هم در پنل گارسون و زنگ اعلان در مرکز مشترک موجود است. مرورگر همچنان ممکن است صدا را تا تعامل کاربر مسدود کند.
- نقش گارسون با entitlement `waiter_call` در تمام صفحات پنل کارت فعال‌سازی اعلان دستگاه می‌بیند. درخواست مجوز از دکمهٔ کاربر انجام می‌شود، چون مرورگر اجازهٔ نمایش prompt خودکار نمی‌دهد. با مجوز، Service Worker اشتراک push همین دستگاه را ثبت و اعلان سیستم را در حالت پس‌زمینه/بسته نشان می‌دهد.
- اشتراک‌ها tenant و user scoped ذخیره می‌شوند. endpoint ثبت‌شده فقط باید HTTPS و از میزبان‌های شناخته‌شدهٔ Push باشد تا سرور به URL دلخواه ارسال نکند. درخواست مشتری پس از ذخیرهٔ پایدار، بدون متن آزاد مشتری برای گارسون‌های فعال همان کسب‌وکار push می‌شود. پیام broadcast به تب‌های باز فقط شناسهٔ رویداد دارد؛ هر تب جزئیات را با نشست و API کسب‌وکار خودش می‌خواند تا اطلاعات tenant دیگر نشت نکند.

## فایل‌ها و نقش آن‌ها

- `src/components/dashboard-notification-center.tsx`: polling، دسترسی دسته‌ها، dedupe، toast پایین، صدای foreground و هماهنگی پیام Service Worker.
- `src/components/waiter-service-request-notifications.tsx`: toast تعاملی درخواست میز در صفحه‌های گارسون و صندوق؛ نمایش پایین صفحه و unlock صدای foreground پس از تعامل.
- `src/components/dashboard-shell.tsx`: اتصال مرکز اعلان مشترک به ToastProvider سراسری و نمایش کارت opt-in برای گارسون.
- `src/components/waiter-push-enrollment.tsx`: وضعیت پشتیبانی مرورگر، اجازهٔ اعلان، ثبت/حذف اشتراک دستگاه و راهنمای خطای تنظیمات.
- `src/app/api/r/push-subscriptions/route.ts`: API گارسون برای ثبت/خواندن وضعیت/حذف اشتراک با کنترل نقش، feature و tenant.
- `src/lib/web-push.ts`: اعتبارسنجی VAPID، انتخاب حساب‌های گارسون فعال همان کسب‌وکار، ارسال و پاک‌سازی endpoint منقضی.
- `src/app/api/public/[slug]/service-requests/route.ts`: ارسال push پس از ثبت موفق درخواست؛ شکست push ثبت درخواست را rollback نمی‌کند.
- `src/db/schema.ts`, `src/db/migrations/0052_waiter_push_subscriptions.sql`, `src/db/migrations/0052_waiter_push_subscriptions.down.sql`: جدول اشتراک دستگاه و مسیر rollback محدود به همان جدول.
- `public/service-worker.js`, `src/app/manifest.ts`, `src/app/layout.tsx`: اعلان سیستم، کلیک اعلان و manifest اپ قابل نصب.
- `.env.example`: نام سه متغیر VAPID و مقدار نمونهٔ غیرمحرمانه.
- `tests/dashboard-notifications.test.cjs`, `tests/panel-notification-push.test.cjs`, `tests/cheque-reminders.test.cjs`: قرارداد toast، tenant/role، privacy تب‌ها، worker و حفظ هشدار چک.
- `docs/agents/modules/panel-notifications.md`, `docs/agents/README.md`, `docs/agents/module-capabilities.md`: قرارداد بازسازی ماژول و نقشه قابلیت‌ها.

## راه‌اندازی اعلان زمان بسته‌بودن پنل

1. migration `0052_waiter_push_subscriptions.sql` را روی دیتابیس مقصد اجرا کنید.
2. یک جفت VAPID ثابت تولید کنید (`npx web-push generate-vapid-keys --json`)؛ کلید خصوصی را فقط در secret store سرور قرار دهید و هرگز در کد یا فایل env نمونه ذخیره نکنید.
3. `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` و `WEB_PUSH_VAPID_SUBJECT` را به runtime وب/API اضافه و سرویس را deploy/restart کنید.
4. گارسون با HTTPS (یا localhost امن) وارد پنل شود و روی «فعال‌سازی اعلان» بزند. برای iPad/iPhone ممکن است افزودن وب‌اپ به Home Screen لازم باشد.

صدای اعلان پس‌زمینه به تنظیم صدای سیستم‌عامل، مرورگر و حالت Focus/Do Not Disturb وابسته است؛ وب‌سایت نمی‌تواند صدا را اجبار کند. migration روی دیتابیس واقعی و اعلان push روی مرورگر/دستگاه واقعی در این تغییر اجرا نشد.

## اعتبارسنجی

- `node --test tests/dashboard-notifications.test.cjs tests/panel-notification-push.test.cjs tests/cheque-reminders.test.cjs`: ۱۱ موفق.
- کل `node --test tests/*.test.cjs`: ۲۰۷ آزمون، ۱۹۷ موفق، ۳ شکست قدیمی در assertionهای دمو/حالت فقط‌خواندنی، ۷ ردشدهٔ نیازمند PostgreSQL تست.
- `npx tsc --noEmit --incremental false`, ESLint هدفمند و `git diff --check` موفق.
- push واقعی، migration روی دیتابیس، مجوز Chrome/سیستم‌عامل و دریافت اعلان در حالت بسته تست نشده‌اند.
