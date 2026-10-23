# تیکت پشتیبانی

> مشخصات بازسازی ماژول `tickets` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/tickets`
- کامپوننت/منبع فعلی: `src/modules/growth-b.tsx — Tickets`
- entitlement تعرفه: `support`
- هدف: گفت‌وگوی رستوران با پشتیبانی سامانه.

## رابط و جریان کار

فهرست تیکت polling 15s، موضوع/اولویت/دپارتمان/وضعیت؛ فرم ساخت؛ thread با تاریخچه پیام؛ پاسخ و تغییر status؛ شماره/ایمیل/ساعت پشتیبانی از announcement.

## داده و API

GET/POST /api/r/tickets؛ GET/PATCH /api/r/tickets/:id؛ GET /api/announcements.

## قواعدی که بازنویسی باید حفظ کند

tenant isolation؛ متن پیام safe-render؛ ایجاد یا پاسخ بدون از دست دادن thread؛ status transitions با سرور کنترل شود.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Ticket fields: subject/status/priority/department/updatedAt/messageCount/lastMessage؛ thread messages شامل authorRole/name/body/createdAt. List poll هر ۱۵ ثانیه و status `open|answered|closed`. بالای صفحه کانال تماس/ایمیل/ساعت از `/api/announcements` است. Desktop دو ستون (لیست ~360px و conversation)، موبایل باید راه بازگشت از thread به list داشته باشد تا چت از viewport خارج نشود.

فرم create شامل subject, department از `TICKET_DEPTS` (به‌جز management)، priority low/normal/high و body است؛ subject/body اجباری. POST result را ابتدای list می‌گذارد و همان ticket را باز می‌کند. انتخاب ticket GET thread را صدا می‌زند؛ پیام user و پاسخ پشتیبانی سمت‌های متفاوت؛ message system centered. reply فقط تا status غیر closed؛ PATCH `{reply,status?}`، دکمه close می‌تواند status=closed بدون reply ارسال کند. بعد از پاسخ thread و list refresh می‌شوند.

**پذیرش:** thread خالی/ناموجود، ticket closed، send disabled با reply blank، create busy، status update، پیام system و responsive return/list را پوشش بده.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.

## فهرست تیکت‌های پنل مدیر کل

- پیاده‌سازی جاری این نما در `src/components/admin/tickets.tsx` و در بخش تیکت‌های پوستهٔ `src/components/admin/shell.tsx` است؛ مسیر فعال را از تب مدیر و hash آن تشخیص بده.
- دسکتاپ وضعیت، کارشناس و جست‌وجو را در یک ردیف نگه می‌دارد؛ جست‌وجو فضای باقیمانده را می‌گیرد و دو select عرض ثابت دارند.
- موبایل همان کنترل‌ها را پشت دکمهٔ فیلتر آیکنی نشان می‌دهد. دکمه `aria-expanded` و `aria-controls` دارد و نشان کوچک تعداد فیلترهای فعال را نمایش می‌دهد.
- فیلترها به query list موجود وصل‌اند و تغییرشان همان فهرست تیکت را به‌روز می‌کند؛ تغییر چیدمان نباید منطق دسترسی، API یا polling را عوض کند.
