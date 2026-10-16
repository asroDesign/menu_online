import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicPost } from "@/lib/marketing-content";
import { RichContent, SiteFooter } from "@/components/marketing/rich-content";

export const dynamic = "force-dynamic";
const base = process.env.NEXT_PUBLIC_SITE_URL || "https://menudigital.ir";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const post = await getPublicPost(slug); if (!post) return { title: "مقاله پیدا نشد" };
  const title = post.metaTitle || post.title, description = post.metaDescription || post.excerpt;
  const canonical = post.canonicalUrl || `/blog/${post.slug}`;
  return { metadataBase: new URL(base), title, description, alternates: { canonical }, robots: post.noIndex ? { index: false, follow: true } : undefined, openGraph: { type: "article", title, description, url: canonical, publishedTime: post.publishedAt?.toISOString(), authors: [post.author], images: post.coverImage ? [post.coverImage] : [] }, twitter: { card: "summary_large_image", title, description, images: post.coverImage ? [post.coverImage] : [] } };
}
function jsonLd(value: unknown) { return { __html: JSON.stringify(value).replace(/</g, "\\u003c") }; }
export default async function BlogArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const post = await getPublicPost(slug); if (!post) notFound();
  const canonical = post.canonicalUrl || new URL(`/blog/${post.slug}`, base).toString();
  const structured = { "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.metaDescription || post.excerpt, image: post.coverImage ? [new URL(post.coverImage, base).toString()] : undefined, datePublished: post.publishedAt?.toISOString(), dateModified: post.updatedAt.toISOString(), author: { "@type": "Organization", name: post.author }, mainEntityOfPage: canonical, keywords: post.tags.join(", ") };
  return <main className="min-h-dvh bg-base-100"><script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structured)}/><article className="mx-auto max-w-4xl px-5 py-10 sm:py-16"><Link href="/blog" className="text-sm font-bold text-primary">← همه مقاله‌ها</Link><header className="mt-7"><span className="badge badge-primary badge-outline">{post.category}</span><h1 className="mt-4 text-3xl font-black leading-[1.5] sm:text-5xl">{post.title}</h1><p className="mt-5 text-lg leading-9 text-base-content/70">{post.excerpt}</p><div className="mt-5 flex flex-wrap gap-3 text-xs text-base-content/55"><span>{post.author}</span><time dateTime={post.publishedAt?.toISOString()}>{post.publishedAt?.toLocaleDateString("fa-IR")}</time></div>{post.coverImage && <img src={post.coverImage} alt={post.title} className="mt-8 max-h-[520px] w-full rounded-3xl object-cover"/>}</header><div className="mt-10"><RichContent content={post.content}/></div><div className="mt-12 flex flex-wrap gap-2">{post.tags.map(t=><span key={t} className="badge badge-outline">#{t}</span>)}</div></article><SiteFooter/></main>;
}
