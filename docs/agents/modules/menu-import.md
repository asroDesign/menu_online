# ورود گروهی محصولات از CSV

## کاربرد و دسترسی

در صفحه `/dashboard/products` مدیر کسب‌وکار می‌تواند فهرست محصول را از CSV پیش‌نمایش و سپس وارد کند. این کار برای bootstrap کاتالوگ است و فرمت import/export یک‌طرفه دارد. entitlement برابر `menu_import` است؛ UI و هر سه API نیز با `withAuth` و نقش manager محافظت شده‌اند.

## جریان پیاده‌سازی

۱. پنجره ورود فایل CSV یا محتوای متنی را به `/api/menu-import/preview` با `requestKey` یکتا می‌فرستد. فایل محدود به سقف اندازه route است.
۲. `src/lib/menu-import.ts` جداکننده و headerهای فارسی/انگلیسی، ارقام فارسی، قیمت تومان و وضعیت موجودی را parse می‌کند؛ ردیف نامعتبر، نام/دسته خالی، قیمت نامعتبر و identifier تکراری خطا می‌شود.
۳. سرور با کاتالوگ tenant جاری و `externalId` تطبیق می‌دهد و نتیجه + snapshot کاتالوگ را در `menu_import_jobs` ذخیره می‌کند. پاسخ شامل job id، شمار ردیف‌ها، خطاها و تفکیک ایجاد/به‌روزرسانی است.
۴. تأیید کاربر به `/api/menu-import/:id/commit` می‌رود. transaction روی job قفل می‌گیرد، business را محدود می‌کند، idempotency را بررسی می‌کند و snapshot را دوباره محاسبه می‌کند؛ تغییر کاتالوگ بین preview و commit باعث conflict می‌شود و job دیگر کورکورانه اعمال نمی‌شود.

## داده و قرارداد

- `products.external_id` با unique index به‌ازای business شناسه خارجی قابل تکرار را منع می‌کند.
- `menu_import_jobs`: business، request key، digest فایل، ردیف‌های preview، snapshot، status و زمان commit.
- migration: `src/db/migrations/0015_menu_import.sql`; rollback را پیش از اجرا بررسی کن.
- endpointها: `POST /api/menu-import/preview`, `GET /api/menu-import/:id`, `POST /api/menu-import/:id/commit`.
- سرویس‌ها: `src/lib/menu-import.ts`, `src/lib/menu-import-service.ts`; UI: `src/components/product-import-wizard.tsx`.

## مرزها و آزمون

قیمت از فایل فقط دادهٔ صریح مدیر است، نه قیمت order client. این wizard جدول دسته‌ها را import/merge کامل نمی‌کند؛ دسته‌ی واردشده به شناسه tenant-owned موجود resolve می‌شود/در صورت نیاز ایجاد کنترل‌شده در commit. اجرای duplicate با همان request key ایمن است. snapshot stale باید دوباره preview شود.

تست pure parser و قراردادهای snapshot/idempotency در `node --test tests/security-regressions.test.cjs` است. DB isolation/قفل را با integration PostgreSQL تکمیل کن. migration در این نوبت روی DB واقعی اجرا نشده است.
