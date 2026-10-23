# رفع دانلود ناموفق عامل سخت‌افزار ویندوز

## علامت و علت

در Chrome صفحهٔ GitHub Actions مخزن `asroDesign/menu_online` و لاگ اجراها بازبینی شد. Workflow `Windows hardware bridge` در مرحلهٔ `Build NSIS installer` شکست داشت و خلاصهٔ اجرا `Artifacts –` را نشان می‌داد؛ در نتیجه چیزی برای دانلود از GitHub وجود نداشت.

در اجرای اول، خطای Rust `error[E0599]: no method named state found for mutable reference &mut tauri::App` بود. خط setup از `app.state::<AppState>()` استفاده می‌کرد، اما trait `tauri::Manager` در scope نبود.

پس از اصلاح آن، build از کامپایل Rust عبور کرد و خطای بعدی را آشکار کرد: MSVC به دنبال `winspool.drv.lib` می‌گشت و آن را در Windows SDK پیدا نمی‌کرد. مستندات Microsoft برای WinSpool، نام کتابخانهٔ لینک `WinSpool.lib` و DLL مقصد `Winspool.drv` را مشخص می‌کنند؛ بنابراین این دو نام در ابزارهای Rust/MSVC با هم سازگار نبودند.

## اصلاح

- import از `use tauri::State;` به `use tauri::{Manager, State};` تغییر کرد؛ این trait، متد `state` را برای دسترسی به `AppState` در راه‌اندازی خودکار فراهم می‌کند.
- Workflow پیش از build، `WinSpool.lib` نسخهٔ x64 موجود در Windows SDK runner را پیدا می‌کند و در پوشهٔ موقت با نام مورد انتظار لینک‌گر Rust یعنی `winspool.drv.lib` در دسترس قرار می‌دهد. این همان import library رسمی SDK است؛ فایل کتابخانه یا DLL پروژه دستکاری نشده است.
- Workflow موجود در `.github/workflows/windows-bridge.yml` با هر push شامل تغییر `windows-bridge/**` روی Windows runner اجرا می‌شود، `cargo tauri build --bundles nsis` را می‌سازد و فایل Setup را با نام `digital-menu-bridge-windows-x64` به‌مدت ۳۰ روز به artifacts همان run اضافه می‌کند.
- راهنمای `windows-bridge/README.md` مسیر قابل کلیک Actions را دارد و توضیح می‌دهد که از آخرین run موفق شاخهٔ `main` باید artifact ZIP دریافت، extract و فایل `.exe` اجرا شود. run ناموفق اصلاً artifact ندارد.

## اعتبارسنجی و محدودیت

Microsoft نام کتابخانه و DLL را در [مستندات SetPrinter](https://learn.microsoft.com/en-us/windows/win32/printdocs/setprinter) مشخص کرده است. اعتبارسنجی قطعی پچ، build خود Windows runner در Actions و وجود artifact است؛ محیط توسعهٔ macOS جایگزین ساخت NSIS روی Windows نیست. نصب و چاپ روی دستگاه واقعی ویندوز در دامنهٔ این رفع خطا نیست.

## نتیجهٔ اجرای ویندوز

پس از push اصلاح دوم با commit `b9b1dc1`، اجرای [شمارهٔ ۴ GitHub Actions](https://github.com/asroDesign/menu_online/actions/runs/39982211888) با وضعیت **Success** تمام شد. مرحلهٔ آماده‌سازی `WinSpool`، ساخت NSIS و بارگذاری artifact همگی موفق بودند. فایل `digital-menu-bridge-windows-x64` با حجم ۳٫۲۲ MB در بخش Artifacts همان اجرا موجود است. SHA-256 اعلام‌شده توسط GitHub: `cc2755329036948535f1b095baf1db793ac248b690903b0615201b77580b536a`.

فایل نصب‌گر را از لینک اجرای موفق دریافت کنید؛ برای اجرا آن را از ZIP خارج کرده و Setup را اجرا کنید. دانلود از محیط Chrome به‌عنوان کاربر انجام نشد و نصب/چاپ روی سخت‌افزار واقعی ویندوز نیز بررسی نشده است.

## دانلود مستقیم از دکمهٔ پنل

در بررسی بعدی مشخص شد دکمهٔ پنل به صفحهٔ کلی workflow می‌رفت؛ بنابراین با کلیک، فایل Setup دریافت نمی‌شد و کاربر باید artifact موقت را در GitHub پیدا می‌کرد. لینک دکمه اکنون به فایل ثابت `MenuPeak-Bridge-Setup-x64.exe` در Release اشاره می‌کند.

Workflow پس از build ویندوز، job جداگانه‌ای با `contents: write` و فقط روی `main` اجرا می‌کند. این job artifact را دریافت و در release با tag ثابت `windows-bridge-latest` منتشر می‌کند؛ فایل هم‌نام با `gh release upload --clobber` به‌روز می‌شود. Build job فقط دسترسی read دارد. artifact سی‌روزهٔ Actions نیز برای عیب‌یابی حفظ شده است.

لینک مستقیم مطابق قالب مستند GitHub برای دانلود asset از tag مشخص است: [MenuPeak-Bridge-Setup-x64.exe](https://github.com/asroDesign/menu_online/releases/download/windows-bridge-latest/MenuPeak-Bridge-Setup-x64.exe). این تغییر در checkout آماده است؛ تا زمانی که تغییرات به `main` برسند و workflow با موفقیت اجرا شود، Release جدید ساخته/به‌روزرسانی نمی‌شود. پس از آن دانلود واقعی از مرورگر باید روی لینک Release بررسی شود.

تست قرارداد `tests/windows-bridge-download.test.cjs` ثابت بودن URL دکمه، نام asset منتشرشده، محدودبودن انتشار به main و حفظ artifact عیب‌یابی را کنترل می‌کند. اعتبارسنجی محلی: تست قرارداد، `npm run typecheck`، parse فایل YAML و `git diff --check` موفق شدند. ESLint خطایی نداشت و دو هشدار قبلی دربارهٔ `eslint-disable` غیرلازم در pagerهای همان `hardware.tsx` گزارش کرد. Workflow ویندوز و دانلود مرورگری تا اجرای آن روی GitHub هنوز به‌صورت زنده تأیید نشده‌اند.

## بازبینی Chrome — ۲۰۲۶-۱۰-۲۳

- در صفحهٔ زندهٔ `https://menupeak.ir/dashboard/printers`، دکمه هنوز به صفحهٔ workflow در GitHub Actions می‌رود؛ این نشان می‌دهد نسخهٔ محلیِ لینک مستقیم هنوز روی سایت زنده نیست.
- اجرای موفق Windows hardware bridge شمارهٔ ۶ در Chrome یک artifact دارد و فقط job ساخت قدیمی را اجرا کرده است؛ release پایدار `windows-bridge-latest` ساخته نشده.
- بازکردن `https://github.com/asroDesign/menu_online/releases/tag/windows-bridge-latest` در Chrome واقعاً صفحهٔ 404 GitHub را نشان داد. بنابراین علت 404 لینک Release، منتشرنشدن Release است؛ علت صفحهٔ زنده نیز نسخهٔ قدیمی دکمه است.
- workflow انتشار و لینک مستقیم در commit محلی `c24ca55` آماده‌اند، اما تا push آن به `main` و موفقیت workflow، Release و نسخهٔ تازهٔ دکمه فعال نمی‌شوند.
