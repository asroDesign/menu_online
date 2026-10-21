import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { categories, products } from "@/db/schema";

export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function catalogSnapshot(query: any, businessId: number) {
  const [productRows, categoryRows] = await Promise.all([
    query.select().from(products).where(eq(products.businessId, businessId)).orderBy(asc(products.id)),
    query.select().from(categories).where(eq(categories.businessId, businessId)).orderBy(asc(categories.id)),
  ]);
  return digest(JSON.stringify({ products: productRows, categories: categoryRows }));
}
