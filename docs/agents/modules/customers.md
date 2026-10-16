# مشتریان

> مشخصات بازسازی ماژول `customers` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/customers`
- کامپوننت/منبع فعلی: `src/modules/growth-a.tsx — Customers`
- entitlement تعرفه: `loyalty`
- هدف: پروفایل و بخش‌بندی مشتریان و تعامل وفاداری.

## رابط و جریان کار

فهرست با جست‌وجو/فیلتر segment، تعداد/آمار مشتری و جزئیات تماس و خرید؛ تنظیم modal قوانین segment خودکار و ذخیره آستانه‌ها؛ امکان اقدام پیام/مشاهده کیف پول.

## داده و API

ResourcePage /api/r/customers؛ GET/PATCH /api/business با settings.segments؛ اعتبار /api/r/walletlog.

## قواعدی که بازنویسی باید حفظ کند

شماره تماس شناسه حساس است و فقط role مجاز می‌بیند؛ segment از قواعد ذخیره‌شده ساخته شود؛ مقدارهای فارسی قبل از عدد کردن normalize شوند.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Customer record: name/phone/note/points/walletBalance/totalSpent/ordersCount/birthMonth/birthDay/smsOptIn/lastOrderAt/segment. فهرست با sort سرور بر اساس `totalSpent` نزولی؛ query search نام/شماره. Segment tabs از `SEGMENTS` و تعداد در هر segment ساخته می‌شوند: all و گروه‌های تعریف‌شده در `src/lib/segments.ts`. آخرین خرید با تاریخ جلالی و تعداد روز نسبی؛ birthday با ماه‌های شمسی `JMONTHS` نشان داده می‌شود.

`ResourcePage` create/edit شامل نام، موبایل، ماه/روز تولد شمسی، امتیاز، رضایت پیامک و یادداشت است. نرخ تبدیل امتیاز در `SettingCard` (key=`pointsPerToman`) قابل تنظیم؛ manager با feature loyalty modal آستانه‌های VIP/وفادار/at-risk/lost را در `settings.segments` ذخیره می‌کند. انتخاب چندردیفی و دکمه ارسال SMS تنها وقتی manager + feature sms؛ recipient count فقط smsOptInها را می‌شمارد؛ مسیر segment و manual به `SmsSendModal` داده می‌شود.

**پذیرش:** تغییر segment thresholds، گروه خالی، customer بدون خرید، smsOptIn false، شماره normalize و محدودیت نقش را مرور کن. Segment از paid orders محاسبه می‌شود و فیلد segment را دستی ویرایش نکن.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
