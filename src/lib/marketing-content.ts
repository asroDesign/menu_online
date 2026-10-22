import { asc, and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { blogPosts, faqs, testimonials, tutorials } from "@/db/schema";

export async function getPublicPosts(limit = 100) {
  return db.select().from(blogPosts).where(eq(blogPosts.status, "published")).orderBy(desc(blogPosts.publishedAt), desc(blogPosts.id)).limit(limit);
}
export async function getPublicPost(slug: string) {
  const [post] = await db.select().from(blogPosts).where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published"))).limit(1);
  return post ?? null;
}
export async function getPublicFaqs(limit = 200) {
  return db.select().from(faqs).where(eq(faqs.isPublished, true)).orderBy(asc(faqs.sortOrder), asc(faqs.id)).limit(limit);
}
export async function getPublicTestimonials(limit = 12) {
  return db.select().from(testimonials).where(eq(testimonials.isPublished, true)).orderBy(asc(testimonials.sortOrder), desc(testimonials.id)).limit(limit);
}
export async function getPublicTutorials(limit = 200) {
  return db.select().from(tutorials).where(eq(tutorials.status, "published")).orderBy(asc(tutorials.sortOrder), desc(tutorials.publishedAt), desc(tutorials.id)).limit(limit);
}
export async function getPublicTutorial(slug: string) {
  const [tutorial] = await db.select().from(tutorials).where(and(eq(tutorials.slug, slug), eq(tutorials.status, "published"))).limit(1);
  return tutorial ?? null;
}
