# پیشنهاد و شکایت از پروفایل منوی آنلاین — ۲۰۲۶-۱۰-۲۴

## رفتار اضافه‌شده

- مدیر کسب‌وکار در تنظیمات می‌تواند دریافت پیشنهادها و شکایت‌ها را روشن یا خاموش کند. حالت پیش‌فرض خاموش است؛ در حالت خاموش فرم پروفایل پنهان و endpoint عمومی هم مسدود است.
- مشتری پس از ورود OTP در پروفایل، نوع پیام و متن ۱۰ تا ۱۵۰۰ نویسه‌ای ثبت می‌کند و پیام‌های قبلی خود را با وضعیت رسیدگی می‌بیند.
- مدیر/مالک در صندوق «پیشنهادها و شکایت‌ها» پیام‌های tenant خودش را بررسی کرده و وضعیت جدید/در حال پیگیری/رسیدگی‌شده تعیین می‌کند.

## پیاده‌سازی و نگهداری

تنظیم `customerFeedbackEnabled` داخل JSON تنظیمات کسب‌وکار ذخیره می‌شود. جدول `customer_feedback` با migration `0050_customer_feedback.sql` پیام را با customerId و businessId نگه می‌دارد. API عمومی هویت را از نشست OTP امضاشده می‌خواند، هیچ شمارهٔ دلخواهی را برای مالکیت نمی‌پذیرد، body را به ۸ KiB محدود و ارسال را به ۵ پیام در ۲۴ ساعت برای هر مشتری محدود می‌کند. inbox مدیر و update وضعیت در تمام queryها tenant-scoped است.

## فایل‌ها

مدل/مهاجرت: `src/db/schema.ts`, `src/db/migrations/0050_customer_feedback.sql`, `src/db/migrations/0050_customer_feedback.down.sql`.
قواعد/API: `src/lib/customer-feedback-core.ts`, `src/app/api/public/[slug]/customer/feedback/route.ts`, `src/lib/registry-b.ts`, `src/lib/auth.ts`.
UI: `src/app/dashboard/settings/page.tsx`, `src/components/settings-center.tsx`, `src/components/menu-client.tsx`, `src/components/public-menu-navigation.tsx`, `src/modules/customer-feedback.tsx`, `src/components/dashboard-shell.tsx`.
راهنماها: `docs/agents/modules/customer-feedback.md`, `docs/agents/modules/settings.md`, `docs/agents/core-pages/public-menu.md`, `docs/agents/core-pages/api-contract-map.md`, `docs/agents/README.md`, `docs/agents/module-capabilities.md`, `IMPLEMENTATION_STATUS.md`.

## اعتبارسنجی

`npm run typecheck -- --incremental false`، ESLint هدفمند فایل‌های تغییرکرده، `git diff --check` و چهار آزمون جدید موفق شدند. اجرای کامل تست‌ها ۱۸۱ موفق، ۴ ناموفق و ۷ مورد skip داشت؛ چهار شکست در تست‌های قبلیِ فهرست قالب‌های دمو و guardهای رزرو/slug دمو بود و فایل‌های مربوطه در این تغییر دست‌نخورده‌اند. Build اجرا نشد چون محیط Node `18.17.1` است و Next.js این مخزن Node `>=20.9.0` می‌خواهد. migration روی دیتابیس اجرا نشده و deploy انجام نشده است.

