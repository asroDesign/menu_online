# انبارداری

> مشخصات بازسازی ماژول `inventory` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/inventory`
- کامپوننت/منبع فعلی: `src/modules/inventory.tsx — Inventory`
- entitlement تعرفه: `inventory`
- هدف: مدیریت اقلام مصرفی، انبارها و موجودی خریداری‌شده.

## رابط و جریان کار

ResourcePage اقلام با نام، واحد، انبار، حداقل موجودی؛ summary تعداد/ارزش/کمبود؛ CRUD انبارها؛ دکمه ثبت فاکتور چندقلمی باز می‌کند StockReceiptEditor؛ موجودی/هشدار رنگی.

## داده و API

GET/CRUD /api/r/items؛ GET/CRUD /api/r/warehouses؛ فاکتور از component StockReceiptEditor و /api/r/stock.

## قواعدی که بازنویسی باید حفظ کند

تعریف قلم به تنهایی stock وارد نمی‌کند؛ هر ورود/خروج باید گردش ثبت کند؛ ارزش موجودی max(stock,0)*cost؛ کالاهای کم‌تر یا برابر حداقل هشدار شوند.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Item fields: `name,unit,stock,minStock,costPerUnit,warehouseId`. `ResourcePage` فقط metadata را تعریف می‌کند (name اجباری؛ unit از kg/g/liter/number/pack/carton؛ warehouse remote؛ حداقل موجودی). موجودی و cost از movementها می‌آیند؛ فرم تعریف کالا نباید stock را خودسرانه افزایش دهد. بالای صفحه تعداد items، موجودی ارزش‌گذاری‌شده `sum(max(0,stock)*costPerUnit)` و تعداد `stock<=minStock` را نشان می‌دهد؛ table ستون ماده/انبار، stock+unit+warning، minimum, unit cost, value.

Warehouse chips از `/api/r/warehouses`؛ افزودن نام با Enter/Button؛ حذف مستقیم ممکن است server رفض کند اگر FK/داده وابسته دارد. Action ثبت رسید فقط با feature stock_movements دیده می‌شود و `StockReceiptEditor` را می‌گشاید. API registry warehouse/items نویسندگی warehouse-role دارد؛ readFeature برای warehouses/items شامل stock movement/control/recipes/costing. item دارای stock غیرصفر اجازه تغییر مستقیم unit/warehouse/cost ندارد و دارای stock یا history حذف نمی‌شود.

**پذیرش:** item بدون warehouse، حداقل صفر، under-min برابر، stock منفی برای valuation clamp، duplicate name/validation، تغییر unit در stock موجود، و خطای حذف را پوشش بده.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
