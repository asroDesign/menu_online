# اتوماسیون بازگشت مشتری با پیامک

این راهنما رفتار و قرارداد زیرتب «بازگشت مشتری» در `/dashboard/sms` را مشخص می‌کند. این قابلیت توسعهٔ ماژول پیامک موجود است و باید همان پیکربندی provider، پترن، consent مشتری و زمان‌بند `/api/cron/sms` را مصرف کند.

## هدف و مرز

- هدف: شناسایی مشتریانی که مدتی خرید نکرده‌اند یا از/به یک segment رفته‌اند، زمان‌بندی پیام پترن، جلوگیری از ارسال خارج از رضایت و سنجش سفارش‌های پرداخت‌شده‌ای که پس از ارسال در پنجرهٔ مشخص ثبت می‌شوند.
- خروجی فروش با عنوان «درآمد منتسب» گزارش می‌شود؛ به معنی اثر علّی پیام نیست.
- اطلاعات مخاطب و شماره موبایل در response فهرست کمپین‌ها افشا نمی‌شود. جدول وضعیت segment فقط `businessId, ruleId, customerId, currentSegment` دارد.
- entitlement `sms` و نقش manager/owner هم در route و هم API لازم است. کلید سرویس پیامک فقط از تنظیم server-side کسب‌وکار گرفته می‌شود.

## تعریف قاعده

قاعده شامل عنوان، trigger، پترن، فاصله cooldown، سقف پیام‌های بازاریابی مشتری در ۳۰ روز، ساعت ارسال تهران، پنجره انتساب ۱ تا ۳۰ روز و کد تخفیف اختیاری است. Trigger یکی از این‌هاست:

- `inactive_days`: آخرین خرید یا زمان ثبت مشتری دست‌کم N روز گذشته باشد؛ برای مشتری بدون خرید، `createdAt` مبنای تشخیص inactivity و `lastOrderAt=null` مبنای بررسی خرید جدید است.
- `segment_enter`: segment مشاهده‌شده از وضعیت دیگری وارد segment هدف شده باشد.
- `segment_exit`: segment مشاهده‌شده از segment هدف خارج شده باشد.

مجموعه segmentها همان classifier فعلی مشتری است: `vip`, `loyal`, `regular`, `new`, `at_risk`, `lost`, `none`. برای segment triggers، اولین مشاهده صرفاً baseline ذخیره می‌شود و پیام تولید نمی‌کند. Worker هر بار ۲۵۰ مشتری را با cursor می‌خواند و در چرخه‌های بعدی ادامه می‌دهد؛ بنابراین گذار segment زمان‌حقیقی نیست و در فاصلهٔ دو poll ممکن است گذار کوتاه‌مدت دیده نشود.

قالب باید فعال و از نوع `promo` یا `occasion` باشد. کد تخفیف در زمان ساخت و ارسال مجدداً در tenant جاری بررسی می‌شود و باید فعال، منقضی‌نشده و زیر سقف استفاده باشد. worker کد تخفیف جدید تولید نمی‌کند و استفاده را جلوتر از سفارش نیز مصرف نمی‌کند؛ متن/کد در template فقط اطلاع‌رسانی است.

## صف، رضایت و retry

`sms_retention_deliveries` یک ردیف برای هر campaign/customer/trigger دارد و unique index جلوی enqueue تکراری را می‌گیرد. worker پیش از ارسال transition شرطی `queued -> sending` انجام می‌دهد تا دو replica پیام را هم‌زمان نفرستند. در لحظهٔ ارسال customer، tenant، `smsOptIn`, شماره، segment مورد انتظار، آخرین خرید، feature و اعتبار کد تخفیف دوباره خوانده می‌شوند. opt-out، شماره نامعتبر، خرید بعد از trigger، تغییر segment، cooldown یا سقف frequency به `skipped` ختم می‌شود.

خطای پاسخ provider که قطعاً پیام را نپذیرفته حداکثر سه بار با تأخیر افزایشی retry می‌شود. timeout/خطای شبکه و workerی که پس از claim از بین می‌رود `uncertain` می‌شوند و auto-retry نمی‌شوند، چون providerهای موجود کلید idempotency ارسال در اختیار این برنامه نمی‌گذارند و نتیجهٔ مبهم را نباید به پیام تکراری تبدیل کرد. وضعیت uncertain در گزارش عملیات قابل مشاهده است؛ در این نسخه retry دستی ندارد.

SMS log موجود `kind=retention` را ثبت می‌کند. آمار انتساب با آخرین پیام موفق پیش از سفارش، فقط سفارش‌های `status=paid` و `paymentStatus=paid` را در پنجرهٔ rule می‌شمارد؛ برای هر سفارش حداکثر یک touch انتخاب می‌شود. canceled/unpaid سفارش وارد درآمد منتسب نمی‌شود. پیام‌های سرویس و تست در frequency cap تبلیغاتی محاسبه نمی‌شوند؛ campaign، birthday، occasion و retention محسوب می‌شوند.

## داده و API

- `sms_retention_rules`: trigger و تنظیمات tenant-scoped قاعده، schedule، frequency/cooldown، کد اختیاری و cursor.
- `sms_retention_members`: آخرین segment مشاهده‌شده برای triggerهای ورود/خروج.
- `sms_retention_deliveries`: صف، trigger key، وضعیت، تعداد تلاش، ساعت claim/sent و detail کوتاه. شماره یا متن شخصی در آن ذخیره نمی‌شود.
- `GET /api/sms-retention`: تا ۱۰۰ قاعده و aggregate وضعیت‌ها، conversion و attributed revenue.
- `POST /api/sms-retention`: اعتبارسنجی و ساخت قاعده؛ حداکثر ۲۰ قاعده فعال برای هر tenant.
- `PATCH /api/sms-retention/:id`: تغییر عنوان و/یا توقف یا فعال‌کردن مجدد همان قاعده.
- `/api/cron/sms?key=CRON_SECRET`: کار فعلی زمان‌بند کمپین، birthday و retention را اجرا می‌کند. query بدون secret نباید مجاز شود.
- `src/lib/sms-retention-core.ts`: نرمال‌سازی موبایل، transition و قواعد eligibility خالص.
- `src/lib/sms-provider.ts`: ارسال pattern مشترک برای هر دو provider؛ تست‌ها fake `fetch` دارند و پیام واقعی ارسال نمی‌کنند.
- migration: `src/db/migrations/0031_sms_retention.sql`; down فقط وقتی هیچ delivery‌ای وجود ندارد جدول‌ها را حذف می‌کند. migration روی دیتابیس محلی/تولید در این توسعه اجرا نشده است.

## UI و بررسی

فرم پنل فارسی و RTL شامل trigger، segment/روز، پترن، cooldown، سقف ۳۰روزه، ساعت تهران، پنجره انتساب و کد تخفیف است. کارت هر قاعده وضعیت‌های queued/sending/sent/skipped/failed/uncertain و درآمد منتسب را نشان می‌دهد؛ هیچ نام یا شماره گیرنده در این نمای مدیریتی نیست. کاربر می‌تواند قاعده را متوقف یا فعال کند.

تست خالص/قرارداد در `tests/security-regressions.test.cjs` موارد موبایل، consent، خرید پس از محرک، transition، cooldown، frequency cap، جداسازی tenant، claim، uniqueness و query انتساب last-touch را می‌پوشاند. تست provider با fake `fetch` اجرا می‌شود. PostgreSQL concurrency، زمان‌بندی cron واقعی، provider واقعی و UI مرورگر بدون DB/credentials بررسی نشده‌اند. قبل از فعال‌سازی production، migration باید اعمال و Cron واقعی با cadence مستند پیکربندی شود.
