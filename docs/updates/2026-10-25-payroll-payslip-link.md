# رفع لینک نامعتبر فیش حقوق — ۲۰۲۶-۱۰-۲۵

## علت

لینک چاپ در جدول حقوق از `run.id` استفاده می‌کند. پاسخ `GET/POST /api/payroll/runs` جزئیات لیست را به شکل `{ run: { id, ... }, items, total, ... }` برمی‌گرداند، در حالی که کامپوننت داشبورد پاسخ را به شکل تخت `Run` می‌خواند. بنابراین شناسه در state پنل `undefined` می‌شد و لینک چاپ به `/dashboard/payroll/payslip/undefined/:staffId` می‌رسید. همین ناسازگاری باعث می‌شد وضعیت، اقلام و جمع‌ها هم از ریشه قابل دسترسی نباشند.

## تغییر انجام‌شده

- تابع `flattenPayrollRun` در `src/lib/payroll-run-response.ts` فیلدهای run را کنار اقلام، جمع‌ها، تسویه‌ها و رویدادها در ریشه قرار می‌دهد.
- پاسخ ایجاد، خواندن، بازمحاسبه و ویرایش لیست حقوق با همین قرارداد تخت تولید می‌شود. پاسخ‌های تأیید و تسویه نیز `data` تخت دارند؛ محاسبات داخلی export همچنان از شکل داخلی `getRun` استفاده می‌کند.
- جدول چاپ کارمند بدون تغییر از شناسهٔ معتبر `run.id` و `item.staffId` آدرس `/dashboard/payroll/payslip/:runId/:staffId` را می‌سازد.
- تست رگرسیون بررسی می‌کند شناسه بعد از flatten در ریشه باشد و route جزئیات پاسخ تو‌در‌تو را منتشر نکند.

## فایل‌ها

- `src/lib/payroll-run-response.ts`
- `src/app/api/payroll/[...path]/route.ts`
- `tests/payroll-core.test.cjs`
- `docs/agents/modules/payroll.md`
- `IMPLEMENTATION_STATUS.md`

## اعتبارسنجی

`node --test tests/payroll-core.test.cjs` با ۹ تست موفق، از جمله تست قرارداد شناسهٔ ریشه، تمام شد. `npx tsc --noEmit --incremental false`، ESLint هدفمند دو فایل TypeScript، و `git diff --check` نیز موفق شدند. npm دربارهٔ اجرای npm 11 با Node 18 هشدار سازگاری چاپ کرد، اما دستورهای typecheck و lint با کد خروج صفر تمام شدند. مرورگر، دیتابیس زنده و چاپگر واقعی برای این اصلاح استفاده نشدند؛ migration جدیدی لازم نیست.
