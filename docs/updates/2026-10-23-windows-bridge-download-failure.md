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
