# رفع دانلود ناموفق عامل سخت‌افزار ویندوز

## علامت و علت

در Chrome صفحهٔ GitHub Actions مخزن `asroDesign/menu_online` و لاگ اجرای `v2.0.0` بازبینی شد. Workflow `Windows hardware bridge` در مرحلهٔ `Build NSIS installer` شکست داشت و خلاصهٔ اجرا `Artifacts –` را نشان می‌داد؛ در نتیجه چیزی برای دانلود از این اجرای GitHub وجود نداشت.

خطای Rust در لاگ `error[E0599]: no method named state found for mutable reference &mut tauri::App` در `windows-bridge/src-tauri/src/main.rs` بود. خط setup از `app.state::<AppState>()` استفاده می‌کرد، اما trait `tauri::Manager` در scope نبود. خود کد دستگاه و آپلود artifact هنوز اجرا نشده بود.

## اصلاح

- import از `use tauri::State;` به `use tauri::{Manager, State};` تغییر کرد؛ این trait، متد `state` را برای دسترسی به `AppState` در راه‌اندازی خودکار فراهم می‌کند.
- Workflow موجود در `.github/workflows/windows-bridge.yml` با هر push شامل تغییر `windows-bridge/**` روی Windows runner اجرا می‌شود، `cargo tauri build --bundles nsis` را می‌سازد و فایل Setup را با نام `digital-menu-bridge-windows-x64` به‌مدت ۳۰ روز به artifacts همان run اضافه می‌کند.
- راهنمای `windows-bridge/README.md` مسیر قابل کلیک Actions را دارد و توضیح می‌دهد که از آخرین run موفق شاخهٔ `main` باید artifact ZIP دریافت، extract و فایل `.exe` اجرا شود. run ناموفق اصلاً artifact ندارد.

## اعتبارسنجی و محدودیت

اعتبارسنجی قطعی این پچ، build خود Windows runner در Actions است؛ محیط توسعهٔ macOS جایگزین ساخت NSIS روی Windows نیست. پس از push، نتیجهٔ workflow و موجود بودن artifact باید در همین گزارش و `IMPLEMENTATION_STATUS.md` ثبت شود. نصب و چاپ روی دستگاه واقعی ویندوز در دامنهٔ این رفع خطا نیست.
