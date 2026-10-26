# گزارش بانک و صندوق

> مشخصات بازسازی ماژول `bank` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/bank`
- کامپوننت/منبع فعلی: `src/modules/finance.tsx — Bank`
- entitlement تعرفه: `bank_report`
- هدف: گردش حساب‌های بانکی/صندوق و مانده.

## رابط و جریان کار

کارت مانده، گردش ورودی/خروجی، انتخاب بازه و حساب؛ جدول تاریخ، شرح، نوع و مبلغ.

## داده و API

GET /api/r/report_bank?days=n؛ حساب‌ها از /api/r/bank.

## قواعدی که بازنویسی باید حفظ کند

مانده حاصل جمع گردش؛ حساب‌های tenant جدا؛ تاریخ و مبلغ با formatter مشترک.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

ماژول دو بخش دارد: `BankReport` و CRUD حساب‌ها. گزارش با default بازه ۳۰ روز، `/api/r/report_bank?days=n` می‌خواند: `accounts[{id|null,name,bank,accountNumber,opening,income,expense,balance}]`, total و recent transaction. KPI موجودی کل صندوق+حساب‌ها؛ کارت هر حساب balance و ورودی/خروجی؛ تا ۱۲ گردش اخیر. Range 7/14/30 روز فقط گزارش را تغییر می‌دهد.

CRUD `/api/r/bank` fields: name اجباری، bank، accountNumber LTR و openingBalance money default 0. `id:null` گزارش صندوق است؛ account null در `LedgerPage` نیز صندوق تلقی می‌شود. Registry readFeature برای bank_report/accounting/income_expense دارد، write role accountant (و مدیر)؛ با وجود دسترسی read، API write ممکن است برای نقش دیگر 403 برگرداند.

**پذیرش:** account list empty و report هنوز cash را نشان دهد؛ منفی بودن مانده، گردش اخیر، تغییر بازه، account numbers LTR و relationship ledger-to-account را حفظ کن.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.

## گزارش آفلاین Windows

تب «بانک و صندوق» snapshot tenant-scoped با مجوزهای `cashier_pos` و `bank_report` دارد: صندوق نقدی و حساب‌های بانکی، ماندهٔ آغازین و تجمعی، ورودی/خروجی ۳۰ روز اخیر و ۲۵ گردش آخر. مبلغ مانده از کل تراکنش‌های سرور جمع می‌شود تا با گزارش آنلاین هم‌راستا باشد؛ جریان ورودی/خروجی فقط ۳۰ روز اخیر است. شماره حساب در payload پیش از cache به `••••` و چهار رقم آخر ماسک می‌شود. Snapshot هفت روز اعتبار دارد و در SQLite رمز‌شدهٔ برنامه قرار می‌گیرد؛ worker هر ۱۰ دقیقه یا با درخواست دستی آن را تازه می‌کند. این نمای فقط‌خواندنی است؛ CRUD حساب، بازهٔ دلخواه، صفحه‌بندی گردش و ثبت/اصلاح تراکنش آفلاین نشده‌اند. جزئیات در [نقشه پوشش Windows آفلاین](offline-full-dashboard.md) و [گزارش تغییر](../../updates/2026-10-27-offline-bank-report.md) آمده است.
