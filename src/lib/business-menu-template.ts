export type BusinessMenuType = "cafe" | "restaurant" | "fastfood" | "bakery" | "shop";

export type MenuTemplateProduct = {
  name: string;
  description: string;
  emoji: string;
  prepMinutes: number;
};

export type MenuTemplateCategory = {
  name: string;
  emoji: string;
  products: MenuTemplateProduct[];
};

const draft = (name: string, emoji: string, prepMinutes = 10): MenuTemplateProduct => ({
  name,
  emoji,
  prepMinutes,
  description: "نمونهٔ اولیهٔ منو؛ پیش از انتشار، قیمت و جزئیات این محصول را تکمیل کنید.",
});

const templates: Record<BusinessMenuType, MenuTemplateCategory[]> = {
  cafe: [
    { name: "قهوه گرم", emoji: "", products: [draft("اسپرسو نمونه", "", 4), draft("لاته نمونه", "", 6)] },
    { name: "نوشیدنی سرد", emoji: "", products: [draft("آیس‌لاته نمونه", "", 5), draft("لیموناد نمونه", "", 5)] },
    { name: "صبحانه", emoji: "", products: [draft("صبحانه نمونه", "", 12)] },
    { name: "کیک و دسر", emoji: "", products: [draft("کیک روز نمونه", "", 3)] },
  ],
  restaurant: [
    { name: "غذاهای ایرانی", emoji: "", products: [draft("چلوخورش نمونه", "", 20), draft("چلوکباب نمونه", "", 20)] },
    { name: "پیش‌غذا", emoji: "", products: [draft("سوپ روز نمونه", "", 10), draft("سالاد فصل نمونه", "", 8)] },
    { name: "نوشیدنی", emoji: "", products: [draft("نوشابه نمونه", "", 2), draft("دوغ نمونه", "", 2)] },
    { name: "دسر", emoji: "", products: [draft("دسر روز نمونه", "", 3)] },
  ],
  fastfood: [
    { name: "برگر", emoji: "", products: [draft("همبرگر نمونه", "", 12), draft("چیزبرگر نمونه", "", 14)] },
    { name: "پیتزا", emoji: "", products: [draft("پیتزا سبزیجات نمونه", "", 18), draft("پیتزا مخصوص نمونه", "", 20)] },
    { name: "ساندویچ", emoji: "", products: [draft("ساندویچ مرغ نمونه", "", 10)] },
    { name: "نوشیدنی و مخلفات", emoji: "", products: [draft("سیب‌زمینی نمونه", "", 8), draft("نوشابه نمونه", "", 2)] },
  ],
  bakery: [
    { name: "نان", emoji: "", products: [draft("نان روز نمونه", "", 5), draft("نان حجیم نمونه", "", 5)] },
    { name: "شیرینی", emoji: "", products: [draft("شیرینی خشک نمونه", "", 2), draft("شیرینی تر نمونه", "", 2)] },
    { name: "کیک", emoji: "", products: [draft("کیک ساده نمونه", "", 3)] },
    { name: "نوشیدنی", emoji: "", products: [draft("قهوه نمونه", "", 5)] },
  ],
  shop: [
    { name: "خواربار", emoji: "", products: [draft("کالای خواربار نمونه", "", 1)] },
    { name: "نوشیدنی", emoji: "", products: [draft("نوشیدنی نمونه", "", 1)] },
    { name: "تنقلات", emoji: "", products: [draft("تنقلات نمونه", "", 1)] },
    { name: "بهداشتی", emoji: "", products: [draft("کالای بهداشتی نمونه", "", 1)] },
  ],
};

export function businessMenuTemplate(type: string): MenuTemplateCategory[] {
  const selected = templates[type as BusinessMenuType] ?? templates.restaurant;
  return selected.map((category) => ({ ...category, products: category.products.map((product) => ({ ...product })) }));
}
