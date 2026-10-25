# هم‌رنگ‌سازی صفحه‌های خطای ۴۰۴ و ۵۰۰ با برند سامانه — ۲۰۲۶-۱۰-۲۵

## تغییر انجام‌شده

- پوستهٔ مشترک ۴۰۴ و ۵۰۰ در `SystemErrorScreen` رنگ سامانه را از `usePlatformBranding` می‌گیرد و `brandThemeStyle` را روی صفحه اعمال می‌کند.
- قاب وضعیت، بافت شبکه‌ای، دکمه‌های اصلی/فرعی، نشانه‌ها و کارت‌های دسترسی سریع از توکن‌های داینامیک `primary` و `brand` استفاده می‌کنند؛ رنگ ثابت سبز از این پوسته حذف شد.
- صفحهٔ `global-error.tsx` که هنگام شکست layout اصلی نمایش داده می‌شود نیز برند عمومی را از `/api/public/branding` می‌خواند؛ مقدار رنگ از allowlist hex اعتبارسنجی می‌شود و در صورت خطای دریافت، رنگ پیش‌فرض آبی استفاده می‌شود.
- صفحهٔ مستقل `/502` در این تغییر دست‌کاری نشده است؛ دامنهٔ درخواست ۴۰۴ و ۵۰۰ بود.

## فایل‌ها

- `src/components/system-error-screen.tsx`
- `src/app/global-error.tsx`
- `docs/agents/core-pages/error-pages.md`
- `IMPLEMENTATION_STATUS.md`

## اعتبارسنجی

`npx tsc --noEmit --incremental false`، ESLint هدفمند `system-error-screen.tsx` و `global-error.tsx` و `git diff --check` موفق شدند. npm هشدار می‌دهد نسخهٔ نصب‌شدهٔ npm 11 اجرای Node 18.17.1 را پشتیبانی نمی‌کند، ولی هر سه دستور با کد خروج صفر تمام شدند. تست بصری مرورگر انجام نشد و `/502` عمداً خارج از محدودهٔ این تغییر باقی ماند.
