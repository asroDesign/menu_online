# نقشه قراردادهای API برای بازسازی ماژول‌ها

> راهنمای مشترک برای پیدا کردن مرجع واقعی endpointها؛ این سند جایگزین schema در routeهای TypeScript نیست.

## قرارداد مشترک احراز هویت و خطا

APIهای dashboard عموماً با `withAuth` wrap می‌شوند. این لایه session cookie را resolve می‌کند، وضعیت تعلیق کسب‌وکار را بررسی می‌کند، پیک را به endpointهای مخصوص پیک محدود می‌کند، و سپس guardهای `admin`, `perm`, `manager`, `roles`, `feature` را اعمال می‌کند. `AuthContext.business` tenant جاری است؛ handler باید همه queryها و mutationها را با `business.id` محدود کند. برای actionهایی که writer role محدود دارند، feature به‌تنهایی authorization نیست.

بدنه JSON با `readJson` خوانده می‌شود. خطای کنترل‌شده به `{error}` با HTTP status مناسب تبدیل می‌شود؛ خطای ناشناخته در backend با `logError` ثبت و پیام عمومی ۵۰۰ برمی‌گردد. از ارسال stack به browser خودداری کن. `src/lib/api.ts` درخواست‌ها را `no-store` می‌فرستد، پاسخ JSON را می‌خواند، 401 را به ورود می‌فرستد و `ApiError(message,status)` ایجاد می‌کند. hookهای optimistic فقط cache UI هستند؛ سرور مرجع نهایی است.

## APIهای عمومی ماژول‌ها: `/api/r/:resource`

`src/app/api/r/[resource]/route.ts` درخواست GET را به `REGISTRY[resource].list` و POST را به `.create` می‌فرستد. `/api/r/:resource/:id`، GET/PATCH/DELETE را به `get/update/remove` هدایت می‌کند. `REGISTRY` از `src/lib/registry-a.ts`, `registry-b.ts`, `registry-c.ts` ترکیب می‌شود؛ registry handler بخشی از schema و بخشی از منطق کسب‌وکار است.

نمونه resourceهای مهم: `customers`, `discounts`, `surveys`, `warehouses`, `inventory-categories`, `items`, `recipes`, `bank`, `ledger`, `incomeexpense`, `assets`, `couriers`, `zones`, `dev_tablet`, `dev_printer`, `dev_scale`, `dev_pager`, `dev_caller`, `pagers`, `calls`, `crosssell`, `printjobs`, `stock`, `stockcount`, `costing`, `report_sales`, `report_pnl`, `report_bank`, `payments`, `crosssellauto`, `ai`, `tickets`, `translations`, `suppliers`, `supplierpay`, `posrequests`, `tablebulk`, `pagerack`, `walletlog`, `bale`, `smstemplates`, `smscampaigns`, `smslogs`, `smstest`, `smsauto` و resourceهای دستگاه. برای نام دقیق resource و handler، خود `REGISTRY` را بخوان؛ از نام نمایشی sidebar حدس نزن.

`/api/r/inventory-categories` دسته‌های مستقل مواد اولیه را با feature `inventory` و writer role انبار مدیریت می‌کند؛ نام در tenant یکتا است. `PATCH /api/r/items/:id` برای categoryId فقط مالکیت دسته را با tenant جاری بررسی می‌کند. جزئیات فیلد و رفتار حذف دسته در [راهنمای انبارداری](../modules/inventory.md) است.

`GET /api/income-expense/accounts` فهرست حساب‌های معین و تفصیلی فعال درآمد/هزینه را فقط برای کسب‌وکار نشست جاری و entitlement `income_expense` می‌دهد. ثبت `/api/r/incomeexpense` شناسه‌های معین/تفصیلی را از نظر tenant، سطح، ماهیت و رابطهٔ والد-فرزند سمت سرور اعتبارسنجی می‌کند؛ جزئیات در `modules/income-expense.md` آمده است.

الگوی CRUD معمولی `GET {items}`, `POST {item}`, `GET /:id {item}`, `PATCH /:id {item}`, `DELETE /:id {ok}` است، اما همه resourceها CRUD عمومی نیستند: برخی فقط list/create یا command action دارند؛ برخی حذف را پشتیبانی نمی‌کنند. schema هر field، access guard، نوع پاسخ و side effect را از registry همان resource بردار. برای stock receipts، پرداخت تأمین‌کننده، POS request و ارسال پیجر، این endpointها business transaction ایجاد می‌کنند و نباید با generic CRUD جایگزین شوند.

## مسیرهای domain-specific

- سفارش‌های پنل از `/api/orders` و `/api/orders/:id` عبور می‌کنند؛ فهرست/دسترسی نقش، فیلتر وضعیت، تغییر وضعیت، پرداخت، تخصیص پیک، soft-delete/restore و ثبت منبع سفارش در همین routeها و helper `src/lib/orders.ts` تعیین می‌شوند. سفارش عمومی مسیر جدا دارد.
- صندوق در `POST /api/orders` برای اقلام `optionIds` می‌فرستد؛ نام/قیمت option از کاتالوگ همان tenant سمت سرور مجدداً محاسبه و snapshot می‌شود. اگر نام/موبایل مشتری صندوق وارد شده باشد، شماره معتبر normalize و customer همان کسب‌وکار پیدا یا ساخته می‌شود. `payNow=credit` فقط برای cashier مجاز است؛ پس از ایجاد order، `settleOrder` سند فروش، receivable و حساب بدهکار را در transaction حسابداری ثبت می‌کند. دریافت بعدی از `/api/receivables` انجام می‌شود و تسویه دوباره از order endpoint برای آن سفارش رد می‌شود.
- محصولات و دسته‌ها endpoint مستقیم `/api/products`, `/api/products/:id`, `/api/categories`, `/api/categories/:id` دارند. staff نیز `/api/staff` و میزها `/api/tables` هستند. `POST /api/tables/:id/status` میز tenant جاری را lock می‌کند و فقط وضعیت‌های عملیاتی `available|cleaning|out_of_service` را transition می‌دهد؛ occupied/reserved از order/reservation جاری مشتق‌اند. `DELETE /api/tables/:id` نیز در transaction بررسی می‌کند که سفارش باز یا رزرو فعال/آینده وجود نداشته باشد. order و reservation ساخت نیز میز را قفل و status/هم‌پوشانی رزرو را پیش از ثبت دوباره بررسی می‌کنند. اطلاعات business از `/api/business` می‌آید؛ PATCH آن تنظیمات را بر اساس feature پاک‌سازی/محدود می‌کند و secretهای تنظیم SMS را در GET خالی می‌کند. کلید `settings.printerSettings` در همین API زیر `cloud_printer` پاک‌سازی می‌شود و سرور تمام printer IDها را به deviceهای نوع `printer` همان tenant محدود می‌کند.
- `GET /api/offline-dashboard/snapshots/:dataset` مسیر دستگاه paired برای cache آفلاین پنل است؛ در حال حاضر فقط `menu` پذیرفته می‌شود. Bearer ترمینال، tenant و entitlement صندوق کنترل می‌شوند؛ پاسخ business profile عمومی، categories، products و tables همان کسب‌وکار را با revision/hash سروری و TTL هفت‌روزه برمی‌گرداند. migration `0055_offline_workspace_snapshots.sql` لازم است. این مسیر هنوز برای سایر ماژول‌ها snapshot نمی‌دهد و worker فقط داده را در SQLite رمزگذاری‌شده نگه می‌دارد؛ UI پنل آن را مصرف نمی‌کند.
- `/api/stats` فقط برای نقش مدیریتی/حسابدار است؛ بازه تهران و پرداخت‌های واقعی در محاسبه شاخص‌ها نقش دارند.
- `/api/r/waste` GET/POST گزارش tenant-scoped ضایعات است. GET بازه YYYY-MM-DD در تقویم میلادی رابط (انتخاب با PersianDateInput)، قلم/دلیل، صفحه‌بندی تا ۱۰۰ ردیف و CSV تا ۵۰۰۰ ردیف می‌پذیرد؛ aggregation هزینه/مقدار/روز/دلیل/ماده را می‌دهد. POST دلیل allowlist و rate limit دارد و `saveStockReceipt` را با `type=waste` صدا می‌زند تا موجودی، movement و سند هزینه در یک transaction ثبت شوند. migration `0038_inventory_waste_reason.sql` لازم است.
- `/api/courier/me`, `/api/courier/orders`, `/api/courier/orders/:id` مخصوص اپ پیک‌اند و نباید با API عمومی سفارش جایگزین شوند.
- `/api/device/:code/:action` با کد دستگاه احراز هویت می‌شود؛ این credential دسترسی محدود همان دستگاه است. rotation/لغو و scope آن را از جدول دستگاه‌ها و همین route بررسی کن؛ در نسخه فعلی code خود دستگاه credential است و نوع دستگاه + feature محدوده عملیات را تعیین می‌کند. پرینتر از `/api/device/:code/jobs` کار چاپ را poll/ack می‌کند. `GET/POST /api/r/printjobs` صف و تست چاپ را مدیریت می‌کنند؛ تنظیمات مرحله‌ای چاپ و header/footer از `/api/business` می‌آیند. تغییر سفارش به `ready` از route پنل یا action دستگاه، queue job مرحله تکمیل را در همان transaction status درج می‌کند.
- `GET /api/scales` احراز هویت session و entitlement `scale` دارد؛ فقط آخرین قرائت‌های تازه‌ی scaleهای همان business را با id/name/grams/lastSeenAt برمی‌گرداند و کد bearer دستگاه را افشا نمی‌کند. پنل صندوق/گارسون هنگام انتخاب محصول وزنی از آن استفاده می‌کند.

## مسیرهای مشتری و پرداخت عمومی

`/api/public/:slug/*` برای menu مشتری است و session مدیر لازم ندارد؛ هر handler باید slug را به business فعال resolve کند و فقط داده عمومی برگرداند. customer lookup، discount validation، recommendations، reservation، public order و POS polling مسیرهای جدا دارند.

`GET/POST /api/public/:slug/customer/feedback` به تنظیم `customerFeedbackEnabled` وابسته است و فقط با نشست OTP معتبر همان کسب‌وکار کار می‌کند؛ فهرست فقط پیام‌های همان customer را می‌دهد، ارسال به ۵ پیام در روز و متن ۱۰ تا ۱۵۰۰ نویسه محدود است. صندوق مدیر از resource `customer_feedback` استفاده می‌کند؛ فهرست و تغییر status فقط برای owner/manager و tenant جاری مجازند. migration افزایشی `0050` جدول را می‌سازد.

`GET /api/public/:slug/customer?phone=` فقط پاسخ ثابت «نیاز به تأیید مالکیت» می‌دهد؛ شماره خام به‌تنهایی هویت یا مجوز مصرف اعتبار نیست و balance/عضویت افشا نمی‌شود. مصرف cashback در سفارش عمومی تا جریان OTP و token محدود به tenant غیرفعال است.

در پنل احرازشده، `GET /api/business?membershipPreview=1&phone=&subtotal=` فقط برای مدیر/صندوق با entitlement `loyalty` و rate limit است؛ مشتری را با tenant نشست محدود می‌کند و صرفاً preview تخفیف را بدون نام/شماره برمی‌گرداند. اعمال تخفیف از `POST /api/orders` دوباره داخل transaction محاسبه و با actor/snapshot سفارش ذخیره می‌شود؛ فقط source صندوق مجاز است. `settings.orderWorkflowPreset` از `PATCH /api/business` عدد ۱ تا ۴ می‌گیرد و فقط UI جزئیات سفارش آن را می‌خواند.

`POST /api/public/:slug/orders` منبع قطعی سفارش مشتری است: محدودیت نرخ مستقل per-slug (۸ درخواست در دقیقه) و global guard (۳۰۰ در دقیقه)، پذیرش سفارش، entitlement و ساعت کاری تهران را بررسی می‌کند؛ ورودی با `parseOrderInput` normalize می‌شود و `createOrder` قیمت اقلام/هزینه‌ها را از داده سرور محاسبه می‌کند. پرداخت‌های ipg/card_to_card/pos فقط با feature و settings فعال مجازند. درگاه online فقط پس از callback معتبر و verify با زرین‌پال سفارش را settle می‌کند؛ بازگشت مرورگر به تنهایی پرداخت را تایید نمی‌کند.

`GET /api/public/:slug/track` با Bearer token تصادفی سفارش (hash در DB) read-only است و allowlist شماره سفارش، وضعیت‌های order/payment/delivery، history و آخرین مختصات تازه پیک را برمی‌گرداند؛ نام/تماس/آدرس/یادداشت/اقلام/قیمت را نمی‌دهد. token در fragment است؛ POST با body صرفاً سازگاری لینک‌های قدیمی است. `/api/public/:slug/events` فقط eventهای منوی allowlist و شناسه محصول/دسته tenant-owned را می‌پذیرد؛ `order_created` از client قبول نمی‌شود و سرور آن را در تراکنش ثبت سفارش می‌نویسد. `/api/public/funnel` قیف عمومی وب‌سایت را با نام‌های ثابت و UUID ناشناس ثبت می‌کند؛ داده کاربر، نشانی، referrer و user-agent نمی‌گیرد و تکمیل signup/demo/checkout را فقط server ثبت می‌کند.

`/api/public/pay/callback` callback درگاه است؛ `/api/public/survey/:id` پاسخ پرسشنامه را با survey فعال اعتبارسنجی می‌کند. این routeهای بدون session باید در برابر شناسه جعلی، cross-tenant access، payload نامعتبر و replay محافظت شوند.

## APIهای حسابداری دوطرفه و ادمین

`/api/acc/[...path]` namespace حسابداری double-entry است: `meta`, `accounts`, `years`, `documents`, `reports/{trial,ledger,journal,statements}`, `depreciation`. هر handler کسب‌وکار جاری را scope می‌کند؛ سال مالی شمسی، وضعیت بسته، خطوط بدهکار/بستانکار، سند draft/posted و برگشت سند قوانین مستقل دارند. سند قطعی حذف نمی‌شود؛ برای اصلاح سند برگشتی ساخته می‌شود. حسابداری دوطرفه با `/api/r/ledger` (دفتر ساده درآمد/فروش) یکی نیست.

`/api/receivables` دفتر مطالبات tenant-scoped است: فهرست/طلب دستی، حساب بدهکار، سفارش‌های واجد شرایط، تبدیل سفارش تحویل‌شده به نسیه، صورت‌حساب و وصول. همه routeها entitlement `accounting` و نقش owner/manager/accountant دارند. ثبت طلب/دریافت و سند دوطرفه در transaction مشترک انجام می‌شود؛ وصول علاوه بر قفل سطر طلب، کلید یکتا دارد و سطر تراکنش `source=receivable` را ثبت می‌کند. `/api/receivables/orders/:id` سفارش بدون customerId یا سفارش غیرتحویل‌شده را رد می‌کند؛ فروش نسیه از settlement عمومی با `paymentMethod=credit` قابل دورزدن نیست. جزئیات جریان و جدول‌ها در [راهنمای مطالبات](../modules/receivables.md) است.

`GET/POST /api/costing/price-target` در کنار resource خواندنی `costing` قیمت هدف را پیش‌نمایش/اعمال می‌کند. GET هزینه و hash مواد را از داده tenant جاری می‌سازد؛ POST قیمت ارسالی client را نمی‌پذیرد، snapshot را دوباره قفل و بررسی می‌کند، سپس تغییر product و audit را در یک transaction ثبت می‌کند. نقش خواندن manager/accountant و اعمال owner/manager است؛ migration `0030_product_price_audits.sql` لازم است.

`GET /api/r/report_sales?days=7|14|30` و همان resource با `from=YYYY-MM-DD&to=YYYY-MM-DD` از فیلتر مشترک `parseSalesReportRange` استفاده می‌کنند؛ custom bounds به روز تهران تبدیل می‌شوند، هر دو تاریخ لازم و بازه حداکثر ۳۶۶ روز است. `/api/reports/sales/export` همان tenant و paid/paymentStatus filter را با سقف ۱۰٬۰۰۰ سفارش به CSV امن تبدیل می‌کند. چاپ browser از summary رندرشدهٔ همان filter استفاده می‌کند. دسترسی CSV به owner/manager/accountant با feature `sales_reports` محدود است.

`GET /api/receipt-archive?q=&cursor=` برای manager/owner سفارش‌های حذف‌نشدهٔ tenant جاری را حداکثر ۵۰ مورد در هر صفحه می‌دهد؛ query شماره سفارش، نام یا موبایل را در backend جست‌وجو می‌کند. پاسخ شماره تماس را برنمی‌گرداند. چاپ مجدد در `/print/receipt/:id?reprint=1` snapshot سفارش را read-only render می‌کند و نسخهٔ بازچاپ را روی رسید نشان می‌دهد؛ پرداخت یا سفارش را تغییر نمی‌دهد.

`GET/POST /api/sms-retention` و `PATCH /api/sms-retention/:id` مدیریت قاعده‌های بازگشت مشتری را زیر feature `sms` و نقش مدیر/مالک انجام می‌دهند. worker همان زمان‌بند موجود `/api/cron/sms` است؛ صف پایدار، یکتایی trigger و claim اتمیک در جدول‌های `sms_retention_*` قرار دارند. گزارش API فقط aggregate و درآمد انتساب آخرین‌لمس سفارش‌های پرداخت‌شده را می‌دهد؛ برای محدودیت poll segment و نتیجه‌های uncertain به [راهنمای بازگشت مشتری](../modules/sms-retention.md) رجوع کن. migration `0031_sms_retention.sql` لازم است.

`/api/admin/[...path]` ابتدا `withAuth({admin:true})` و سپس `handleAdmin` را اجرا می‌کند. این namespace برای چند tenant و permissionهای سامانه است؛ هر action را در `src/lib/admin-api.ts` و `src/lib/admin-meta.ts` پیدا کن. مجوز UI به تنهایی کافی نیست.

`GET /api/admin/marketing-funnel?days=7|14|30` خلاصه‌ی شمارش رویدادهای عمومی را با permission `overview` می‌دهد؛ رویدادها به session یا فرد وصل نیستند و شروع پرداخت برابر با پرداخت موفق نیست. گزارش شیفت رستوران از `GET /api/cash-shifts/history?days=7|14|30` می‌آید؛ feature `cashier_pos`, نقش مدیر و `business.id` از session لازم‌اند. active/open و close مسیرهای `/api/cash-shifts` و `/api/cash-shifts/:id` هستند؛ close روی row lock و closedAt شرط دارد.

`GET /api/r/report_sales?days=n` یا `?from=YYYY-MM-DD&to=YYYY-MM-DD` علاوه بر جمع سفارش‌های پرداخت‌شده، snapshot محصولات بدون فروش، وضعیت‌های کل بازه، حداکثر ۱۰۰ سفارش محدودفیلد و حداکثر ۱۵ سند فروش اخیر را tenant-scoped می‌دهد (`sales_reports`). `GET /api/r/report_daily_status?snapshot=1` فقط aggregate امروز/دیروز، موجودی کم و صف فعال را برمی‌گرداند و نقش manager لازم دارد؛ هیچ اطلاعات مشتری در payload نیست. CSV از `/api/reports/sales/export` و همان query فیلتر استفاده می‌کند. قرارداد و محدودیت‌ها در [راهنمای گزارش فروش](../modules/reports.md) آمده است.

مسیرهای این بسته: `/api/menu-import/preview`, `/api/menu-import/:id`, `/api/menu-import/:id/commit` (`menu_import`, manager); `/api/staff-schedule` و `/api/staff-schedule/leave` (`staff_scheduling`, self-service فقط linked staff); `/api/stock-transfers` (tenant، warehouse request و manager decision); `/api/reports/purchase-suggestions` (warehouse/manager، read-only); `/api/cheques` و `/api/cheques/accounts` (`cheque_register`, manager/accountant); `/api/courier/location` (خود پیک و سفارش فعال). trial policy در admin API است و grant فقط از register ایجاد می‌شود. payloadهای دقیق در guide ماژول مربوط آمده‌اند.

`GET /api/cheques?year=<JalaliYear>&month=<1..12>` همان فهرست tenant را به بازه سررسید یک ماه شمسی محدود می‌کند و حداکثر ۵۰۰۰ مورد می‌دهد؛ بدون query ماه، route برای فهرست عادی حداکثر ۵۰۰ مورد آخر را می‌دهد.

`GET /api/cheques/accounts` کدهای فعال معین/تفصیلی tenant جاری را برای طرف سند می‌دهد. `POST /api/cheques` ثبت چک را با حساب طرف در یک تراکنش با سند پایه و event انجام می‌دهد؛ `PATCH /api/cheques` وضعیت و اسناد معکوس/تعدیلی را در تراکنش واحد ثبت می‌کند. برای جزئیات debit/credit و replay، [راهنمای دفتر چک](../modules/cheques.md) مرجع است.

## احراز هویت، فایل و سرویس‌های جانبی

- `POST /api/auth/otp/request` کد ثبت‌نام/ورود می‌فرستد؛ در ثبت‌نام کوکی HMAC کوتاه‌عمر را به challenge می‌بندد. `POST /api/auth/otp/verify` در حالت login session می‌سازد اما در حالت register فقط مرحلهٔ «اطلاعات فروشگاه» را آزاد می‌کند و account نمی‌سازد. `POST /api/auth/register/complete` فقط challenge ثبت‌نامی مصرف‌شده و کوکی معتبر را می‌پذیرد و user، business و trial احتمالی را در تراکنش می‌سازد. body آن `{name,businessName,businessType,address?}` است؛ شماره، plan و مدت از client پذیرفته نمی‌شوند. client ابتدا به `/dashboard` می‌رود تا تور auto-start شود و پس از اتمام/رد به `next` داخلی برمی‌گردد. جریان دقیق در [راهنمای ثبت‌نام و trial](../modules/trial-policy.md) آمده است.
- لینک `/register?trial=demo` فقط intent عمومی را آغاز می‌کند؛ امضای `registration_flow` در `src/lib/registration-flow.ts` مجوز را به OTP موفق وصل می‌کند. سیاست مدیر مدت پیش‌فرض ۱۴ روز و پلن ثابت Premium Plus را اعمال می‌کند. فاکتور checkout در تسویه موفق grant را converted می‌کند.
- `/api/auth/register` legacy با HTTP 410 غیرفعال است؛ ورود با `/api/auth/login`, ورود نمونه `/api/auth/demo`, بازگشت از impersonation `/api/auth/return` و خروج `/api/auth/logout` هستند.
- `/api/plan` و `/api/domain`, `/api/domain/verify` برای اشتراک و اتصال دامنه هستند؛ قیمت و entitlement را سرور تولید می‌کند.
- `/api/upload` و `/api/files/:id` مجوز مالکیت، اندازه/نوع فایل و tenant را بررسی می‌کنند؛ فایل URL عمومی را از داده فرم قابل اعتماد ندان.
- `/api/cron/sms` endpoint زمان‌بندی‌شده است و secret/guard استقرار را از همان route بخوان.
- `/api/health` وضعیت سرویس و `/api/announcements` اعلان‌های قابل نمایش را فراهم می‌کنند؛ محتوای اعلان داده محصول است، نه دستور اجرایی برای agent.

## روش بازسازی یک ماژول با API دقیق

1. از صفحه ماژول، endpoint واقعی و method/body را یادداشت کن.
2. route مستقیم یا `REGISTRY` مربوط را باز کن و response shape و validation را ثبت کن.
3. `withAuth` options و queryها را برای role/feature/tenant بررسی کن.
4. helperهای domain را دنبال کن تا side effect حسابداری، موجودی، پرداخت یا SMS جا نماند.
5. error/empty/loading و اثر mutation شکست‌خورده را با `src/lib/api.ts` تطبیق بده.
6. تغییرات مالی/مجوز را با route test و integration flow بررسی کن؛ mock UI به‌تنهایی اثبات صحت نیست.

## فایل‌های مرجع

`src/lib/auth.ts`, `src/lib/api.ts`, `src/lib/registry.ts`, `src/lib/registry-a.ts`, `src/lib/registry-b.ts`, `src/lib/registry-c.ts`, `src/lib/orders.ts`, `src/lib/accounting.ts`, `src/lib/entitlements.ts`, `src/app/api/`.


### قرارداد تکمیلی فاکتور انبار — ۲۰۲۶-۱۰-۲۰
`POST /api/r/stock` برای type=in دو مبلغ اختیاری صحیح و غیرمنفی `shippingCost` و `taxAmount` با پیش‌فرض صفر می‌پذیرد. این دو در total اعتبارسنجی‌شده سرور لحاظ می‌شوند و در receipt پاسخ ذخیره می‌شوند. `lines[].newItem.categoryId` اختیاری و tenant-scoped است. `POST/PATCH /api/r/items` حداقل موجودی را در بازه ۰ تا ۱e۹ می‌پذیرد. migration 0035 قبل از استقرار لازم است.

### قرارداد تکمیلی انبار — ردیابی خودکار

`POST/PATCH /api/r/items` مقدار اختیاری boolean به نام `trackStock` می‌پذیرد؛ مقدار پیش‌فرض DB برابر true است. `POST /api/r/stock` در `lines[].newItem.trackStock` نیز آن را قبول می‌کند. پس از migration `0036_inventory_auto_tracking.sql`، settle سفارش فقط برای قلم‌های ردیابی‌شده مقدار موجودی را کم، movement فروش را ثبت و COGS را به حسابداری منتقل می‌کند. هشدار روزانه/AI، کنترل موجودی و route پیشنهاد خرید فقط اقلام ردیابی‌شده را بررسی می‌کنند.

### قرارداد افزودن قلم کامل انبار — ۲۰۲۶-۱۰-۲۱

`POST /api/r/inventory-items` فرم `/dashboard/inventory/add` را ثبت می‌کند. body شامل `name, sku, unit, recipeUnit, recipeToStockFactor, warehouseId, categoryId, expiryDate, openingStock, openingUnitCost, lastPurchaseCost, minStock, reorderPoint, openingNote, trackStock, isActive` است. سرور دسته و انبار را به business جاری محدود می‌کند، SKU را نرمال/یکتا می‌سازد، مقادیر قیمت و ضریب را اعتبارسنجی می‌کند و قلم را همراه با movement موجودی اول دوره در یک transaction درج می‌کند. اگر openingStock و ارزش آن مثبت باشند، سند افتتاحیه موجودی/سرمایه نیز همان‌جا نوشته می‌شود؛ برای مانده صفر movement و سند افتتاحیه ساخته نمی‌شوند. مسیر اختصاصی این POST فقط `manager` یا نویسندهٔ `warehouse` با entitlement `inventory` را می‌پذیرد. جزئیات migration و معنای فیلدها در [راهنمای انبارداری](../modules/inventory.md) آمده است.

`recipeToStockFactor` ضریب تبدیل از واحد رسپی به واحد موجودی است؛ مصرف فروش و COGS آن را در نظر می‌گیرند. پیش‌نمایش هزینهٔ رسپی و گزارش سود/زیان نیز باید همین ضریب را اعمال کنند تا واحد ریز مصرف‌شده با ماندهٔ کلان خریداری‌شده هم‌مقیاس شود. `reorderPoint` فقط مبنای پیشنهاد خرید است؛ حداقل موجودی همچنان برای هشدار کمبود به‌کار می‌رود. قلم `isActive=false` از انتخاب‌های جدید رسپی و پیشنهادهای عملیاتی حذف می‌شود، ولی تاریخچه/گردش آن حفظ می‌شود.
