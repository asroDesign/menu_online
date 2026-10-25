export type PairingProduct = { id: number; name: string; categoryName?: string | null };
export type PairingReason = "drink_pairing" | "food_pairing";

export function classifyMenuProduct(product: PairingProduct): "food" | "drink" | null {
  const text = `${product.categoryName ?? ""} ${product.name}`
    .toLocaleLowerCase("fa-IR")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\s_-]+/g, "");
  const contains = (words: string[]) => words.some((word) => text.includes(word.replace(/[\u200c\s_-]+/g, "")));
  const drinks = ["نوشیدنی", "آبمیوه", "لیموناد", "قهوه", "اسپرسو", "کاپوچینو", "لاته", "موکا", "چای", "دمنوش", "شیک", "اسموتی", "نوشابه", "دوغ", "آیس تی", "drink", "beverage", "coffee", "espresso", "tea", "juice", "soda", "smoothie"];
  const foods = ["غذا", "خوراک", "صبحانه", "ناهار", "شام", "پیتزا", "برگر", "همبرگر", "ساندویچ", "کباب", "جوجه", "سالاد", "پاستا", "سوخاری", "سیب زمینی", "دسر", "کیک", "شیرینی", "food", "meal", "pizza", "burger", "sandwich", "salad", "pasta", "kebab", "dessert", "cake"];
  if (contains(drinks)) return "drink";
  if (contains(foods)) return "food";
  return null;
}

/** Suggests the missing side of a food/drink pair only when the cart has one side. */
export function foodDrinkPairingReason(cart: PairingProduct[], candidate: PairingProduct): PairingReason | null {
  const kinds = new Set(cart.map(classifyMenuProduct).filter((kind): kind is "food" | "drink" => kind !== null));
  const candidateKind = classifyMenuProduct(candidate);
  if (kinds.has("food") && !kinds.has("drink") && candidateKind === "drink") return "drink_pairing";
  if (kinds.has("drink") && !kinds.has("food") && candidateKind === "food") return "food_pairing";
  return null;
}
