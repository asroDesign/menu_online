# ترجمه منو

> مشخصات بازسازی ماژول `translations` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/translations`
- کامپوننت/منبع فعلی: `src/modules/growth-b.tsx — Translations`
- entitlement تعرفه: `translation`
- هدف: ترجمه نام و توضیح دسته/محصول برای زبان‌های فعال منو.

## رابط و جریان کار

انتخاب زبان پشتیبانی‌شده از settings.languages؛ فهرست دسته‌ها و محصولات؛ فیلد ترجمه نام و توضیح، ذخیره برای entity انتخاب‌شده.

## داده و API

GET /api/categories, /api/products؛ GET /api/business settings.languages؛ GET /api/r/translations?lang=؛ POST /api/r/translations {entityType,entityId,lang,name,description}.

## قواعدی که بازنویسی باید حفظ کند

شناسه entity باید tenant-scoped باشد؛ ترجمه جایگزین متن اصلی فقط وقتی موجود است؛ language از زبان‌های فعال انتخاب شود.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

زبان‌ها در `business.settings.languages` هستند؛ `fa` همیشه default و دکمه‌اش disabled است. زبان‌های دیگر از `LANGS` روشن/خاموش می‌شوند و تغییر فوراً PATCH می‌شود؛ خطا state محلی را rollback می‌کند. اگر زبان فعال جاری خاموش شد، active non-fa اول یا `en` انتخاب می‌شود. selector زبان و tab محصولات/دسته‌بندی‌ها فهرست را عوض می‌کند.

ترجمه با key `${entityType}:${entityId}` خوانده می‌شود. product rows نام اصلی/توضیح و دو input translated name/description دارند؛ category فقط name translation دارد. input بر اساس `LANGS[lang].dir` جهت می‌گیرد و save روی blur اتفاق می‌افتد، نه هر keystroke. progress `name` موجود را شمرده و می‌گوید N از کل ترجمه شده؛ متن UI نیز auto-save هنگام خروج از فیلد را ذکر می‌کند.

**پذیرش:** تغییر زبان/tab، نبود زبان دوم، ترجمه ناقص (name خالی حساب نمی‌شود)، blur بدون تغییر (درخواست نفرست)، error rollback/feedback، و entityهای جدید بعد از بارگذاری را پوشش بده.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
