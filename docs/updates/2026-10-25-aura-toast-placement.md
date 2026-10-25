# بازطراحی toastهای پنل با Aura — ۲۰۲۶-۱۰-۲۵

## نتیجه

toastهای ساخته‌شده با `useToast` اکنون در گوشهٔ پایینِ چپ نمایش داده می‌شوند. هر اعلان در یک کارت راست‌چین با نشانگر رنگی نوع پیام و قاب متحرک `aura aura-sm` قرار دارد؛ موفقیت سبز، هشدار کهربایی و خطا قرمز است. کارت با پس‌زمینهٔ نیمه‌شفاف، blur و shadow از محتوای صفحه جدا می‌شود و در موبایل عرض viewport را رعایت می‌کند. toast تفصیلی تماس میز نیز در همان سمت، بالای دکمهٔ شناور گارسون/صندوق قرار می‌گیرد.

ماندگاری خودکار از ۳٫۵ به ۵ ثانیه افزایش یافته است؛ خطاهای فرم و پیام‌های عادی پنل برای این مدت کامل قابل مشاهده می‌مانند. toast درخواست میز زمان ۱۲ ثانیه‌ای خود را حفظ می‌کند. تایمرهای `ToastProvider` هنگام unmount پاک می‌شوند. پیام‌های خطا با `role="alert"` و پیام‌های دیگر با `role="status"` برای فناوری‌های کمکی اعلام می‌شوند.

## فایل‌ها

- `src/components/ui.tsx` — جایگاه toast، کارت Aura، تمایز نوع پیام، مدت ۵۰۰۰ میلی‌ثانیه و پاک‌سازی timer.
- `src/components/waiter-service-request-notifications.tsx` — جابجایی toast اختصاصی تماس میز به پایینِ چپ بالای دکمهٔ شناور؛ Aura و مدت ۱۲ ثانیه حفظ شده‌اند.
- `docs/agents/modules/ui-components.md` — قرارداد استفاده از `ToastProvider` و `useToast`.
- `docs/agents/modules/panel-notifications.md` — جایگاه/مدت toast اعلان‌های سامانه.
- `docs/agents/README.md`, `docs/agents/module-capabilities.md`, `IMPLEMENTATION_STATUS.md` — نقشه و سابقهٔ قابلیت.

این پیاده‌سازی از کامپوننت Aura در [مستندات DaisyUI](https://daisyui.com/components/aura/) و کلاس‌های موجود در نسخهٔ نصب‌شدهٔ daisyUI 5.7.50 استفاده می‌کند.

## بررسی

- `npm run typecheck` — موفق.
- `npx eslint src/components/ui.tsx src/components/waiter-service-request-notifications.tsx` — موفق.
- تست‌های `tests/dashboard-notifications.test.cjs` و `tests/panel-notification-push.test.cjs` — ۶ موفق؛ قرارداد جایگاه پایینِ چپ، Aura و ماندگاری پنج‌ثانیه‌ای هم بررسی می‌شود.
- `git diff --check` — موفق.
