# تم فضایی Captain M و یک‌دست‌سازی دامنهٔ پروژه

## رفتار پیاده‌سازی‌شده

- دموهای Captain M در `/preview/captainm` و صفحه‌های محصولات/دسته، از ظاهر دریایی به تم فضایی تغییر کردند: آسمان شب با ستاره‌های CSS، هاله‌های بنفش و فیروزه‌ای، کارت‌های تیره، دسته‌بندی کناری در دسکتاپ و نوار افقی در موبایل.
- قالب `captainm` در تنظیمات `/dashboard/settings#menu-theme` همین تم را روی منوی واقعی رستوران اجرا می‌کند. انتخاب آن فقط ظاهر را عوض می‌کند و به نام، دسته‌ها، محصولات، قیمت، تصویر و گردش سفارش رستوران دست نمی‌زند.
- پیش‌نمایش کارت قالب در تنظیمات، نوار ناوبری مشتری و مستندات بازسازی با طرح فضایی هم‌راستا شدند.
- نشانی‌های ایمیل ساختگی ثبت‌نام OTP، حساب‌های نمایشی/seed و تنظیم ایمیل پشتیبانی از دامنهٔ پروژه استفاده می‌کنند (`menupeak.ir`). دامنه در شرط migration پرداخت نیز با همین الگو هم‌راستا شد.
- کلیدهای `sessionStorage` با پیشوند قدیمی نام محصول تغییر نکردند؛ این‌ها دامنهٔ اینترنتی نیستند و تغییرشان می‌توانست مسیر ادامهٔ تور راه‌اندازی را از بین ببرد.

## فایل‌های اصلی

- `src/components/marketing/demo-templates/captainm.tsx`: طرح فضایی دمو و اجزای خانه/محصول.
- `src/components/marketing/demo-templates/demo-template-parts.tsx`: رنگ‌بندی فضایی نشان برند و تصویر محصول.
- `src/components/menu-client.tsx`, `src/components/public-menu-navigation.tsx`: تم فضایی قابل انتخاب روی کاتالوگ واقعی.
- `src/app/dashboard/settings/page.tsx`, `src/lib/menu-templates.ts`: پیش‌نمایش و توضیح قالب.
- `src/app/api/auth/register/complete/route.ts`, `src/lib/seed.ts`, `src/lib/seed-extra.ts`, `src/lib/demo-mode.ts`, `src/db/migrations/0007_subscription_payment_gate.sql`: هم‌راستاسازی نشانی‌های ساختگی با دامنهٔ MenuPeak.
- `docs/agents/core-pages/demo-preview.md`, `docs/agents/core-pages/public-menu.md`, `docs/agents/modules/settings.md`: راهنمای توسعه و بازسازی.

## بررسی

- جست‌وجوی `menudigital.ir` در `src/` و `tests/` باید بدون نتیجه باشد.
- `npm run typecheck`, lint فایل‌های تغییرکرده و تست‌های `tests/menu-template-options.test.cjs` و `tests/demo-menus.test.cjs` را اجرا کن.

این تغییر دامنهٔ ایمیل‌های ذخیره‌شده در پایگاه‌دادهٔ فعلی را migrate نمی‌کند. برای حفظ دادهٔ موجود، seedها رستوران‌ها و حساب‌های نمونهٔ قبلی را با شناسهٔ کسب‌وکار هم پیدا می‌کنند تا با تغییر دامنه دوباره ساخته نشوند.
