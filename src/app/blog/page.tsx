import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import Link from "next/link";
import { getPublicPosts } from "@/lib/marketing-content";
import { SiteFooter } from "@/components/marketing/rich-content";

export const metadata: Metadata = { metadataBase: new URL(getSiteUrl()), title: "وبلاگ | منوی دیجیتال", description: "راهنماها، تجربه‌ها و نکات کاربردی برای مدیریت کافه، رستوران و فروش آنلاین." };
export const dynamic = "force-dynamic";
export default async function BlogPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 80) ?? "";
  const category = params.category?.trim().slice(0, 80) ?? "";
  const all = await getPublicPosts(300);
  const categories = [...new Set(all.map(x => x.category))];
  const items = all.filter(x => (!category || x.category === category) && (!q || `${x.title} ${x.excerpt} ${x.content} ${x.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  return <main className="min-h-dvh bg-base-200/40"><header className="bg-gradient-to-br from-primary to-primary/80 px-5 py-16 text-primary-content"><div className="mx-auto max-w-6xl"><p className="text-sm font-bold">یاد بگیرید، رشد کنید</p><h1 className="mt-2 text-4xl font-black">وبلاگ منوی دیجیتال</h1><p className="mt-4 max-w-2xl leading-8 opacity-85">راهنماهای عملی برای بهتر کردن تجربه مشتری و مدیریت کسب‌وکار.</p><form className="mt-6 flex max-w-xl gap-2"><input name="q" defaultValue={q} placeholder="جستجو در مقاله‌ها" className="input input-bordered flex-1 bg-base-100 text-base-content"/>{category && <input type="hidden" name="category" value={category}/>}<button className="btn btn-neutral">جستجو</button></form></div></header>
  <section className="mx-auto max-w-6xl px-5 py-10"><div className="mb-6 flex flex-wrap gap-2"><Link href={q ? `/blog?q=${encodeURIComponent(q)}` : "/blog"} className={`badge badge-lg ${!category ? "badge-primary" : "badge-outline"}`}>همه</Link>{categories.map(c=><Link key={c} href={`/blog?category=${encodeURIComponent(c)}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`badge badge-lg ${category === c ? "badge-primary" : "badge-outline"}`}>{c}</Link>)}</div>{items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map(post=><article key={post.id} className="card overflow-hidden bg-base-100 shadow-sm ring-1 ring-base-300"><Link href={`/blog/${post.slug}`} className="block">{post.coverImage ? <img src={post.coverImage} alt={post.title} className="aspect-[16/9] w-full object-cover"/> : <div className="grid aspect-[16/9] place-items-center bg-primary/10 text-4xl text-primary">✦</div>}<div className="card-body"><div className="flex items-center justify-between text-xs text-base-content/55"><span>{post.category}</span><time dateTime={post.publishedAt?.toISOString()}>{post.publishedAt?.toLocaleDateString("fa-IR")}</time></div><h2 className="card-title mt-2">{post.title}</h2><p className="line-clamp-3 text-sm leading-7 text-base-content/70">{post.excerpt}</p><span className="mt-3 text-sm font-bold text-primary">ادامه مقاله ←</span></div></Link></article>)}</div> : <div className="rounded-3xl bg-base-100 p-12 text-center text-base-content/60">مقاله‌ای با این فیلتر پیدا نشد.</div>}</section><SiteFooter/></main>;
}
