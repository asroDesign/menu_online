# اعلام صوتی سفارش

> مشخصات بازسازی ماژول `voice-pager` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/voice-pager`
- کامپوننت/منبع فعلی: `src/modules/hardware.tsx — VoicePager`
- entitlement تعرفه: `pager_voice`
- هدف: اعلام صوتی شماره سفارش آماده و ثبت تحویل.

## رابط و جریان کار

poll سفارش‌های ready هر چند ثانیه؛ کارت بزرگ شماره سفارش/میز/نوع و زمان؛ auto announce با تنظیم محلی و دکمه پخش دستی؛ دکمه تحویل‌شده.

## داده و API

GET /api/orders?status=ready&limit=50؛ PATCH /api/orders/:id {status:"served"}; SpeechSynthesis browser.

## قواعدی که بازنویسی باید حفظ کند

اعلان اتوماتیک قابل خاموش کردن و persist preference؛ فقط سفارش آماده؛ status transition سرور.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

این ماژول Web Speech API مرورگر است، نه دستگاه pager فیزیکی. هر ۵s GET `/api/orders?status=ready&limit=50`؛ ابتدا current IDs در Set نگه داشته می‌شوند تا initial items صوتی اعلام نشوند؛ سفارش جدید ready فقط یک بار خودکار گفته می‌شود اگر auto=true. `SpeechSynthesisUtterance("سفارش شماره N آماده تحویل است")`, lang `fa-IR`, rate 0.9. اگر SpeechSynthesis پشتیبانی نشود banner هشدار؛ دکمه آزمایش شماره ۱۲۳۴ برای permission/user activation.

هر card شماره درشت، mesa/type و age؛ دکمه manual announce، و تحویل‌شده PATCH `/api/orders/:id {status:"served"}` و remove local list. Auto toggle state محلی component است؛ source فعلی آن را localStorage persist نمی‌کند.

**پذیرش:** ابتدا ready موجود بی‌صدا؛ order جدید یک اعلان؛ repeated polls بی‌تکرار؛ auto off؛ manual; unsupported browser; cleanup interval و order served.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
