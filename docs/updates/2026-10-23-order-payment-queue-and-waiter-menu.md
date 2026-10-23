# اصلاح فهرست جایزه، وضعیت پرداخت سفارش و درخواست گارسون

تاریخ: ۲۰۲۶-۱۰-۲۳

## هدف

سه ایراد گزارش‌شده را برطرف می‌کند: محصول‌های آیتم رایگان در تنظیم جایزهٔ وفاداری بارگیری نمی‌شدند، فهرست سفارش پرداخت را واضح نمی‌کرد و مشتری منوی عمومی دکمهٔ درخواست گارسون را نمی‌دید.

## تغییرات انجام‌شده

### آیتم رایگان در جایزهٔ وفاداری

`BarcodeRewardSettings` در `src/modules/growth-a.tsx` قبلاً `GET /api/r/products` را فراخوانی می‌کرد؛ چنین resourceای در registry وجود ندارد و فهرست خالی می‌ماند. اکنون از `GET /api/products` استفاده می‌کند که فهرست محصولات کسب‌وکار جاری را با شکل `{ items }` برمی‌گرداند. کنترل سمت سرور هنگام ساخت/ویرایش کمپین همچنان مالکیت tenant، موجودی، قیمت مثبت و تعدادی‌بودن محصول هدیه را بررسی می‌کند؛ تغییر فقط endpoint انتخاب محصول را به مسیر واقعی متصل می‌کند.

### وضعیت پرداخت و صف پرداخت‌نشده

- کارت و پنجرهٔ جزئیات هر سفارش، وضعیت پرداخت و روش دریافت وجه را با برچسب فارسی نشان می‌دهد.
- تب مستقل «پرداخت‌نشده» سفارش‌های `paymentStatus=unpaid` را فیلتر می‌کند؛ سفارش لغوشده و حذف‌شده در آن قرار نمی‌گیرد.
- کنار فهرست اصلی یک صف زنده از ۱۲ سفارش پرداخت‌نشدهٔ اخیر نمایش داده می‌شود. در دسکتاپ ستون کناری است و در نمایشگر کوچک بالای فهرست می‌آید. شمارش و لینک «نمایش همه» دارد؛ داده همچنان از همان فهرست tenant-scoped سفارش‌ها می‌آید.
- دکمهٔ ارسال مبلغ به کارتخوان بعد از پرداخت موفق نمایش داده نمی‌شود. برای سفارش کارت‌به‌کارتِ تسویه‌نشده، تأیید دریافت وجه با `PATCH /api/orders/:id { confirmPayment: true }` انجام می‌شود؛ API فقط مدیر/صندوق را مجاز می‌کند، سفارش لغوشده یا روش پرداخت نامتناسب را رد می‌کند و تسویه را از `settleOrder` مشترک عبور می‌دهد. تکرار درخواست در `settleOrder` آثار مالی را دوباره نمی‌سازد.
- اولین تسویهٔ موفق برای سفارش `awaiting_payment`، `pending` یا `preparing` وضعیت کار را روی `preparing` می‌گذارد و job چاپ آشپزخانه را در همان transaction صف می‌کند. پرداخت سفارش آماده/سرو‌شده آن را به مرحلهٔ قبلی برنمی‌گرداند. فروش نسیه به‌عنوان بدهی باقی می‌ماند و وضعیت پرداخت‌شده تلقی نمی‌شود.

### دکمهٔ درخواست گارسون در منوی عمومی

- شرط نمایش CTA شناور دیگر به وجود میز آزاد وابسته نیست؛ با entitlement فعال (`waiter_call`) در منوی واقعی مشتری دیده می‌شود. preview فقط‌خواندنی همچنان CTA را پنهان می‌کند.
- میزهای `available`، `occupied` و `reserved` در مودال قابل انتخاب‌اند؛ این باعث می‌شود مشتری پشت میزی که اکنون اشغال یا رزرو شده درخواست بفرستد.
- اگر هیچ میز عملیاتی در منو موجود نباشد، CTA باز هم قابل مشاهده است اما مودال توضیح می‌دهد که میزها باید در پنل ثبت/فعال شوند. API عمومی نیز میز tenant دیگر یا میز با وضعیت نامعتبر را رد می‌کند.

## فایل‌های درگیر

- UI و منطق: `src/modules/growth-a.tsx`, `src/modules/orders.tsx`, `src/components/menu-client.tsx`, `src/lib/order-workflow-core.ts`, `src/lib/orders.ts`
- API: `src/app/api/orders/[id]/route.ts`, `src/app/api/public/[slug]/service-requests/route.ts`
- تست‌ها: `tests/order-payment-flow.test.cjs`, `tests/customer-reward-barcodes.test.cjs`, `tests/security-regressions.test.cjs`
- راهنمای بازسازی: `docs/agents/modules/customers.md`, `docs/agents/modules/orders.md`, `docs/agents/core-pages/public-menu.md`; دفتر وضعیت: `IMPLEMENTATION_STATUS.md`

Migration دیتابیس لازم نیست. هیچ پرداخت واقعی یا پیامکی ارسال نشده است.

## اعتبارسنجی

- آزمون هدفمند: `node --test tests/order-payment-flow.test.cjs tests/customer-reward-barcodes.test.cjs tests/security-regressions.test.cjs`؛ ۶۴ موفق، صفر شکست.
- کل تست‌ها: `node --test tests/*.test.cjs`؛ ۱۴۶ کل، ۱۳۹ موفق، ۷ تست نیازمند PostgreSQL skip، صفر شکست.
- ESLint هدفمند روی هفت فایل TS/TSX تغییرکرده موفق شد.
- `npx tsc --noEmit --incremental false` موفق شد. `npm run typecheck` با incremental cache روی `.next/types/validator.ts:25` خطای ناسازگاری `Route`/`LayoutRoutes` از Next تولید کرد؛ build نیز بدون خطای TypeScript تکمیل شد. فایل generated برای رفع دستی این خطا تغییر داده نشد.
- `npm run build` موفق شد. دو هشدار CSS موجود DaisyUI دربارهٔ `@property --radialprogress` و `@property --aura-angle` باقی است.
- `git diff --check` موفق شد.

تست‌های source-based، جای آزمون transaction واقعی روی PostgreSQL را نمی‌گیرند. تست یکپارچهٔ database در این نوبت اجرا نشده است.

## محدودیت انتشار

تغییرها در سورس و Git ثبت می‌شوند. نمایش آن‌ها در دامنهٔ عمومی پس از اجرای فرایند deploy پروژه رخ می‌دهد؛ این تغییر محلی به‌تنهایی سایت production را تغییر نمی‌دهد.
