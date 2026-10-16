# راهنمای بازسازی Agent — نقشه ماژول‌های پروژه

این پوشه مشخصات رفتاری صفحات و ماژول‌های قابل مشاهده کاربر را برای بازسازی مستقل نگه می‌دارد. هر فایل، محدوده یک ماژول/صفحه را توضیح می‌دهد؛ فایل‌های منبع پیوندخورده منبع حقیقت برای جزئیات نهایی هستند. محتوای READMEها و توضیح‌های داخل کد بخشی از محصول‌اند و جای درخواست کاربر را نمی‌گیرند.

## شروع کار عامل

پیش از شروع یک ماژول، راهنمای [معماری مشترک](architecture.md) را هم بخوان؛ آن سند قرارداد route، نقش، API/CRUD، تقویم، پول و امنیت را توضیح می‌دهد.

1. ابتدا این فایل و سند مربوط به ماژول هدف را بخوان.
2. source component، route registry و API routeهای ذکرشده را بازبینی کن؛ پیش از تغییر، قرارداد واقعی را از TypeScript/route استخراج کن.
3. از `src/components/dashboard-shell.tsx`, `src/components/ui.tsx`, `src/components/resource-page.tsx`, `src/lib/api.ts`, `src/lib/types.ts`, `src/lib/format.ts`, `src/lib/roles.ts` و `src/lib/entitlements.ts` استفاده کن تا ظاهر، API، نقش و entitlement سازگار بمانند.
4. داده tenant را فقط از API مجاز بگیر. کلاینت برای UX است؛ authorization، entitlement، نرخ درخواست و قواعد مالی باید سمت سرور نیز enforce شوند.
5. خروجی را فارسی و RTL بساز؛ قیمت تومان، اعداد فارسی، تاریخ شمسی و timezone تهران را با formatterها و Jalali input مشترک هماهنگ کن. UI باید loading/error/empty/success را پوشش دهد و در موبایل، تبلت و دسکتاپ usable باشد.
6. برای ماژول‌های لیستی از الگوی CRUD و `ResourcePage` استفاده کن هرجا با رفتار فعلی جور است؛ state بهینه‌سازی‌شده نباید از backend diverge کند.
7. پس از بازنویسی، route را با role/feature lock و راه‌های ورود/بازگشت مقایسه کن؛ نوع‌سنجی و lint/build مناسب پروژه را اجرا کن.

## معماری مسیر داشبورد

- `/dashboard` صفحه overview و بر اساس role به خانه مجاز هدایت می‌شود.
- `/dashboard/products`, `/dashboard/categories`, `/dashboard/settings` صفحات ثابت مدیریتی هستند؛ راهنمای هریک در `modules/`.
- سایر صفحات در `src/app/dashboard/[module]/page.tsx` registry شده‌اند. registry احراز هویت، `MODULE_ONLY`, `ROLE_HOME` و entitlement هر slug را بررسی می‌کند. URL slug نام فایل راهنما است.
- `src/modules/*.tsx` قطعات اصلی ماژول هستند؛ بعضی فایل‌ها چند ماژول را export می‌کنند (growth-a, growth-b, finance, inventory, hardware). یک فایل راهنمای جدا برای هر route وجود دارد.

## ماژول‌های داشبورد

| مسیر | راهنما |
|---|---|
| `/dashboard/orders` | [modules/orders.md](modules/orders.md) — سفارش‌ها |
| `/dashboard/suppliers` | [modules/suppliers.md](modules/suppliers.md) — تأمین‌کنندگان |
| `/dashboard/kiosk` | [modules/kiosk.md](modules/kiosk.md) — تنظیم کیوسک |
| `/dashboard/waiter` | [modules/waiter.md](modules/waiter.md) — سفارش‌گیر گارسون |
| `/dashboard/cashier` | [modules/cashier.md](modules/cashier.md) — سفارش‌گیر صندوق |
| `/dashboard/tables` | [modules/tables.md](modules/tables.md) — مدیریت میزها |
| `/dashboard/staff` | [modules/staff.md](modules/staff.md) — کارکنان |
| `/dashboard/customers` | [modules/customers.md](modules/customers.md) — مشتریان |
| `/dashboard/cashback` | [modules/cashback.md](modules/cashback.md) — اعتبار وفاداری |
| `/dashboard/discounts` | [modules/discounts.md](modules/discounts.md) — کدهای تخفیف |
| `/dashboard/reservations` | [modules/reservations.md](modules/reservations.md) — رزرو میز |
| `/dashboard/surveys` | [modules/surveys.md](modules/surveys.md) — نظرسنجی |
| `/dashboard/cross-sell` | [modules/cross-sell.md](modules/cross-sell.md) — پیشنهاد مکمل |
| `/dashboard/sms` | [modules/sms.md](modules/sms.md) — پیامک |
| `/dashboard/bale` | [modules/bale.md](modules/bale.md) — پنل بله (اطلاعات/راهنما) |
| `/dashboard/translations` | [modules/translations.md](modules/translations.md) — ترجمه منو |
| `/dashboard/mini-site` | [modules/mini-site.md](modules/mini-site.md) — ویرایش سایت کوچک |
| `/dashboard/domain` | [modules/domain.md](modules/domain.md) — دامنه اختصاصی |
| `/dashboard/ar` | [modules/ar.md](modules/ar.md) — نمایش سه‌بعدی |
| `/dashboard/ai` | [modules/ai.md](modules/ai.md) — دستیار هوشمند |
| `/dashboard/payments` | [modules/payments.md](modules/payments.md) — پرداخت‌ها |
| `/dashboard/tickets` | [modules/tickets.md](modules/tickets.md) — تیکت پشتیبانی |
| `/dashboard/plan` | [modules/plan.md](modules/plan.md) — تعرفه و اشتراک |
| `/dashboard/accounting` | [modules/accounting.md](modules/accounting.md) — حسابداری دوطرفه |
| `/dashboard/income-expense` | [modules/income-expense.md](modules/income-expense.md) — درآمد و هزینه |
| `/dashboard/reports` | [modules/reports.md](modules/reports.md) — گزارش فروش |
| `/dashboard/profit-loss` | [modules/profit-loss.md](modules/profit-loss.md) — سود و زیان |
| `/dashboard/bank` | [modules/bank.md](modules/bank.md) — گزارش بانک و صندوق |
| `/dashboard/assets` | [modules/assets.md](modules/assets.md) — دارایی‌ها |
| `/dashboard/inventory` | [modules/inventory.md](modules/inventory.md) — انبارداری |
| `/dashboard/stock-movements` | [modules/stock-movements.md](modules/stock-movements.md) — گردش و فاکتور انبار |
| `/dashboard/stock-control` | [modules/stock-control.md](modules/stock-control.md) — کنترل موجودی |
| `/dashboard/recipes` | [modules/recipes.md](modules/recipes.md) — فرمول ساخت |
| `/dashboard/costing` | [modules/costing.md](modules/costing.md) — بهای تمام‌شده |
| `/dashboard/couriers` | [modules/couriers.md](modules/couriers.md) — پیک‌ها |
| `/dashboard/zones` | [modules/zones.md](modules/zones.md) — مناطق ارسال |
| `/dashboard/devices` | [modules/devices.md](modules/devices.md) — تبلت و POS |
| `/dashboard/printers` | [modules/printers.md](modules/printers.md) — چاپگرها |
| `/dashboard/caller-id` | [modules/caller-id.md](modules/caller-id.md) — شناسه تماس |
| `/dashboard/scale` | [modules/scale.md](modules/scale.md) — ترازو |
| `/dashboard/voice-pager` | [modules/voice-pager.md](modules/voice-pager.md) — اعلام صوتی سفارش |
| `/dashboard/food-court-pager` | [modules/food-court-pager.md](modules/food-court-pager.md) — پیجر فودکورت |
| `/dashboard` | [modules/dashboard-overview.md](modules/dashboard-overview.md) — داشبورد اصلی |
| `/dashboard/products` | [modules/products.md](modules/products.md) — محصولات منو |
| `/dashboard/categories` | [modules/categories.md](modules/categories.md) — دسته‌بندی منو |
| `/dashboard/settings` | [modules/settings.md](modules/settings.md) — تنظیمات کسب‌وکار |

## صفحه اصلی و صفحات عملیاتی

راهنمای مستقل صفحه اصلی بازاریابی/دامنه اختصاصی: [home-page.md](home-page.md). راهنمای جریان‌های عمومی، اپ‌های عملیاتی و صفحات سامانه در `core-pages/` است:

| راهنما | کارکرد |
|---|---|
| [core-pages/marketing-home.md](core-pages/marketing-home.md) | صفحه اصلی و لندینگ |
| [core-pages/public-menu.md](core-pages/public-menu.md) | منوی عمومی و ثبت سفارش |
| [core-pages/public-reservation.md](core-pages/public-reservation.md) | رزرو میز سمت مشتری |
| [core-pages/kiosk-client.md](core-pages/kiosk-client.md) | کیوسک مشتری |
| [core-pages/kitchen-display.md](core-pages/kitchen-display.md) | نمایشگر آشپزخانه |
| [core-pages/courier-app.md](core-pages/courier-app.md) | اپلیکیشن پیک |
| [core-pages/survey-response.md](core-pages/survey-response.md) | فرم عمومی نظرسنجی |
| [core-pages/mini-site-public.md](core-pages/mini-site-public.md) | سایت کوچک عمومی |
| [core-pages/restaurant-directory.md](core-pages/restaurant-directory.md) | فهرست رستوران‌ها |
| [core-pages/auth-pages.md](core-pages/auth-pages.md) | ورود و ثبت‌نام |
| [core-pages/platform-admin.md](core-pages/platform-admin.md) | پنل مدیر سامانه |
| [core-pages/payment-result.md](core-pages/payment-result.md) | نتیجه پرداخت |
| [core-pages/print-views.md](core-pages/print-views.md) | رسیدها و اسناد چاپی |
| [core-pages/error-pages.md](core-pages/error-pages.md) | خطا و ۴۰۴ |
| [core-pages/api-contract-map.md](core-pages/api-contract-map.md) | نقشه APIها و guardها |

## نقشه API برای عامل

قراردادهای مشترک route، tenant، نقش/feature، شکل endpointهای dynamic و مسیرهای عمومی/حسابداری/مدیر سامانه در [نقشه قراردادهای API](core-pages/api-contract-map.md) آمده است. آن را همراه سند feature بخوان؛ schema نهایی همچنان route TypeScript است.

## قراردادهای cross-cutting

- APIهای متداول: `/api/orders`, `/api/products`, `/api/categories`, `/api/business`, `/api/stats`, `/api/r/:resource`, `/api/acc/*`, `/api/public/*`, `/api/device/*`, `/api/admin/*`. هر route سند schema مستقل در `src/app/api` دارد.
- چند tenant بودن، نقش‌ها و تعرفه‌ها جزو منطق اصلی‌اند؛ کامپوننت را از route جدا نکن بدون حفظ guard.
- خطاهای API به toast/error state قابل فهم تبدیل شوند؛ صفحه‌های دارای polling هنگام unmount متوقف و هنگام hidden بودن صفحه بی‌جهت تکرار نشوند.
- پول و تاریخ در UI locale-aware هستند؛ تاریخ‌های تنظیمی/مالی برای کاربر ایران باید شمسی باشند، اما قرارداد ذخیره‌سازی API را تغییر نده.
- داده متنی و JSONهای setting را در JSX امن و escaping شده نمایش بده. برای حذف/بستن سال/پرداخت، confirmation و state در حال انجام داشته باش.

## مواردی که باید مطابق کد فعلی تفسیر شوند

- `/dashboard/bale` در نسخه فعلی فرم ارسال کمپین نیست؛ صفحه توضیح می‌دهد ارسال بله هنوز متصل نیست و به پنل پیامک هدایت می‌کند.
- در `/dashboard/payments` فقط تنظیم درگاه زرین‌پال و فهرست تراکنش‌ها فعال‌اند؛ اسنپ‌پی/دیجی‌پی در UI فعلی توضیح اتصال آتی دارند و برای مشتری ارائه نمی‌شوند.
- `/dashboard/accounting` همان دفتر double-entry در `src/modules/accounting.tsx` است؛ `/dashboard/income-expense` دفتر ساده تراکنش‌ها در `src/modules/finance.tsx` است و این دو جریان را با هم اشتباه نگیر.

## پوشش مستندات

فهرست بالا همه ۴۲ slug ثبت‌شده در `MODULES` و چهار صفحه ثابت داشبورد را پوشش می‌دهد. `home-page.md` صفحه `/` و `core-pages/` مسیرهای عمومی/سیستمی اصلی و نقشه قراردادهای API را مستند می‌کند. مجموعه فعلی ۴۲ ماژول registry، چهار صفحه ثابت داشبورد، صفحه اصلی، ۱۴ صفحه عمومی/سیستمی، معماری مشترک و نقشه قراردادهای API را پوشش می‌دهد. برای هر resource API سند جداگانه نمی‌سازد؛ schema نهایی در route TypeScript است.
