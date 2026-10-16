# درآمد و هزینه

> مشخصات بازسازی ماژول `income-expense` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/income-expense`
- کامپوننت/منبع فعلی: `src/modules/finance.tsx — IncomeExpense / LedgerPage`
- entitlement تعرفه: `income_expense`
- هدف: دفتر روزنامه ساده برای درآمدهای متفرقه و هزینه‌های جاری.

## رابط و جریان کار

لیست ثبت‌ها با بازه تاریخ و جمع درآمد/هزینه/خالص؛ فرم ثبت نوع، مبلغ، دسته، حساب بانکی، تاریخ شمسی و شرح؛ حذف/ویرایش مجاز طبق API.

## داده و API

Resource-style LedgerPage روی /api/r/incomeexpense؛ bank accounts از /api/r/bank.

## قواعدی که بازنویسی باید حفظ کند

ورودی amount مثبت و kind/category معتبر؛ حساب بانکی optional و صندوق نقدی پیش‌فرض؛ فروش سفارش با این فرم دوباره ثبت نشود.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

این page از shared `LedgerPage` با endpoint `/api/r/incomeexpense` است؛ Accountancy double-entry نیست. رکورد `kind=income|expense`, `amount` تومان مثبت، `category`, nullable `bankAccountId`, `date`, `description`; bank field remote از `/api/r/bank` و انتخاب خالی یعنی «صندوق (نقدی)». date input جلالی با default امروز. جمع KPI بر اساس ردیف‌های بارگیری‌شده: درآمد، هزینه و خالص. جدول تاریخ، نوع با رنگ، category/source sale badge، description، accountName و amount علامت‌دار.

API scope `source <> 'sale'` دارد، پس sale-generated rows در ثبت دستی income/expense تکراری نمی‌شوند. writer role در registry accountant است (علاوه بر owner/manager)؛ فیلد amount باید حداقل ۱ باشد و post/unpost ledger دوطرفه در `withPosting` به‌صورت hook انجام می‌شود. تاریخ UI date-only را به ISO تبدیل می‌کند.

**پذیرش:** income/expense، cash و bank، روز شمسی، ثبت در حسابداری و حذف/ویرایش که posting قبلی را reverse/repost کند؛ ثبت source=sale را به UI دستی اجازه نده.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
