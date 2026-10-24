# دسترسی منوی عمومی نمونه و رزرو میز — ۲۰۲۶-۱۰-۲۴

## مسئله

صفحهٔ `https://menupeak.ir/m/niloofar?template=captainm` با وجود وجود حساب/کسب‌وکار نیلوفر در سامانه، «این صفحه پیدا نشد» نشان می‌داد. در `src/app/m/[slug]/page.tsx` مسیر نمونه پیش از lookup کسب‌وکار، در صورت خاموش بودن `DEMO_MODE` به `notFound()` می‌رفت. همین flag برای ورود آزمایشی/seed حساب نمونه نیز استفاده می‌شود و نباید URL عمومی منوی یک tenant موجود را پنهان کند.

رزرو مشتری نیز برای slug نمونه به‌صورت جداگانه در route صفحه و هر دو endpoint عمومی availability/submit رد می‌شد. رابط سه‌مرحله‌ای رزرو از قبل وجود داشت، اما لینک و مسیر واقعی رزرو نمونه به کاربر نمی‌رسید.

## رفتار پس از تغییر

- `/m/niloofar` اکنون در هر حالت `DEMO_MODE`، کسب‌وکار موجود را با `getPublicMenu` می‌خواند. `ensureDemoData` فقط زمانی اجرا می‌شود که demo mode فعال است؛ با خاموش بودن آن، حساب نمونه یا دادهٔ آزمایشی تازه seed نمی‌شود.
- قالب معتبر query مثل `?template=captainm` فقط ظاهر را override می‌کند. کاتالوگ و تنظیمات متعلق به همان کسب‌وکار می‌مانند؛ منوی نمونه سفارش/checkout را نمی‌پذیرد.
- CTA رزرو در صفحهٔ معرفی و سربرگ منوی نمونه، در صورت `reservations` entitlement و `settings.reservations.enabled` ظاهر می‌شود. صفحهٔ رزرو همان مسیر سه‌مرحله‌ای پروژه را نشان می‌دهد: اطلاعات/نوع/زمان شمسی و تعداد مهمان، انتخاب میز با ظرفیت آزاد، سپس تأیید جزئیات.
- availability و ثبت رزرو برای نمونه از همان APIهای عمومی tenant استفاده می‌کنند. محدودیت نرخ، دسترسی feature، تنظیم فعال، بررسی ساعت کاری، محاسبهٔ پیش‌پرداخت سمت سرور، tenant isolation، قفل میزها و بازبینی تداخل در transaction حفظ می‌شوند. فعال‌کردن مسیر به معنی bypass پلن یا تنظیم مدیر نیست.

## فایل‌های تغییرکرده

- `src/app/m/[slug]/page.tsx`: جداسازی دسترسی منوی tenant از seed/ورود آزمایشی.
- `src/app/m/[slug]/reserve/page.tsx`: حذف 404 ویژهٔ slug نمونه.
- `src/app/api/public/[slug]/reservations/route.ts`: استفاده از guardهای مشترک عمومی به‌جای رد اختصاصی demo.
- `src/components/menu-client.tsx` و `src/components/public-menu-showcase.tsx`: حفظ CTA رزرو برای منوی نمونهٔ read-only، در صورت entitlement.
- `src/lib/demo-mode.ts`: توضیح مرز رفتاری demo mode.
- `docs/agents/core-pages/public-menu.md`, `docs/agents/core-pages/public-reservation.md`, `docs/agents/modules/reservations.md`, `docs/agents/README.md`, `IMPLEMENTATION_STATUS.md`: قرارداد و وضعیت تازه.

## بررسی و محدودیت

`npm run typecheck`, ESLint هدفمند، build production و `git diff --check` اجرا می‌شوند. ثبت رزرو واقعی انجام نمی‌شود. این تغییر در مسیر وب/API است و به migration تازه نیاز ندارد. URL زنده پیش از push همچنان کد نسخهٔ قبلی را اجرا می‌کند؛ بعد از deploy باید صفحهٔ `niloofar` و entitlement رزرو روی همان کسب‌وکار دوباره بررسی شوند. اگر `getPublicMenu` پس از رفع guard هنوز `null` بدهد، رکورد موجود ممکن است تعلیق‌شده یا پلن آن `pending` بدون trial معتبر باشد؛ این حالت مستقل از demo login است و عمداً همچنان 404 می‌ماند.
