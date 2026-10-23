# سرویس چاپ MenuPeak برای Windows

این عامل جایگزین جداگانه‌ای برای اپ دسکتاپ `windows-bridge/` است. یک Windows Service واقعی با .NET 8 است؛ پس از یک‌بار نصب روی شروع خودکار تنظیم می‌شود و بعد از راه‌اندازی مجدد Windows بدون بازکردن پنجره یا ورود دوباره به برنامه، چاپ را ادامه می‌دهد.

## نصب برای رستوران

۱. در پنل رستوران، به «تنظیمات ← پرینترها ← دستگاه‌ها» بروید. دستگاه پرینتر را اضافه کنید و برای چاپگر USB، نام صف نصب‌شده در Windows و روش `driver` یا `raw` را انتخاب کنید. برای چاپگر شبکه، IP و پورت را تعیین کنید.
۲. «دانلود تنظیمات» را بزنید و فایل `bridge.config.json` را نگه دارید. کدهای دستگاه داخل این فایل دسترسی عامل به صف چاپ همان دستگاه را می‌دهند؛ فایل را فقط به مسئول سیستم بدهید.
۳. دکمهٔ «نصب سرویس خودکار» را از همان صفحه بزنید، Setup را با دسترسی مدیر اجرا کنید و JSON دانلودشده را در مرحلهٔ اتصال انتخاب کنید.
۴. نصب‌گر فایل را در `%ProgramData%\MenuPeak\PrinterService` ذخیره می‌کند و مجوز پوشه/فایل را به SYSTEM و مدیران Windows محدود می‌کند؛ سپس سرویس `MenuPeakPrinterService` را با حالت Automatic ثبت می‌کند، برای خطای فرایند restart policy می‌گذارد و همان لحظه آن را شروع می‌کند.
۵. وضعیت دستگاه در پنل باید پس از probe واقعی محلی و heartbeat تازه به آنلاین تغییر کند. چاپ آزمایشی پنل از همان صف ابری استفاده می‌کند؛ خروج کاغذ را هم روی دستگاه بررسی کنید.

برای راه‌اندازی مجدد رایانه نیازی به برنامه یا عملیات کاربر نیست. اگر تنظیمات دستگاه عوض شدند، فایل تازه را از پنل بگیرید و Setup را دوباره اجرا کنید؛ سرویس هنگام ارتقا متوقف، با فایل جدید جایگزین و دوباره Automatic/start می‌شود. حذف برنامه نیز سرویس را متوقف و پاک می‌کند.

## محدودهٔ پشتیبانی

- چند پرینتر در یک فایل و اتصال هرکدام به device code مستقل پنل.
- چاپگر شبکه با TCP و درگاه ESC/POS، پیش‌فرض ۹۱۰۰.
- صف نصب‌شدهٔ Windows برای چاپگر USB یا چاپگر شبکه‌ای share شده به Windows. حالت `driver` متن فارسی را با Tahoma و RTL از درایور سیستم چاپ می‌کند؛ حالت `raw` بایت‌های ESC/POS و کدگذاری انتخاب‌شده را مستقیم به spooler می‌دهد.
- سرویس فقط دستگاه‌های `kind=printer` با transportهای `tcp` و `usb` را اجرا می‌کند. ترازو، پیجر و پورت COM را اپ دسکتاپ قبلی پوشش می‌دهد؛ ورودی‌های نامرتبط را اجرا نمی‌کند.
- کارها طبق API فعلی `/api/device/:code/ping` و `/api/device/:code/jobs` تحویل گرفته و نتیجهٔ `printed`/`failed` ثبت می‌شود. کد دستگاه در مسیر API نقش credential دارد.

سرویس Windows با حساب LocalSystem اجرا می‌شود؛ از صف‌های نصب‌شده و قابل دسترس ماشین استفاده کنید. اگر چاپگر فقط برای حساب کاربری فعلی یا یک network share با credential شخصی نصب شده، آن را برای همهٔ کاربران/ماشین نصب کنید. وضعیت `printed` یعنی داده به spooler/درگاه تحویل شده، نه تأیید حسگر خروج کاغذ.

گزارش سرویس در `%ProgramData%\MenuPeak\PrinterService\service.log` نوشته می‌شود. سرویس در `services.msc` با نام **MenuPeak Printer Service** دیده می‌شود و با restart ویندوز خودکار اجرا می‌شود. برای بررسی دستی در PowerShell مدیر:

```powershell
Get-Service MenuPeakPrinterService
Restart-Service MenuPeakPrinterService
```

## ساخت و انتشار

GitHub Actions در `.github/workflows/windows-printer-service.yml` سرویس را برای `win-x64` به شکل self-contained تک‌فایل می‌سازد، با Inno Setup یک installer ایجاد می‌کند و پس از build موفق شاخهٔ `main` آن را در Release `windows-printer-service-latest` منتشر می‌کند. Artifact اجرای workflow نیز ۳۰ روز برای عیب‌یابی باقی می‌ماند.

ساخت محلی روی Windows با .NET 10 SDK و Inno Setup 6 یا 7:

```powershell
dotnet publish windows-service-bridge/MenuPeak.PrinterService.csproj -c Release -r win-x64 --self-contained true -o service-publish
iscc /DSourceDir="$PWD\service-publish" windows-service-bridge/installer.iss
```

چاپ فیزیکی و شروع واقعی Windows Service باید روی Windows با دسترسی مدیر، صف چاپگر نصب‌شده و دستگاه واقعی پذیرش شود؛ این بخش در macOS قابل تأیید نیست.
