# نمایش سه‌بعدی

> مشخصات بازسازی ماژول `ar` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/ar`
- کامپوننت/منبع فعلی: `src/modules/growth-b.tsx — ArPage`
- entitlement تعرفه: `ar`
- هدف: مدیریت فایل/model سه‌بعدی محصولات برای مشاهده AR.

## رابط و جریان کار

لیست محصولات، ثبت/ویرایش URL مدل 3D هر محصول و وضعیت تکمیل؛ public product detail می‌تواند مدل را نمایش دهد.

## داده و API

GET /api/products؛ PATCH محصول از /api/products/:id با arModelUrl؛ نمایشگر مشترک src/components/model-viewer.tsx.

## قواعدی که بازنویسی باید حفظ کند

URL باید معتبر و محتوای مجاز باشد؛ در صورت نبود پشتیبانی viewer fallback تصویری/متنی نشان دهد؛ فقط مدل همان tenant قابل تنظیم.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

فهرست محصولات از `/api/products` می‌آید؛ برای هر محصول thumbnail، نام، URL `arModelUrl`, badge AR فعال و input LTR با draft محلی نمایش داده می‌شود. دکمه ذخیره فقط وقتی draft با مقدار اصلی متفاوت است فعال؛ PATCH از طریق `products.update(productId,{arModelUrl:trimmed})` انجام می‌شود و draft پس از موفقیت حذف می‌شود. Preview فقط برای محصولی که URL ذخیره‌شده دارد باز می‌شود.

modal عنوان نام محصول دارد و `ModelViewer` GLB/GLTF را نشان می‌دهد. پس از save public menu item باید امکان بازکردن همان viewer را داشته باشد (جزئیات public menu در guide جداگانه). `arModelUrl` محصول متعلق به business جاری است.

**پذیرش:** URL خالی، draft unsaved، load fail مدل، modal close، محصول بدون مدل و موبایل را پوشش بده؛ اگر WebGL/model load fail است fallback error/retry داشته باش.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
