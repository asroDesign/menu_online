# چاپ مستقیم رسید و بلیت آشپزخانه — ۲۰۲۶-۱۰-۲۳

## رفتار نهایی

- در modal جزئیات `/dashboard/orders`، دکمهٔ «رسید» چاپگر مشتری را از صف عامل محلی فعال می‌کند.
- در فهرست سفارش‌های جاری صندوق، «فیش» روی چاپگر فیش مشتری و «آشپزخانه» روی مسیر چاپگرهای آشپزخانه job می‌سازند.
- در modal جزئیات صندوق، فیش مشتری، بلیت آشپزخانه و نسخهٔ کافه به همان endpoint فرستاده می‌شوند.
- آرشیو رسیدها نیز بازچاپ را مستقیم به صف می‌فرستد. این دکمه‌ها هیچ‌کدام صفحه یا پنجرهٔ پیش‌نمایش مرورگر را باز نمی‌کنند.

## مسیردهی و ایمنی

مؤلفهٔ مشترک `src/components/manual-order-print-button.tsx` دکمهٔ درحال‌ارسال، جلوگیری از ارسال دوبارهٔ هم‌زمان، خطای API و نتیجهٔ صف را مدیریت می‌کند. endpoint موجود `POST /api/orders/:id/print` همچنان محدودیت نرخ، entitlement، نقش و تعلق سفارش به tenant را اعمال می‌کند.

نوع `customer` از چاپگر فیش مشتریِ policy تسویه (`settled.customerPrinterId`) استفاده می‌کند و اگر آن انتخاب خالی باشد به اولین چاپگر کسب‌وکار می‌رود. نوع `kitchen` از چاپگرهای انتخاب‌شدهٔ آشپزخانه استفاده می‌کند؛ در نبود انتخاب صریح، چاپگرهای دارای دسته‌بندی را به کار می‌گیرد. برای درخواست دستی آشپزخانه، fallback به اولین چاپگر حذف شد تا بلیت ناخواسته روی چاپگر فیش مشتری چاپ نشود. اگر مسیر آشپزخانه‌ای موجود نباشد یا دسته‌های آن قلمی از سفارش را پوشش ندهند، پاسخ فعلی endpoint خطای 409 می‌دهد.

این API چاپ فیزیکی را داخل مرورگر اجرا نمی‌کند؛ job را در صف پایدار ثبت می‌کند تا Agent ویندوزی آن را برای چاپگر شبکه/USB تنظیم‌شده بردارد. وقتی Agent آفلاین است job در صف می‌ماند؛ بنابراین بازخورد UI ساخته‌شدن job را تأیید می‌کند، نه خروج کاغذ از دستگاه.

## فایل‌ها و مستندات

- کد: `src/components/manual-order-print-button.tsx`, `src/components/cashier-order-desk.tsx`, `src/modules/orders.tsx`, `src/lib/orders.ts`.
- تست: `tests/printer-settings.test.cjs`, `tests/security-regressions.test.cjs`.
- راهنماهای agent: `docs/agents/modules/orders.md`, `docs/agents/modules/cashier.md`, `docs/agents/modules/printers.md`, `docs/agents/core-pages/print-views.md`, `docs/agents/module-capabilities.md`.
- هیچ schema یا migration تغییر نکرده است.

## اعتبارسنجی

`node --test tests/*.test.cjs`: ۱۴۷ موفق، صفر شکست، ۷ تست PostgreSQL به‌دلیل نبود URL دیتابیس skip شدند. ESLint هدفمند، `next typegen`, `npm run typecheck -- --incremental false`, `npm run build` و `git diff --check` موفق شدند. build دو هشدار CSS موجود DaisyUI دربارهٔ `@property` داشت. چاپ واقعی روی سخت‌افزار در محیط توسعه انجام نشده است.
