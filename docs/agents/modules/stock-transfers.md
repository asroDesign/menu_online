# انتقال کالا بین انبارها

## کاربرد

این capability در صفحه `/dashboard/stock-movements` به شکل panel مستقل نمایش داده می‌شود؛ slug داشبورد جداگانه ندارد. کاربر انبار درخواست چندقلمی را می‌سازد؛ مدیر درخواست را رد یا تأیید می‌کند. تأیید موجودی دو انبار را با دو movement متوازن تغییر می‌دهد.

## مدل/API

- `stock_transfers` سربرگ tenant، status pending/approved/rejected، توضیح، درخواست‌دهنده، تصمیم‌گیرنده و زمان‌ها را نگه می‌دارد.
- `stock_transfer_lines` به‌ازای هر ردیف، کالای مبدأ/مقصد و مقدار را ذخیره می‌کند.
- `POST /api/stock-transfers` با `requestKey` ایجاد؛ `GET` فهرست tenant؛ `PATCH` فقط action approve/reject مدیر.
- manager/warehouse می‌توانند درخواست کنند؛ manager تصمیم می‌گیرد. API اقلام را در همان کسب‌وکار، انبارها را متفاوت، نام/واحد را برابر، مقدار را مثبت و ردیف‌ها را یکتا/معتبر می‌کند.
- در تأیید transaction، سربرگ و اقلام lock می‌شوند؛ موجودی مبدأ در لحظه تصمیم دوباره چک می‌شود؛ هر دو مانده و دو سطر `stock_movements` جفت‌شده با movement type انتقال در همان transaction ثبت می‌شوند. درخواست تکراری اعمال دوم ندارد.
- migration `0017_stock_transfers.sql`; down عمدتاً داده عملیاتی تاریخچه را حفظ می‌کند.

## UI و نگهداری

component در `src/modules/inventory.tsx` پایین جدول گردش آمده و refresh اقلام/درخواست‌ها را بعد mutation انجام می‌دهد. request، موجودی را رزرو نمی‌کند؛ چند درخواست pending ممکن است جداگانه ساخته شوند، اما تأیید دومی در صورت کمبود رد می‌شود. transfer بین شعبه/tenant، حمل بین انبارهای شرکتی و گردش هزینه/حمل پیاده نشده. هزینه موجودی در دو سوی انتقال به روش هزینه‌ی فعلی اقلام وابسته است؛ برای تضمین تساوی ارزش در روش‌های costing پیچیده باید ADR لازم اضافه شود.

تست قرارداد lock، موجودی ناکافی و paired movements در `tests/security-regressions.test.cjs`; concurrency به PostgreSQL جدا نیاز دارد.
