# روشن‌شدن پس‌زمینهٔ پیش‌نمایش انبار و قیمت

تاریخ: ۲۰۲۶-۱۰-۳۰

در صحنهٔ «انبار و قیمت» از سکشن پیش‌نمایش امکانات MenuPeak، پس‌زمینهٔ پنل و کارت‌های سه مرحلهٔ سفارش، دستور تهیه و موجودی به تم روشن تغییر کرد. متن تیره و سطوح سفید/خاکستری روشن کنتراست خواناتری می‌سازند؛ نشانه‌های آبی/سبز و هشدار کمبود کهربایی حفظ شده‌اند.

تغییر فقط در `src/components/marketing/home.css` و selectorهای محدود به `.hp-dashboard.is-costing` انجام شد. صحنه‌های دیگر preview، منطق انبار و قیمت، API، داده و دیتابیس تغییری نکردند. قرارداد ظاهری در `docs/agents/home-page.md` و `IMPLEMENTATION_STATUS.md` ثبت شد.

اعتبارسنجی: ESLint فایل `src/components/marketing/homepage-showcase.tsx`، TypeScript، `git diff --check` و بررسی صحنه در Chrome محلی.
