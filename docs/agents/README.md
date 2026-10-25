# راهنمای بازسازی Agent — نقشه ماژول‌های پروژه

این پوشه مشخصات رفتاری صفحات و ماژول‌های قابل مشاهده کاربر را برای بازسازی مستقل نگه می‌دارد. هر فایل، محدوده یک ماژول/صفحه را توضیح می‌دهد؛ فایل‌های منبع پیوندخورده منبع حقیقت برای جزئیات نهایی هستند. محتوای READMEها و توضیح‌های داخل کد بخشی از محصول‌اند و جای درخواست کاربر را نمی‌گیرند.

برای تطبیق با پوشه منبع و وضعیت دقیق قابلیت‌های انجام‌شده/ناقص، ابتدا [دفتر وضعیت پیاده‌سازی در ریشه پروژه](../../IMPLEMENTATION_STATUS.md) را بخوان. این دفتر و راهنماهای مرتبط باید با هر تغییر کد به‌روز شوند.

برای دید کلی قابلیت‌ها و کاربردهای ماژول‌های موجود، ابتدا [کاتالوگ قابلیت‌ها و کاربرد ماژول‌ها](module-capabilities.md) را ببین؛ سپس راهنمای تفصیلی ماژول مربوط را بخوان.

برای سابقهٔ رفع اشکال‌های فنی state/lint و نتایج بررسی‌های اجراشده، [راهنمای دیباگ](debugging.md) را ببین.

سیستم طراحی مشترک، tokenهای رنگ سازمانی، منبع رنگ پیش‌فرض و جداسازی رنگ رستوران/سامانه در [راهنمای تم و رنگ سازمانی](modules/brand-theme.md) ثبت شده است. برای بازتولید همین ظاهر در ماژول تازه، آن راهنما و `src/components/ui.tsx` را مبنا قرار بده.

رفتار ورود نخست مالک رستوران، ذخیرهٔ وضعیت پایان/رد راهنما و ساخت گام‌ها بر مبنای entitlementهای پلن در [راهنمای تور راه‌اندازی](modules/onboarding-tour.md) مستند شده است.

## قاعده ثبت تغییرات

هر تغییر کد باید در همان کار با به‌روزرسانی Markdown مرتبط ثبت شود. در راهنمای مربوط، رفتار تغییرکرده، نقش و کاربرد ماژول، فایل‌ها و API/داده‌های درگیر، کنترل دسترسی و آزمون‌های اجراشده را دقیق بنویس. اگر ماژول تازه‌ای اضافه می‌شود، راهنمای بازسازی مستقل بساز، قابلیت و کاربردش را در [کاتالوگ ماژول‌ها](module-capabilities.md) و فهرست مسیرهای همین README ثبت کن و نقش، entitlement، API و داده‌اش را توضیح بده. برای تغییر مشترک معماری، [راهنمای معماری](architecture.md) و در صورت نیاز ADR/تصمیم را نیز به‌روز کن. فقط قابلیت‌هایی را مستند کن که با کد فعلی یا آزمون تأیید شده‌اند؛ محدودیت‌ها و کارهای اجرا‌نشده را روشن بنویس.

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
- `/dashboard/products`, `/dashboard/products/create`, `/dashboard/categories`, `/dashboard/settings` صفحات ثابت مدیریتی هستند؛ راهنمای هریک در `modules/`.
- سایر صفحات در `src/app/dashboard/[module]/page.tsx` registry شده‌اند. registry احراز هویت، `MODULE_ONLY`, `ROLE_HOME` و entitlement هر slug را بررسی می‌کند. URL slug نام فایل راهنما است.
- `src/modules/*.tsx` قطعات اصلی ماژول هستند؛ بعضی فایل‌ها چند ماژول را export می‌کنند (growth-a, growth-b, finance, inventory, hardware). یک فایل راهنمای جدا برای هر route وجود دارد.

## ماژول‌های داشبورد

### قابلیت مشترک هدر و اعلان‌های پنل

- [مرکز اعلان پنل رستوران](modules/panel-notifications.md) — زنگ و toast پایینِ چپ با Aura DaisyUI و حداقل ۵ ثانیه نمایش برای رویدادهای مجاز سفارش/رزرو/گارسون/چک/انبار، صدای هشدار foreground، Web Push opt-in گارسون با Service Worker، VAPID و migration `0052`.

| مسیر | راهنما |
|---|---|
| `/dashboard/orders` | [modules/orders.md](modules/orders.md) — سفارش‌ها، آرشیو رسید و تسویهٔ تفکیکی نقد/بانک/POS/دریافتنی |
| `/dashboard/suppliers` | [modules/suppliers.md](modules/suppliers.md) — تأمین‌کنندگان |
| `/dashboard/kiosk` | [modules/kiosk.md](modules/kiosk.md) — تنظیم کیوسک |
| `/dashboard/waiter` | [modules/waiter.md](modules/waiter.md) — سفارش‌گیر گارسون، دریافت و رسیدگی درخواست میز مشتری؛ میان‌بر شناور ثبت فاکتور در صفحات دیگر داشبورد |
| `/dashboard/cashier` | [modules/cashier.md](modules/cashier.md) — سفارش‌گیر صندوق و اعلان مشترک درخواست میز؛ میان‌بر شناور ثبت فاکتور در صفحات دیگر داشبورد |
| `/dashboard/tables` | [modules/tables.md](modules/tables.md) — مدیریت میزها |
| `/dashboard/staff` | [modules/staff.md](modules/staff.md) — کارمندان و پروفایل استخدامی/حقوقی با تب‌های اطلاعات پایه، قرارداد/حقوق و بیمه/مالیات/بانک |
| `/dashboard/payroll` | [modules/payroll.md](modules/payroll.md) — لیست حقوق ماهانه، fallback حداقل مزد سالانه برای حقوق ثبت‌نشده، مزایا و پایه سنوات بر اساس سابقه، کارکرد، مرخصی، تشویقی/جریمه، فیش چاپی، CSV کمکی بیمه/مالیات و ثبت تعهد/پرداخت در حسابداری |
| `/dashboard/customers` | [modules/customers.md](modules/customers.md) — CRM، تحلیل خرید/معرفی، دفتر امتیاز و کیف پول، صف تأیید نظر، تنظیم پاداش معرفی و جایزهٔ QR قابل چاپ با claim احرازشده، انقضا و مصرف یک‌باره در سفارش بعدی |
| `/dashboard/customer-feedback` | [modules/customer-feedback.md](modules/customer-feedback.md) — صندوق tenant-scoped پیشنهادها و شکایت‌های ثبت‌شده از پروفایل OTP منوی آنلاین |
| `/dashboard/loyalty-wheel` | [modules/loyalty-wheel.md](modules/loyalty-wheel.md) — پیکربندی گردونهٔ منوی مشتری، وزن احتمال، مبلغ/کد تخفیف/چند محصول رایگان/پوچ/پیام، cooldown و مصرف OTP-bound یک‌باره در سفارش بعدی |
| `/dashboard/cashback` | [modules/cashback.md](modules/cashback.md) — اعتبار وفاداری |
| `/dashboard/discounts` | [modules/discounts.md](modules/discounts.md) — کدهای تخفیف |
| `/dashboard/reservations` | [modules/reservations.md](modules/reservations.md) — رزرو میز |
| `/dashboard/surveys` | [modules/surveys.md](modules/surveys.md) — نظرسنجی |
| `/dashboard/cross-sell` | [modules/cross-sell.md](modules/cross-sell.md) — پیشنهاد مکمل |
| `/dashboard/sms` | [modules/sms.md](modules/sms.md) و [modules/sms-retention.md](modules/sms-retention.md) — پیامک و بازگشت مشتری |
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
| `/dashboard/receivables` | [modules/receivables.md](modules/receivables.md) — دفتر مطالبات و دریافتنی مشتریان |
| `/dashboard/income-expense` | [modules/income-expense.md](modules/income-expense.md) — درآمد و هزینه |
| `/dashboard/cheques` | [modules/cheques.md](modules/cheques.md) — دفتر چک، ذی‌نفعان، جزئیات برگه، سند حسابداری و یادآوری سررسید پنل/SMS |
| `/dashboard/reports` | [modules/reports.md](modules/reports.md) — گزارش فروش، بازهٔ شمسی و CSV |
| `/dashboard/profit-loss` | [modules/profit-loss.md](modules/profit-loss.md) — سود و زیان |
| `/dashboard/bank` | [modules/bank.md](modules/bank.md) — گزارش بانک و صندوق |
| `/dashboard/assets` | [modules/assets.md](modules/assets.md) — دارایی‌ها |
| `/dashboard/inventory`, `/dashboard/inventory/add` | [modules/inventory.md](modules/inventory.md) — موجودی، کمبود/نقطه سفارش، هشدار انقضای گذشته/هفت روز آینده در اعلان و toast پنل، گردش سریع و فرم چهارمرحله‌ای افزودن کالا با SKU، تاریخ شمسی، واحد خرید/مصرف، افتتاحیهٔ حسابداری و پیش‌نمایش ریسپانسیو |
| `/dashboard/inventory/waste` | [modules/inventory.md](modules/inventory.md) — ثبت اختصاصی چندقلمی ضایعات، دلیل، فیلتر شمسی، تحلیل روند/هزینه، چاپ گزارش و خروجی CSV |
| `/dashboard/stock-movements` | [modules/stock-movements.md](modules/stock-movements.md) — گردش و فاکتور انبار |
| `/dashboard/stock-control` | [modules/stock-control.md](modules/stock-control.md) — کنترل موجودی |
| `/dashboard/recipes` | [modules/recipes.md](modules/recipes.md) — فرمول ساخت |
| `/dashboard/pricing` و `/dashboard/costing` | [modules/costing.md](modules/costing.md) — قیمت‌گذاری هوشمند؛ مسیر قدیمی costing حفظ شده است |
| `/dashboard/couriers` | [modules/couriers.md](modules/couriers.md) — پیک‌ها |
| `/dashboard/zones` | [modules/zones.md](modules/zones.md) — مناطق ارسال |
| `/dashboard/devices` | [modules/devices.md](modules/devices.md) — تبلت و POS |
| `/dashboard/printers` | [modules/printers.md](modules/printers.md) — چاپگرها |
| `/dashboard/settings/printers/devices` | [modules/printers.md](modules/printers.md) — اتصال دستگاه‌ها، Agent ویندوزی و تنظیم سربرگ/پابرگ فیش |
| `/dashboard/settings/printers/workflows` | [modules/printers.md](modules/printers.md) — سیاست چاپ خودکار ثبت، تسویه و تکمیل سفارش |
| `/dashboard/settings/printers/categories` | [modules/printers.md](modules/printers.md) — تفکیک چاپگرها بر اساس دستهٔ محصول |
| `/dashboard/caller-id` | [modules/caller-id.md](modules/caller-id.md) — شناسه تماس |
| `/dashboard/scale` | [modules/scale.md](modules/scale.md) — ترازو |
| `/dashboard/voice-pager` | [modules/voice-pager.md](modules/voice-pager.md) — اعلام صوتی سفارش |
| `/dashboard/food-court-pager` | [modules/food-court-pager.md](modules/food-court-pager.md) — پیجر فودکورت |
| `/dashboard` | [modules/dashboard-overview.md](modules/dashboard-overview.md) — داشبورد اصلی، نمودار فروش و روند روزانه بازدید منو |
| `/dashboard/products` | [modules/products.md](modules/products.md) — فهرست محصولات؛ دکمهٔ ویرایش به فرم کامل مشترک create/edit می‌رود |
| `/dashboard/products/create` | [modules/products.md](modules/products.md) — فرم یکپارچهٔ ساخت/ویرایش، قیمت/تنوع/افزودنی، تصویر/ویدیوی محصول، recipe و آنالیز مواد؛ منوی مشتری جزئیات و نظرهای تأییدشده را نشان می‌دهد |
| `/dashboard/categories` | [modules/categories.md](modules/categories.md) — جدول دسته‌ها، جستجو، ایجاد گروهی، تصویر/والد/توضیحات و ترتیب نمایش |
| `/dashboard/settings` | [modules/settings.md](modules/settings.md) — مرکز پنج‌گروهی تنظیمات کافه، هویت، ساعت/منو، بنر، سفارش/تسویه، بازخورد مشتریان و امنیت |
| راهنمای راه‌اندازی | [modules/onboarding-tour.md](modules/onboarding-tour.md) — تور نخستین ورود مالک و گام‌های متناسب با پلن |

## صفحه اصلی و صفحات عملیاتی

راهنمای مستقل صفحه اصلی بازاریابی/دامنه اختصاصی: [home-page.md](home-page.md). راهنمای جریان‌های عمومی، اپ‌های عملیاتی و صفحات سامانه در `core-pages/` است:

| راهنما | کارکرد |
|---|---|
| [core-pages/marketing-home.md](core-pages/marketing-home.md) | صفحه اصلی و لندینگ |
| [core-pages/demo-preview.md](core-pages/demo-preview.md) | پیش‌نمایش تعاملی پنج منوی نمونه، دسته‌ها، جست‌وجو، جزئیات/تنوع محصول و سبد فقط‌خواندنی |
| [core-pages/admin-panel.md](core-pages/admin-panel.md) | پنل مدیر سامانه، تنظیم برند، و ناوبری موبایل بدون نوار هدر سراسری |
| [modules/brand-theme.md](modules/brand-theme.md) | توکن‌های بصری و رنگ سازمانی مشترک |
| [core-pages/public-menu.md](core-pages/public-menu.md) | منوی عمومی، نوار مشتری، پروفایل OTP، ده قالب قابل انتخاب، گالری عکس/GIF/ویدیو، درخواست گارسون و رزرو منوی نمونه فقط در محدودهٔ entitlement |
| [core-pages/public-reservation.md](core-pages/public-reservation.md) | رزرو سه‌مرحله‌ای سمت مشتری، تاریخ شمسی، ظرفیت/میز آزاد، پیش‌پرداخت و API عمومی محدودشده |
| [core-pages/kiosk-client.md](core-pages/kiosk-client.md) | کیوسک مشتری و کنترل قیمت محصول در سبد و سرور |
| [core-pages/kitchen-display.md](core-pages/kitchen-display.md) | نمایشگر آشپزخانه |
| [core-pages/courier-app.md](core-pages/courier-app.md) | اپلیکیشن پیک |
| [core-pages/survey-response.md](core-pages/survey-response.md) | فرم عمومی نظرسنجی |
| [core-pages/mini-site-public.md](core-pages/mini-site-public.md) | سایت کوچک عمومی |
| [core-pages/restaurant-directory.md](core-pages/restaurant-directory.md) | فهرست رستوران‌ها |
| [core-pages/auth-pages.md](core-pages/auth-pages.md) | ورود، ثبت‌نام، trial و ساخت منو/دسته‌بندی آغازین بر اساس نوع کسب‌وکار |
| [core-pages/platform-admin.md](core-pages/platform-admin.md) | پنل مدیر سامانه |
| [modules/marketing-content.md](modules/marketing-content.md) | فهرست وبلاگ/آموزش، صفحه مستقل ساخت/ویرایش و ادیتور غنی امن محتوا |
| [core-pages/payment-result.md](core-pages/payment-result.md) | نتیجه پرداخت |
| [core-pages/print-views.md](core-pages/print-views.md) | رسیدها و اسناد چاپی |
| [core-pages/error-pages.md](core-pages/error-pages.md) | خطاهای عمومی، ۴۰۴ و پاسخ ۵۰۲ |
| [core-pages/api-contract-map.md](core-pages/api-contract-map.md) | نقشه APIها و guardها |

## نقشه API برای عامل

قراردادهای مشترک route، tenant، نقش/feature، شکل endpointهای dynamic و مسیرهای عمومی/حسابداری/مدیر سامانه در [نقشه قراردادهای API](core-pages/api-contract-map.md) آمده است. آن را همراه سند feature بخوان؛ schema نهایی همچنان route TypeScript است.

## قراردادهای cross-cutting

- APIهای متداول: `/api/orders`, `/api/products`, `/api/categories`, `/api/business`, `/api/stats`, `/api/r/:resource`, `/api/acc/*`, `/api/public/*`, `/api/device/*`, `/api/admin/*`. درخواست گارسون از منوی مشتری در `/api/public/:slug/service-requests` و پنل‌های گارسون/صندوق در `/api/r/service-requests` و `/api/r/service-requests/:id` انجام می‌شود. هر route سند schema مستقل در `src/app/api` دارد.
- چند tenant بودن، نقش‌ها و تعرفه‌ها جزو منطق اصلی‌اند؛ کامپوننت را از route جدا نکن بدون حفظ guard.
- خطاهای API به toast/error state قابل فهم تبدیل شوند؛ صفحه‌های دارای polling هنگام unmount متوقف و هنگام hidden بودن صفحه بی‌جهت تکرار نشوند.
- پول و تاریخ در UI locale-aware هستند؛ تاریخ‌های تنظیمی/مالی برای کاربر ایران باید شمسی باشند، اما قرارداد ذخیره‌سازی API را تغییر نده.
- داده متنی و JSONهای setting را در JSX امن و escaping شده نمایش بده. برای حذف/بستن سال/پرداخت، confirmation و state در حال انجام داشته باش.

## مواردی که باید مطابق کد فعلی تفسیر شوند

- `/dashboard/bale` در نسخه فعلی فرم ارسال کمپین نیست؛ صفحه توضیح می‌دهد ارسال بله هنوز متصل نیست و به پنل پیامک هدایت می‌کند.
- در `/dashboard/payments` فقط تنظیم درگاه زرین‌پال و فهرست تراکنش‌ها فعال‌اند؛ اسنپ‌پی/دیجی‌پی در UI فعلی توضیح اتصال آتی دارند و برای مشتری ارائه نمی‌شوند.
- `/dashboard/accounting` همان دفتر double-entry در `src/modules/accounting.tsx` است؛ `/dashboard/income-expense` دفتر ساده تراکنش‌ها در `src/modules/finance.tsx` است و `/dashboard/receivables` دفتر طلب‌های تسویه‌نشده است. فروش نسیه باید از ماژول دریافتنی ثبت شود تا وجه نقد/درآمد وصول‌نشده به‌عنوان دریافتی صندوق ثبت نشود.

## پوشش مستندات

فهرست بالا slugهای جاری `MODULES` و چهار صفحه ثابت داشبورد را پوشش می‌دهد؛ تعداد را پیش از کار از registry زنده بررسی کن. `home-page.md` صفحه `/` و `core-pages/` مسیرهای عمومی/سیستمی اصلی و نقشه قراردادهای API را مستند می‌کند. برای هر resource API سند جداگانه نمی‌سازد؛ schema نهایی در route TypeScript است.

برای گزینه محصول، [فروش وزنی](modules/weighted-sales.md)، رهگیری خصوصی سفارش، funnel، قالب منو و بازطراحی فضایی Captain M در [راهنمای منوی عمومی](core-pages/public-menu.md)، شیفت صندوق، [ورود CSV](modules/menu-import.md)، [زمان‌بندی کارکنان](modules/staff-schedule.md)، [انتقال انبار](modules/stock-transfers.md)، [سیاست trial](modules/trial-policy.md)، [دفتر چک](modules/cheques.md) و [پیشنهاد خرید](modules/purchase-suggestions.md)، سند ماژول متناظر و [معماری](architecture.md) را ببین. تصمیم‌های هنوز تصویب‌نشده در `../decisions/` و `../adr/` ثبت شده‌اند. فروش وزنی M09 در checkout محلی پیاده شده و migration آن هنوز اجرا نشده؛ M11 چندشعبه و M12 صندوق آفلاین هنوز پیاده نشده‌اند.

> اصلاح تور راه‌اندازی (۲۰۲۶-۱۰-۱۹): راهنما اکنون روی کنترل‌های صفحات واقعی است؛ فرم مستقل ندارد. مشخصات فعلی و مسیر بازسازی در [مستند تور](modules/onboarding-tour.md) ثبت شده است.

برای ادامهٔ درخواست صندوق و پرینترهای مرجع، [گزارش تطبیق صندوق/چاپ](../../POS_REFERENCE_PARITY.md) را بخوانید؛ این فایل امکانات کدنویسی‌شده، آزمون‌شده و باقی‌مانده را جدا ثبت می‌کند.


## کامپوننت‌های رابط مشترک

برای بازسازی، نگهداری و استفادهٔ یکدست از Button، Field، Modal، ConfirmDialog، ورودی مبلغ `AmountInput` و کد یک‌بارمصرف `OtpCodeInput`، سند [کامپوننت‌های رابط](modules/ui-components.md) را بخوانید. ورودی مبلغ در ظاهر ارقام را سه‌رقمی گروه‌بندی می‌کند اما مقدار خام می‌دهد؛ OTP شش خانهٔ نمایشی را با یک input واقعی و autofill پیامکی می‌سازد. فیلدهای درصد/تعداد نباید به `AmountInput` تبدیل شوند. تغییر مشترک رابط باید در همان سند و گزارش روت ثبت شود.

### تغییر قرارداد اسناد — ۲۰۲۶-۱۰-۲۵
پیش از توسعه حسابداری، [گزارش اسناد کارتی و تراکنش‌ها](../updates/2026-10-25-accounting-document-cards.md) را بخوانید؛ API فهرست صفحه‌بندی دارد و برگشت/حذف پیش‌نویس باید از توابع تراکنشی مشترک عبور کند.

### نمایش خلاصه اسناد
در فهرست `/dashboard/accounting` هر سند یک ردیف با جمع مبلغ است؛ مشاهده خطوط سند از طریق کلیک روی ردیف و مودال انجام می‌شود. راهنمای جاری در [ماژول حسابداری](modules/accounting.md) و [گزارش تغییر](../updates/2026-10-25-accounting-document-cards.md) است.

### چاپ تراز و دفتر حساب
تراز آزمایشی دو قالب چاپ ۲ و ۴ ستونی دارد؛ دفتر کل/معین/تفصیلی پس از انتخاب حساب صورت‌حساب چاپ می‌کند. سربرگ کسب‌وکار و دوره از داده جاری پنل پر می‌شوند. [جزئیات پیاده‌سازی](../updates/2026-10-25-accounting-printable-reports.md).
