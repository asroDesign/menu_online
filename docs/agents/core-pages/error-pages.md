# خطا و ۴۰۴

> مشخصات بازسازی عامل برای صفحه/جریان عمومی یا سیستمی.

- مسیر: `error boundary and not-found`
- منبع فعلی: `src/app/error.tsx, src/app/global-error.tsx, src/app/not-found.tsx`
- هدف: حفظ UX هنگام خطای runtime یا مسیر ناموجود.

## رابط و جریان

صفحه عمومی فارسی با پیام کوتاه، retry/reset برای error boundary و لینک بازگشت؛ global error حداقل dependency؛ not-found status 404.

## API و داده

بدون API اختصاصی؛ ثبت JSON خطای UI با console.error در مرورگر؛ logging مرکزی از این کد احراز نمی‌شود.

## قواعد بازسازی

پیام/stack محرمانه به کاربر نده؛ recovery action واقعی؛ global error نیاز به html/body طبق Next.

برای schema دقیق و شرط‌های موجود، فایل‌های source و API بالا را بخوان. UI عمومی باید tenant-isolated، RTL و responsive باشد.

## مشخصات سطح پیاده‌سازی

### صفحات recovery

`not-found.tsx` پیام ۴۰۴ و لینک بازگشت به `/` دارد. `error.tsx` خطای segment را نمایش و `reset()` را برای تلاش مجدد اجرا می‌کند. `global-error.tsx` fallback بدون وابستگی به shell است و خودش `html` و `body` می‌سازد. خطاهای UI فعلی با `console.error` در مرورگر به‌صورت JSON شامل timestamp/event/message/digest نوشته می‌شوند؛ این به معنی وجود سامانه متمرکز log یا ارسال به سرور نیست.

### قواعد محرمانگی و تکمیل

به مشتری stack trace، جزئیات DB یا secrets نشان نده؛ digest فقط وقتی موجود است نمایش داده شود تا پشتیبانی بتواند آن را دریافت کند. اگر logging مرکزی لازم است، transport سروری/سرویس observability باید جدا طراحی شود؛ لاگ مرورگر قابل اعتماد و تضمین‌شده نیست. error boundary فقط خطاهای render را می‌گیرد؛ خطای async/API باید در همان فرم با پیام قابل فهم مدیریت شود. 404 واقعی باید از routeهای dynamic نیز برگشت داده شود، نه صرفاً متن 404 روی status 200.

