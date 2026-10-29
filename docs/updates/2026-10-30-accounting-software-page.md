# صفحهٔ حسابداری رستوران و نقشهٔ ماژول‌ها — ۲۰۲۶-۱۰-۳۰

## هدف

صفحهٔ `https://www.biameno.ir/accounting-software/` در Chrome بررسی شد. سکشن‌های اصلی معرفی شامل Hero با نمونه سند، مسئله‌های روزمره، گردش یک فروش، بخش‌های متصل، offline، فهرست قابلیت، دو نقش، امنیت، شروع و FAQ هستند. صفحهٔ تازهٔ MenuPeak در `/accounting-software` با همین نوع جریان محتوا و هویت بصری MenuPeak ساخته شد؛ فایل/تصویر اختصاصی سایت مرجع کپی نشده است.

## تغییرات رابط و SEO

- صفحهٔ public در `src/app/accounting-software/page.tsx` با metadata/canonical/OG/Twitter و JSON-LD ایجاد شد.
- `src/components/marketing/accounting-software-interactions.tsx` گردش ۴ مرحله‌ای و تب‌های صندوق، منوی QR، باشگاه، انبار، دفتر و خزانه را ارائه می‌کند. تب‌ها دسترس‌پذیرند و routeهای واقعی داشبورد را لینک می‌کنند. مقصد entitlement/role خودش را کنترل می‌کند.
- CSS responsive و reduced-motion در `src/app/accounting-software/accounting-software.module.css` اضافه شد.
- Header/Footer و sitemap به مسیر جدید پیوند دارند.
- سند نمونه در landing نمایشی است؛ اعداد آن fake financial data مشخص‌شده‌اند و هیچ API/DB را تغییر نمی‌دهند.

## کارکردهای موجود که به پنل لینک شدند

حسابداری دوبل و اسناد/دفاتر/تراز/صورت مالی/سال مالی/استهلاک؛ فروش/صندوق؛ موجودی و دستور تهیه؛ درآمد و هزینه؛ P&L و گزارش فروش؛ بانک/صندوق داخلی؛ دفتر چک؛ مطالبات؛ حقوق؛ دارایی. لینک‌ها به مسیرهای واقعی `/dashboard/...` می‌روند و صرفاً دمو هستند.

## موارد تطبیق‌نیافته از مرجع

مغایرت‌گیری خودکار صورتحساب بانکی، بودجه/پیش‌بینی جریان نقد، ثبت سهام شرکا و تقسیم سود، import مالی هلو/منطق/سپیدار/محک/Excel، اتصال مستقیم سامانه مؤدیان، گزارش چندشعبه‌ای تجمیعی و حسابداری کامل offline در مخزن پیدا نشد. هیچ‌کدام با داده/صفحهٔ mock به عنوان قابلیت واقعی جعل نشدند؛ FAQ صفحه اتصال مستقیم بانک/مؤدیان و offline را محدود می‌کند. برای توسعهٔ آن‌ها به specification و پیاده‌سازی backend، schema، مجوز، ثبت اتمیک، retry و تست مستقل نیاز است.

## فایل‌های تغییرکرده

- `src/app/accounting-software/page.tsx`
- `src/app/accounting-software/accounting-software.module.css`
- `src/components/marketing/accounting-software-interactions.tsx`
- `src/components/marketing/site-header.tsx`
- `src/components/marketing/site-footer.tsx`
- `src/app/sitemap.ts`
- `docs/ACCOUNTING.md`
- `docs/agents/core-pages/accounting-software.md`
- `docs/agents/modules/accounting.md`
- `docs/agents/README.md`
- `docs/agents/module-capabilities.md`
- `docs/updates/2026-10-30-accounting-software-page.md`
- `IMPLEMENTATION_STATUS.md`

## آزمون

نوع‌آزمایی `npm run typecheck -- --incremental false`، ESLint هدفمند صفحه، تعامل‌ها، Header/Footer و sitemap و `git diff --check` موفق شدند. Chrome روی `http://localhost:3000/accounting-software` صفحه و تمام سکشن‌ها را رندر کرد؛ درخت دسترس‌پذیری Hero، جدول دوبل، شش تب و CTAهای route واقعی را تأیید کرد. CSS breakpoint موبایل و reduced-motion اضافه شده است، اما visual QA در viewport موبایل اجرا نشد. Build تولیدی اجرا نشد؛ dev server از همان checkout و مسیر `.next` استفاده می‌کرد و متوقف نشد. دیتابیس، migration، پرداخت و سرویس خارجی لمس نشدند.

صفحهٔ عمومی به session/database وابسته نیست؛ از کپی دادهٔ مشتری واقعی به نمای نمایشی خودداری کنید.
