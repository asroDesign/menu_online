# معماری اجرایی مشترک برای بازسازی Agent

این سند مکمل راهنمای هر صفحه است. هر راهنمای ماژول جزئیات خاص خودش را دارد؛ این فایل قراردادهایی را جمع می‌کند که هنگام بازنویسی نباید شکسته شوند.

## مسیر ورود درخواست و دسترسی

### رندر صفحه

- `src/app/dashboard/layout.tsx` قبل از همه صفحات داشبورد `getAuth()` را اجرا می‌کند. کاربر ناشناس به `/login` می‌رود؛ نقش courier به `/courier` می‌رود؛ tenant مسدودشده صفحه مسدودی می‌بیند.
- `/dashboard` در `src/app/dashboard/page.tsx` فقط برای owner، manager و accountant صفحه Overview را رندر می‌کند؛ بقیه نقش‌ها طبق `ROLE_HOME` به صفحه خانه خود هدایت می‌شوند.
- صفحات ثابت `/dashboard/products`, `/dashboard/categories`, `/dashboard/settings` از guard داخل `[module]` عبور نمی‌کنند، اما `MODULE_ONLY` در sidebar و مجوز API باید محدودیت آن‌ها را اعمال کند؛ برای بازسازی، دسترسی را فقط از روی مخفی‌شدن لینک نتیجه نگیر.
- بقیه slugها در `src/app/dashboard/[module]/page.tsx` ثبت شده‌اند. مسیر ناشناخته 404 می‌شود، مسیر ناشناس login می‌خواهد، `MODULE_ONLY` نقش‌های مجاز را محدود می‌کند و `can(auth, feature)` entitlement را بررسی می‌کند. برای feature آرایه‌ای، `hasAny` یعنی دسترسی به هرکدام از گزینه‌ها کافی است.

### نقش‌ها

تعریف مرجع در `src/lib/roles.ts` است: owner/manager مدیر رستوران‌اند؛ staff دارای نقش waiter, cashier, chef, warehouse یا accountant است؛ courier صرفاً به پورتال پیک دسترسی دارد. `ROLE_FEATURES` دسترسی ناشی از نقش را از دسترسی plan کم می‌کند. API `withAuth` علاوه بر auth، tenant فعال، تعلیق، نقش، feature و مدیر بودن را کنترل می‌کند.

| نقش | خانه | محدوده شاخص |
|---|---|---|
| owner / manager | `/dashboard` | داشبورد، تنظیمات و مدیریت ماژول‌های مجاز پلن |
| waiter | `/dashboard/waiter` | ثبت سفارش بدون تسویه/تخفیف، میز و برخی جریان‌های مشتری |
| cashier | `/dashboard/cashier` | صندوق و گردش سفارش/پرداخت مجاز |
| chef | `/dashboard/orders` | مشاهده و پیشبرد آماده‌سازی، نمایشگر آشپزخانه و پیجر |
| warehouse | `/dashboard/inventory` | اقلام، گردش و کنترل موجودی، recipe و costing |
| accountant | `/dashboard` | داشبورد، دفاتر و گزارش‌های مالی مجاز |
| courier | `/courier` | فقط سفارش‌های محول‌شده و وضعیت تحویل |

این جدول خلاصه است؛ برای هر عملیات، `ROLE_FEATURES`, `MODULE_ONLY`, گزینه‌های `withAuth` و writerهای `makeCrud` را با هم بررسی کن. برای مثال `ResourcePage` امکان ویرایش را نمایش می‌دهد، اما API فقط owner/manager و نقش‌های writer تعریف‌شده را می‌پذیرد.

## قرارداد collection و CRUD

### `api()` و `useCollection()`

- `src/lib/api.ts` درخواست‌ها را `cache: no-store` می‌فرستد و بدنه JSON می‌سازد. خطای شبکه پیام «ارتباط با سرور برقرار نشد» می‌دهد؛ پاسخ غیر 2xx از `{error}` استفاده می‌کند؛ 401 در مرورگر به `/login` منتقل می‌شود.
- `useCollection<T>(url,{poll})` در mount بارگیری می‌کند؛ poll فقط وقتی tab visible است درخواست می‌فرستد؛ هنگام unmount interval پاک می‌شود. create/update/delete خوش‌بینانه‌اند و در خطا rollback می‌شوند؛ شناسه منفی یعنی ردیف موقت درحال ذخیره.
- query string در `url` برای list استفاده می‌شود؛ update/delete query را حذف می‌کنند و به `${base}/${id}` می‌روند. برای actionهای غیر CRUD (restore، verify، print، payment) `api()` مستقیم استفاده می‌شود.
- بعد از عملیات که state دیگری را متأثر می‌کند صریحاً `reload(true)` یا refresh collectionهای وابسته را فراخوانی کن. در optimistic state، پاسخ سرور جایگزین draft می‌شود.

### `ResourcePage`

`src/components/resource-page.tsx` سازنده فهرست‌های CRUD است:

- props اصلی: title, endpoint, fields, columns, emoji, emptyTitle/emptyDesc. گزینه‌ها: search, poll, header/footer, rowActions, selectable/renderBar, remote fields, optimisticExtra و extraCreate.
- برای list جدول با overflow افقی و حداقل عرض 640px می‌سازد؛ modal افزودن/ویرایش، سوییچ bool، PersianDateInput برای date/datetime، select remote، search، loading/error/empty و تأیید حذف دارد.
- typeهای فرم `text/number/money/select/bool/date/textarea/datetime` هستند. ارقام فارسی در number/money normalize می‌شوند. تاریخ به ISO تبدیل می‌شود. فیلد `remote` به id عددی یا null تبدیل می‌شود. فیلدهای not-in-spec سرور ذخیره نمی‌شوند.
- create/update/delete خوش‌بینانه‌اند. delete به‌صورت پیش‌فرض حذف دائم است و dialog تأیید نشان می‌دهد؛ فقط داده‌هایی با قانون domain خاص می‌توانند soft-delete باشند.
- از این component فقط وقتی استفاده کن که ساختار تعامل واقعاً CRUD جدول‌محور باشد؛ inventory، orders، accounting و wizardهای چندمرحله‌ای component سفارشی دارند.

### `makeCrud` و `/api/r/:resource`

`src/app/api/r/[resource]/route.ts` و `[id]/route.ts` درخواست را به `REGISTRY` می‌فرستند؛ registry در `src/lib/registry.ts` از registry-a/b/c ساخته شده. برای منبع دقیق فیلدها، `spec`, `writers`, `feature`, `readFeature`, `validate`, `decorate`, `beforeDelete` آن resource را بخوان.

`makeCrud` در `src/lib/crud.ts` بدنه را براساس spec sanitize می‌کند، فقط keyهای مجاز را عبور می‌دهد، tenantId را از session می‌گیرد، ownership را با `businessId` محدود می‌کند، writer/feature را می‌سنجد و قبل از حذف hook اجرا می‌کند. برای update تهی 400 می‌دهد. مقادیر string trim/limit می‌شوند؛ int/float bound می‌شوند؛ enum فقط عضو مجاز را قبول می‌کند؛ date parse می‌شود.

## داده، زمان و نمایش

- کاربر فارسی‌زبان است: `dir=rtl`, Vazirmatn، label/empty/error فارسی، `formatNumber/formatPrice/toFa` و `formatDate/formatTime` از `src/lib/format.ts` را استفاده کن. پول UI تومان است؛ نام فیلد API را تغییر نده.
- date-only/date-time باید با `PersianDateInput` یا `JalaliInput`/`src/lib/jalali.ts` در تقویم شمسی وارد شود. timezone محاسبات کسب‌وکار تهران است؛ API در بسیاری موارد ISO/Date ذخیره می‌کند. UI شمسی به معنی تغییر قرارداد ذخیره‌سازی به متن جلالی نیست.
- شماره تلفن و کدها LTR نمایش داده شوند؛ محتوای فارسی در متن راست‌چین باقی بماند. فاصله/overflow جدول و modal را برای موبایل کنترل کن.
- loading، خطای قابل retry، empty، موفقیت و حالت disabled برای فرم ناقص یا درخواست درحال اجرا بخشی از رفتار هستند، نه تزئین.

## امنیت و domain invariants

- قیمت محصول، مبلغ نهایی، تخفیف، entitlement، نقش، ownership، پرداخت online و وضعیت رزرو را از کلاینت معتبر فرض نکن. مسیرهای API عمومی هم باید tenant slug، وضعیت فعال و rate limit خود را اعمال کنند.
- پرداخت درگاه تنها پس از Verify سمت سرور معتبر است؛ کارت‌به‌کارت در انتظار بررسی انسان می‌ماند. دستور صندوق ممکن است فقط یک payment request به local agent باشد و به معنی پرداخت موفق نیست.
- ledger/stock/order باید قابل ممیزی بمانند. حذف‌های دارای گردش را دور نزن؛ برای سند قطعی reverse صادر کن؛ موجودی را با movement تغییر بده؛ ایجاد چندمرحله‌ای فاکتور و سند باید atomic/idempotent باشد.
- secrets مانند API key پیامک یا credential دستگاه را در DOM/لاگ/response عمومی نشان نده. token/code دستگاه را مطابق flow فعلی محدود کن.

## بررسی نهایی بازنویسی

برای هر feature:

1. route و guard آن را از `page.tsx` و `roles.ts` بخوان.
2. component، helperها و typeهای DB/API را باز کن؛ سند feature به تنهایی همه edge caseها را جایگزین نمی‌کند.
3. لیست endpointهای واقعی را با registry یا route source تطبیق بده؛ برای polling cleanup، optimistic rollback و وابستگی بین collectionها را حفظ کن.
4. flow معمول، خطا، empty، نقش غیرمجاز، entitlement قفل‌شده، ورودی فارسی، صفحه کوچک و confirmation عملیات حساس را مرور کن.
5. typecheck و lint/build متناسب تغییر را اجرا کن. برای تغییر مستندات، لینک‌های نسبی و وجود فایل‌های اشاره‌شده را کنترل کن.
