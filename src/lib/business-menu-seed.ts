import { db as database } from "@/db";
import { categories, products } from "@/db/schema";
import { businessMenuTemplate } from "@/lib/business-menu-template";

type Executor = typeof database;

/** Seed a private, editable starter menu for a newly-created business inside its registration transaction. */
export async function seedBusinessMenuTemplate(tx: Executor, businessId: number, businessType: string) {
  const template = businessMenuTemplate(businessType);
  const createdCategories = await tx.insert(categories).values(template.map((category, sortOrder) => ({
    businessId,
    name: category.name,
    emoji: category.emoji,
    sortOrder,
    isActive: true,
  }))).returning({ id: categories.id, name: categories.name });
  const categoryIds = new Map(createdCategories.map((category) => [category.name, category.id]));
  const starterProducts = template.flatMap((category) => category.products.map((product) => ({
    businessId,
    categoryId: categoryIds.get(category.name) ?? null,
    name: product.name,
    description: product.description,
    emoji: product.emoji,
    prepMinutes: product.prepMinutes,
    price: 0,
    isAvailable: false,
    isFeatured: false,
  })));
  if (starterProducts.length) await tx.insert(products).values(starterProducts);
  return { categories: createdCategories.length, products: starterProducts.length };
}
