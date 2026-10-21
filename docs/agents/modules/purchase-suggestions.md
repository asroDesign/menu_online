# پیشنهاد خرید بر پایه مصرف انبار

## کاربرد و دسترسی

صفحه `/dashboard/purchase-suggestions` در نقش warehouse یا manager و entitlement `purchase_suggestions` گزارش کمبود احتمالی را می‌دهد. هیچ فاکتور، PO، movement یا پرداختی خودکار ایجاد نمی‌کند.

## API و فرمول

`GET /api/reports/purchase-suggestions?lookbackDays=7|14|30|60&leadTimeDays=0..90&safetyDays=0..60` فقط tenant جاری را می‌خواند. منبع مصرف، movementهای `sale` در بازه است؛ ورود/خروج دستی و انتقال، مصرف واقعی محسوب نمی‌شوند.

- `avgDailyConsumption = soldConsumption / lookbackDays`.
- داده کافی: `max(0, average * (lead + safety) - onHand - confirmedIncoming)`.
- Purchase order مدل نشده، بنابراین `confirmedIncoming=0` و response این محدودیت را صریحاً اعلام می‌کند.
- اگر کمتر از سه رویداد مصرف یا مصرف صفر وجود داشته باشد: fallback شفاف `max(0, minStock * 2 - stock)` و flag `insufficientData`.
- خروجی مصرف، رویدادها، آخرین مصرف، روز قابل‌مصرف، مقدار پیشنهادی، هزینه تخمینی، انبار و زمان محاسبه را دارد؛ فقط اقلام با مقدار مثبت مرتب می‌شوند.

## نگهداری

UI در export `PurchaseSuggestions` از `src/modules/inventory.tsx` تعریف شده و route/nav در registry/sidebar است. گزارش read-only است؛ الگوریتم ساده و deterministic است، فصل/روز کاری و ضایعات تعدیل نشده‌اند، تأیید سفارش و تأمین‌کننده خودکار وجود ندارد. تست فرمول pure/static در regression suite؛ DB isolation/integration مستقل لازم است.

## دامنه اقلام — ۲۰۲۶-۱۰-۲۰

پیشنهاد خرید فقط اقلامی را شامل می‌شود که `inventory_items.track_stock=true` دارند؛ چون تقاضای پیش‌بینی‌شده از movementهای فروش خودکار ساخته می‌شود. اقلام با ردیابی فروش خاموش در stock-control و هشدارهای کمبود نیز کنار گذاشته می‌شوند، اما در صفحه فهرست موجودی و گردش دستی باقی می‌مانند. پس از خاموش‌کردن ردیابی، حرکت‌های فروش تاریخی در forecastهای بعدی مصرف نمی‌شوند.

## نقطه سفارش و وضعیت فعال — ۲۰۲۶-۱۰-۲۱

- کوئری پیشنهاد فقط قلم‌های `track_stock=true` و `is_active=true` را می‌گیرد. اقلام غیرفعال به‌عنوان موجودی تاریخی در انبار باقی می‌مانند اما در خروجی خرید پیشنهادی نمی‌آیند.
- در حالت داده ناکافی، هدف خرید `reorderPoint` است؛ اگر صفر باشد مقدار سازگار `2 × minStock` حفظ می‌شود. مقدار پیشنهادی برابر `max(0,target-stock)` است. با داده کافی، فرمول مصرف روزانه/زمان تأمین/ذخیره اطمینان unchanged است؛ reorderPoint فیلتر کمبود/هشدار نیست.
- `reorderPoint` در API و UI خروجی نمایش داده می‌شود. route فقط پیشنهاد read-only می‌دهد و order، فاکتور، supplier یا سندی ایجاد نمی‌کند.
