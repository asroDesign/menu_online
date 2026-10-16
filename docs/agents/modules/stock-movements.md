# گردش و فاکتور انبار

> مشخصات بازسازی ماژول `stock-movements` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/stock-movements`
- کامپوننت/منبع فعلی: `src/modules/inventory.tsx — StockMovements`
- entitlement تعرفه: `stock_movements`
- هدف: ثبت و مرور خرید چندقلمی، خروج، ضایعات، تعدیل و مصرف فروش.

## رابط و جریان کار

فیلتر همه/in/out/waste/adjust/sale؛ جدول زمان/ماده/مقدار+/−/مانده پس از گردش/شماره رسید و فاکتور/سند حسابداری/شرح؛ StockReceiptEditor چندردیفی؛ بعد از ثبت رسید و لینک سند.

## داده و API

GET /api/r/stock؛ اقلام /api/r/items؛ ثبت فاکتور از StockReceiptEditor که receipt چند قلم، جمع فاکتور، supplier, invoiceNo و تاریخ می‌فرستد؛ stockcount API جداست.

## قواعدی که بازنویسی باید حفظ کند

رسید خرید باید در transaction اتمیک موجودی و سند حسابداری را به‌روزرسانی کند؛ ردیف‌ها و جمع فاکتور server-check؛ گردش sale خودکار و تکرارناپذیر.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

این route audit trail موجودی و فاکتور است. تب‌های `all,in,out,waste,adjust,sale`; movement row شامل زمان، item، type label/color، delta sign، balanceAfter، receiptId/total، سند حسابداری، supplierName، invoiceNo و note. برای رسید چندقلمی هر ردیف ممکن است همان receiptId/total/docId را داشته باشد. بعد از ذخیره banner رسید شماره، جمع مبلغ و link `/print/doc/:documentId` را نشان می‌دهد؛ modal از `StockReceiptEditor` باز می‌شود.

`StockReceiptEditor` در `src/components/stock-receipt-editor.tsx` حداکثر ۱۰۰ line؛ یک item در یک receipt فقط یک‌بار؛ کالای موجود یا `newItem` با name/unit/warehouse/minStock؛ quantity decimal و در خرید unitCost. خرید نیازمند invoiceTotal ورودی و تطابق دقیق آن با `sum(quantity*unitCost)-discount+extraCost`. `paid` خالی یعنی تسویه کامل؛ payable یعنی صفر پرداخت و ثبت debt نیاز به supplier. انواع in/out/waste/adjust؛ date شمسی و payload date ساعت ۱۲:۰۰ تهران. POST `/api/r/stock` با requestKey fingerprint idempotent.

سرور باید تمام خطوط + inventory changes + account document را transaction کند: خطا یعنی هیچ line/movement/stock تغییر نمی‌کند. تخفیف/حمل به نسبت lines در cost سرمایه‌ای می‌شود. خروج/ضایعات بیش از stock هشدار می‌دهد؛ rule نهایی را در backend هم بگیر.

**پذیرش:** invoice 1+ line، new item، partial pay، payable supplier، mismatch، retry همان body (بدون duplicate)، invoice print link و out/waste/adjust/date Persian.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
