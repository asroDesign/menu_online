# ثبت درخواست ضایعات انبار هنگام قطعی اینترنت — ۲۰۲۶-۱۰-۲۶

## رفتار و قرارداد

- تب انبار در Windows برای کالای فعال و دارای ردیابی موجودی، فرم درخواست ضایعات باز می‌کند؛ مقدار، دلیل، توضیح و PIN مدیر محلی لازم است.
- درخواست با UUID، `baseSnapshotId/revision` و مقدار موجودی مورد انتظار در outbox رمز‌شده ذخیره می‌شود. موجودی قابل درخواست از snapshot منهای ضایعات pending و sync‌شدهٔ همان snapshot کم می‌شود. ثبت محلی صریحاً «درخواست» است و snapshot stock را به‌عنوان موجودی قطعی تغییر نمی‌دهد.
- `POST /api/offline-dashboard/inventory` فقط `inventory/waste` را می‌پذیرد. دسترسی terminal و کسب‌وکار، مجوزهای `cashier_pos`, `inventory`, `stock_movements`، انقضای snapshot، تعلق کالا به tenant، active/trackStock، بها و stock مورد انتظار بررسی می‌شوند.
- با تطابق snapshot، `applyStockReceipt` داخل همان تراکنش، stock receipt، گردش ضایعات، کاهش موجودی، سند حسابداری (وقتی بهای کالا مثبت است) و رکورد idempotency در `offline_workspace_commands` را اعمال می‌کند. ترتیب قفل با advisory lock کسب‌وکار پیش از row lock قلم حفظ شده است؛ تعارض موجودی به‌صورت conflict ثبت می‌شود و موجودی منفی پذیرفته نمی‌شود.
- worker فرمان inventory را با Bearer دستگاه به endpoint جدید می‌فرستد. بعد از ثبت یا conflict، snapshot انبار برای همگرایی تازه می‌شود. درخواست‌های این دستگاه در پنل محلی با وضعیت pending/synced/conflict/rejected دیده می‌شوند.

## فایل‌ها

- API: `src/lib/offline-inventory.ts`, `src/app/api/offline-dashboard/inventory/route.ts`
- محلی/Tauri: `windows-bridge/offline-core/src/lib.rs`, `windows-bridge/src-tauri/src/offline.rs`, `windows-bridge/src-tauri/src/main.rs`
- رابط: `windows-bridge/ui/index.html`, `windows-bridge/ui/pos.js`
- قرارداد و وضعیت: راهنمای [پنل آفلاین](../agents/modules/offline-full-dashboard.md)، [صندوق](../agents/modules/offline-pos.md)، [API](../agents/core-pages/api-contract-map.md) و [وضعیت پیاده‌سازی](../../IMPLEMENTATION_STATUS.md)

## محدودیت و بررسی

- فقط ضایعات تک‌قلمی در این vertical slice آفلاین است؛ خرید، مالیات/ارسال فاکتور خرید، بدهی تأمین‌کننده، خروج/مصرف، اصلاح، انتقال، recipe و ثبت کالای جدید هنوز باید پیاده شوند.
- typecheck، ESLint هدفمند API، `node --check windows-bridge/ui/pos.js` و `git diff --check` اجرا شدند. اجرای PostgreSQL، تست یکپارچگی/هم‌زمانی و compile Rust/Tauri انجام نشده؛ محیط `cargo`/`rustc` ندارد.
