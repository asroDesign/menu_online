# پیامک

> مشخصات بازسازی ماژول `sms` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/sms`
- کامپوننت/منبع فعلی: `src/modules/sms.tsx — SmsPanel`
- entitlement تعرفه: `sms`
- هدف: تنظیم gateway پیامک، قالب‌ها، کمپین، ارسال زمان‌دار و گزارش.

## رابط و جریان کار

تب‌های تنظیمات و تست اتصال، قالب پیام، کمپین‌ها/مخاطبان/زمان‌بندی، اجرای خودکار، لاگ delivery؛ poll کمپین/لاگ؛ نمایش تعداد موفق و ناموفق.

## داده و API

GET/PATCH /api/business settings.sms؛ CRUD /api/r/smstemplates؛ POST /api/r/smstest؛ GET/POST /api/r/smscampaigns؛ POST /api/r/smsauto؛ GET /api/r/smslogs؛ cron /api/cron/sms?key=CRON_SECRET.

## قواعدی که بازنویسی باید حفظ کند

کلید API فقط از سرور و ماسک‌شده؛ ارسال bulk محدود/rate-limited؛ وضعیت simulated باید آشکار باشد؛ schedule با timezone ایران هماهنگ شود.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

صفحه شامل tabهای campaigns، retention، templates، auto، settings و logs است. Config از `business.settings.sms` می‌آید و `apiKeySet` فقط boolean وضعیت secret است؛ raw api key را GET نمی‌کند. provider گزینه `kavenegar|smsir`; سرور secret را نگه می‌دارد. Settings شامل provider/key/sender و ارسال تست با یک قالب و شماره موبایل است. بدون key tabهای غیرتنظیمات هشدار عدم اتصال می‌دهند. تب retention بخشی از ماژول SMS و مصرف‌کنندهٔ همان template/provider است؛ workflow مستقل ارسال موازی نساز.

قالب‌ها `purpose,title,templateId,params[{name,var}],sampleText,isActive` هستند؛ pattern template provider-specific. Campaign شامل title/template/audience/code/discount/numbers و ارسال فوری یا schedule شمسی+ساعت؛ audienceها all, VIP, inactive, segmentها, birthday_month, manual هستند. Campaign list نشان تعداد گیرنده/موفق/ناموفق و وضعیت scheduled/sending/sent/failed؛ کمپین زمان‌بندی‌شده قابل لغو. تب خودکار تولد: enabled, templateId, code/discount؛ روز تولد بر اساس تقویم شمسی سالی یک بار. دکمه اجرای دستی `/api/r/smsauto`، cron نیز `/api/cron/sms?key=CRON_SECRET`; logها از `/api/r/smslogs` هر ۸ ثانیه poll.

**پذیرش:** secret masked/بدون بازتاب؛ تست provider؛ template غیرفعال حذف از انتخاب؛ زمان‌بندی آینده؛ audience consent؛ provider disconnected؛ sent/failed count؛ و schedule در timezone تهران.

اتوماسیون بازگشت مشتری و قرارداد دقیق آن در [راهنمای بازگشت مشتری](sms-retention.md) آمده است. این تب trigger عدم خرید، ورود/خروج از segment، cooldown، سقف ماهانه، recheck رضایت/موبایل در لحظه ارسال، توقف بعد از خرید، retry محدود و گزارش انتساب last-touch دارد. نتیجه نامشخص شبکه خودکار retry نمی‌شود تا ارسال تکراری ایجاد نشود؛ وضعیت `uncertain` برای پیگیری مدیر حفظ می‌شود.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
