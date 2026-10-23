# عامل چاپگر Windows با اجرای خودکار سرویس

## هدف

در کنار اپ دسکتاپ Tauri، گزینه‌ای ارائه شود که پس از یک‌بار نصب، بدون بازکردن برنامه پس از reboot در Windows فعال بماند و صف چاپ پنل را پردازش کند.

## تغییرات

- عامل دوم با C# و .NET 10 Worker Service ساخته شد و با `UseWindowsService` به Windows Service بومی متصل است.
- نصب‌گر Inno Setup از کاربر فایل `bridge.config.json` همان کسب‌وکار را می‌گیرد، آن را در ProgramData قرار می‌دهد، سرویس Automatic ایجاد/به‌روزرسانی می‌کند، recovery برای restart بعد از crash تنظیم می‌کند و سرویس را شروع می‌کند.
- عامل از APIهای فعلی device استفاده می‌کند: probe واقعی TCP/صف Windows قبل از heartbeat، گرفتن صف job، چاپ و ثبت نتیجه. چند پرینتر شبکه و صف‌های spooler را هم‌زمان پردازش می‌کند.
- چاپ شبکه از TCP/ESC-POS استفاده می‌کند. چاپگر نصب‌شدهٔ Windows از driver/GDI برای متن فارسی RTL یا از RAW/ESC-POS پشتیبانی می‌کند.
- تنظیمات چاپگر صفحهٔ پنل لینک نصب‌گر سرویس را در کنار اپ Tauri نشان می‌دهد و تفاوت آن‌ها را توضیح می‌دهد.
- عامل سرویس فقط printerهای TCP یا نصب‌شدهٔ Windows را پوشش می‌دهد؛ COM، ترازو و پیجر در عامل دسکتاپ قبلی می‌مانند. مستند فنی/عملیاتی در `windows-service-bridge/README.md` ثبت شد.

## فایل‌ها

- `windows-service-bridge/Program.cs`
- `windows-service-bridge/PrinterWorker.cs`
- `windows-service-bridge/MenuPeak.PrinterService.csproj`
- `windows-service-bridge/installer.iss`
- `.github/workflows/windows-printer-service.yml`
- `src/modules/hardware.tsx`
- `docs/agents/modules/devices.md`
- `tests/windows-printer-service-bridge.test.cjs`

## اعتبارسنجی و محدودیت

- `node --test tests/windows-printer-service-bridge.test.cjs`: پنج آزمون موفق.
- `node --test tests/*.test.cjs`: از ۱۶۹ آزمون، ۱۶۲ موفق و ۷ تست وابسته به PostgreSQL اجرا نشدند.
- `npx tsc --noEmit --incremental false`، parse فایل workflow با Ruby YAML، و `git diff --check`: موفق.
- ESLint فایل‌های تغییرکرده خطا نداشت؛ دو هشدار قبلی دربارهٔ `eslint-disable` بی‌مصرف در `src/modules/hardware.tsx` باقی است.
- این محیط macOS فقط .NET SDK 7 دارد؛ build .NET 10 و Inno Setup محلی اجرا نشد. خروجی نهایی Windows باید در GitHub Actions بررسی شود. نصب واقعی سرویس و چاپ روی پرینتر نیز نیازمند Windows و دستگاه فیزیکی است.
