# تاریخچه و جزئیات رزرو در حالت آفلاین — ۲۰۲۶-۱۰-۲۶

## نیاز

اپ صندوق ویندوز امکان ثبت درخواست رزرو هنگام قطع اینترنت را داشت، اما کارمند نمی‌توانست فهرست رزروهای قبلی رستوران و جزئیات آن‌ها را ببیند. این تغییر مسیر مشاهدهٔ آفلاین را اضافه می‌کند و درخواست‌های تازهٔ محلی را همچنان از رزرو تأییدشده جدا نگه می‌دارد.

## پیاده‌سازی

- `GET /api/offline-dashboard/snapshots/reservations` آخرین ۱۰۰ رزرو همان کسب‌وکار را با نام و موبایل مهمان، میز، تعداد، زمان و مدت، وضعیت رزرو و پیش‌پرداخت، نوع، توضیح و زمان‌های ایجاد/ویرایش برمی‌گرداند. query با businessId ترمینال جفت‌شده محدود است و join میز هم tenant-scoped است.
- دریافت snapshot به هر دو entitlement `cashier_pos` و `reservations` نیاز دارد. اندازهٔ snapshot حداکثر ۴ مگابایت و TTL آن هفت روز است؛ در صورت بزرگ‌بودن پاسخ خطا داده می‌شود و آخرین cache معتبر دست‌نخورده می‌ماند.
- سرور فقط آخرین revision از snapshot رزرو را برای هر terminal حفظ می‌کند؛ پاک‌کردن نسخه‌های قدیمی در همان تراکنش ساخت/تمدید انجام می‌شود و snapshotهای ماژول‌های دیگر را تغییر نمی‌دهد.
- worker Tauri هر ۱۰ دقیقه نسخه را از endpoint می‌گیرد و در مخزن SQLite رمز‌شده با DPAPI ذخیره می‌کند. وضعیت sync در `offline_status` دیده می‌شود؛ پاسخ 401/403 پس از اتصال، snapshot رزرو را پاک می‌کند.
- تب رزروها فهرست cache شده را با زمان دریافت و وضعیت تازگی نشان می‌دهد. دکمهٔ جزئیات مودالی از اطلاعات همان snapshot باز می‌کند. snapshot منقضی برای مشاهده باقی می‌ماند و عملیاتی برای ثبت تغییر وضعیت رزرو از این فهرست وجود ندارد.
- schema SQLite تغییر نکرده است؛ dataset `reservations` از allowlist موجود snapshot استفاده می‌کند. ثبت درخواست تازه همچنان در outbox مجزا و با همان بازاعتبارسنجی سمت سرور انجام می‌شود.

## فایل‌های تغییرکرده

- `src/lib/offline-dashboard.ts`
- `windows-bridge/src-tauri/src/offline.rs`
- `windows-bridge/src-tauri/src/main.rs`
- `windows-bridge/ui/index.html`
- `windows-bridge/ui/pos.js`
- `windows-bridge/ui/style.css`
- `docs/agents/modules/offline-pos.md`
- `docs/agents/modules/offline-full-dashboard.md`
- `IMPLEMENTATION_STATUS.md`

## محدودیت و اعتبارسنجی

این بخش آخرین ۱۰۰ رزرو را cache می‌کند، نه آرشیو کامل را. ویرایش، تأیید، لغو، دریافت پیش‌پرداخت و پیامک/push آفلاین انجام نمی‌شود. طبق محدودیت کاربر، تست خودکار و اتصال به دیتابیس اجرا نشد. `tsc --noEmit --incremental false`، `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند. `cargo` در محیط موجود نیست، پس compile سمت Rust/Tauri تأیید نشده است. اجرای عادی `npm run typecheck` نتوانست `tsconfig.tsbuildinfo` را به‌علت مجوز نوشتن در checkout ایجاد کند؛ اجرای مستقیم TypeScript بدون incremental همان بررسی کامپایل را با موفقیت انجام داد.
