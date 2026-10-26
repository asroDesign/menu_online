# ثبت حضور آفلاین با تأیید مدیر — ۲۰۲۶-۱۰-۲۶

## رفتار اضافه‌شده

- تب «شیفت کارکنان» در برنامه Windows اکنون برای ورود/خروج روی هر شیفت زمان‌بندی‌شده، PIN مدیر محلی می‌خواهد و فرمان را در outbox رمز‌شدهٔ SQLite ثبت می‌کند. برای خروج، ورود رسمی یا درخواست ورود محلی قبلی لازم است. کنترل بازهٔ ثبت در دستگاه و دوباره در سرور اعمال می‌شود.
- worker ماژول `staff` را به مسیر `POST /api/offline-dashboard/staff/attendance` relay می‌کند. فرمان UUIDدار، tenant/terminal، snapshot برنامه، revision، شیفت، کارمند، اقدام و ساعت ادعاشدهٔ دستگاه دارد. retry همان UUID و payload همان درخواست را برمی‌گرداند؛ استفادهٔ مجدد از UUID با محتوای دیگر رد می‌شود.
- سرور مجوز صندوق/برنامهٔ کارکنان، terminal فعال، snapshot معتبر همان terminal و tenant، نسخه/وضعیت/مالک شیفت، رکورد حضور فعلی، تکراری نبودن درخواست و ترتیب ورود/خروج را بررسی می‌کند. ساعت آینده و ساعت بیرون از بازهٔ شیفت رد می‌شود.
- ورود/خروج دستگاه به `offline_staff_attendance_requests` افزوده می‌شود و تا بازبینی مدیر رسمی نیست. manager queue در `/dashboard/staff-schedule` زمان محلی ادعاشده، زمان دریافت سرور و دستگاه را نشان می‌دهد. رد درخواست علت می‌خواهد؛ تأیید، شیفت/نسخه و ترتیب ثبت را زیر قفل بررسی می‌کند و در transaction هم `staff_attendance_records` و هم `staff_attendance_events` را می‌نویسد. نام تأییدکننده در audit، مدیر وب است.
- snapshot شیفت، وضعیت آخرین درخواست‌های همان terminal را نیز نگه می‌دارد تا پس از همگام‌سازی وضعیت «در انتظار/تأیید/رد» به دستگاه برگردد و درخواست ردشده امکان ثبت دوباره داشته باشد. تا refresh snapshot، وضعیت آفلاین ممکن است هنوز «در انتظار تأیید» بماند.
- تاریخچهٔ سفارش همچنان بدون اتصال باز می‌شود: فروش محلی صفحه‌بندی‌شده و snapshot رمز‌شدهٔ ۱۰۰ سفارش آخر سرور، فهرست و جزئیات فاکتور را از SQLite می‌خوانند؛ جزئیات سفارش تغییر نکرد.

## مدل داده و rollback

- migration افزایشی `0058_offline_staff_attendance_review.sql` جدول tenant/terminal-scoped `offline_staff_attendance_requests` و unique index برای یک درخواست pending به‌ازای هر شیفت/اقدام را اضافه می‌کند. Down migration در صورت وجود رکورد عمداً متوقف می‌شود تا سابقهٔ بازبینی حذف نشود.
- تغییر به `staff_attendance_records` فقط پس از تصمیم مدیر انجام می‌شود؛ زمان دستگاه به‌تنهایی منبع حقوق نیست. ثبت شیفت، مرخصی، غیبت و تعویض شیفت هنوز آفلاین نیست.

## فایل‌های اصلی

- `src/db/schema.ts`, `src/db/migrations/0058_offline_staff_attendance_review.sql`, `src/db/migrations/0058_offline_staff_attendance_review.down.sql`
- `src/lib/offline-staff-attendance.ts`, `src/app/api/offline-dashboard/staff/attendance/route.ts`, `src/lib/offline-dashboard.ts`
- `src/app/api/staff-schedule/attendance/route.ts`, `src/modules/staff-schedule.tsx`
- `windows-bridge/offline-core/src/lib.rs`, `windows-bridge/src-tauri/src/offline.rs`, `windows-bridge/src-tauri/src/main.rs`, `windows-bridge/ui/index.html`, `windows-bridge/ui/pos.js`, `windows-bridge/ui/style.css`
- [راهنمای آفلاین پنل کامل](../agents/modules/offline-full-dashboard.md)، [راهنمای برنامه‌ریزی شیفت](../agents/modules/staff-schedule.md)، [راهنمای صندوق ویندوز](../agents/modules/offline-pos.md)، [وضعیت پیاده‌سازی](../../IMPLEMENTATION_STATUS.md)

## اعتبارسنجی و محدودیت

- `./node_modules/.bin/tsc --noEmit --incremental false`: موفق.
- ESLint روی فایل‌های TypeScript تغییرکرده، `node --check windows-bridge/ui/pos.js` و `git diff --check`: موفق.
- دیتابیس یا migration اجرا نشد؛ تست یکپارچهٔ PostgreSQL اجرا نشد. `cargo` در محیط موجود نیست، بنابراین کامپایل Rust/Tauri و رفتار Windows/DPAPI تأیید نشده است.
- زمان آفلاین از ساعت دستگاه می‌آید و به همین دلیل تا تأیید مدیر وارد حقوق نمی‌شود. manager queue فعلاً حداکثر ۲۰۰ درخواست pending را می‌خواند. رد دسترسی دستگاه در قطعی اینترنت تا زمان اتصال دوباره قابل دریافت نیست.
