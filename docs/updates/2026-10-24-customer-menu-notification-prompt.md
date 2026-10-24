# کارت اجازهٔ اعلان مشتری — ۲۰۲۶-۱۰-۲۴

## رفتار

منوی عمومی پس از ورود OTP کارت سبز اجازهٔ اعلان را نشان می‌دهد. متن و کنترل‌ها مطابق نمونه‌اند. «فعال‌سازی اعلان» مجوز native مرورگر را می‌گیرد. ضربدر و «بعداً» کارت را برای همان slug در `localStorage` پنهان می‌کنند. کارت فقط در HTTPS/localhost، مرورگر پشتیبان و تا وقتی مجوز `default` است دیده می‌شود.

پس از اجازه، کلاینت نشست مشتری را هر ۴۵ ثانیه و هنگام برگشت تب از حالت مخفی دوباره می‌خواند. تغییر وضعیت سفارش، پرداخت، تحویل، رزرو و پیش‌پرداخت یا ماندهٔ کیف پول به اعلان سیستم‌عامل تبدیل می‌شود. snapshot نخست baseline است تا فعال‌سازی به‌تنهایی اعلان نسازد. کلیک اعلان سفارش/رزرو فهرست سفارش‌های مشتری و کلیک اعلان کیف پول پروفایل را باز می‌کند.

## پیاده‌سازی و مرز داده

- `src/components/public-menu-navigation.tsx`: کارت UI، درخواست مجوز، ذخیرهٔ dismiss، polling و تولید متن اعلان.
- `src/lib/public-menu-notifications.ts`: مقایسهٔ snapshotها به‌صورت مستقل از React.
- `src/lib/public-customer-data.ts`: رزروهای متعلق به همان کسب‌وکار و شمارهٔ مشتری تأییدشده را به session profile اضافه می‌کند؛ خروجی یادداشت یا شماره تلفن را برنمی‌گرداند.
- `tests/public-menu-notifications.test.cjs`: تغییرها و scope داده را بررسی می‌کند.
- راهنمای بازسازی در `docs/agents/core-pages/public-menu.md` و فهرست کاربردها در `docs/agents/module-capabilities.md` به‌روز شده‌اند.

این نسخه تا وقتی صفحهٔ منو باز است کار می‌کند. اعلان Web Push پس از بسته‌شدن کامل سایت به subscription، Service Worker و کلیدهای VAPID نیاز دارد و در این تغییر پیاده‌سازی نشده است. هیچ migration یا ارسال پیامکی/پرداخت واقعی انجام نشده.

## اعتبارسنجی

`node --test tests/public-menu-notifications.test.cjs` (۳ تست)، ESLint هدفمند، `npm run typecheck -- --incremental false`, production build و `git diff --check` موفق شدند. کل suite: ۱۷۷ موفق، ۴ شکست assertion قدیمی و نامرتبط در دموها، ۷ مورد PostgreSQL-محور اجرا‌نشده. build دو هشدار قدیمی DaisyUI دربارهٔ `@property` داشت. مرورگر واقعی و اعلان سیستم‌عامل دستی آزمایش نشدند.
