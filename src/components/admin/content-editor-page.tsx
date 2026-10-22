"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenText, ExternalLink, FileText, ImagePlus, Save, SearchCheck, Video } from "lucide-react";
import { api } from "@/lib/api";
import { usePlatformBranding } from "@/components/brand";
import { Badge, Button, Card, Field, Icon, Input, Select, Skeleton, ToastProvider, useToast } from "@/components/ui";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { brandThemeStyle } from "@/lib/brand-color";

type Kind = "posts" | "tutorials";
type Article = {
  id?: number;
  title: string;
  slug: string;
  category: string;
  excerpt?: string;
  summary?: string;
  content: string;
  coverImage: string;
  videoUrl?: string;
  author?: string;
  tags?: string[];
  tagsText?: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl?: string;
  status: "draft" | "published";
  noIndex: boolean;
};

function emptyArticle(kind: Kind): Article {
  return { title: "", slug: "", category: kind === "posts" ? "عمومی" : "راهنمای شروع", excerpt: "", summary: "", content: "", coverImage: "", videoUrl: "", author: "تیم منوی دیجیتال", tags: [], tagsText: "", metaTitle: "", metaDescription: "", canonicalUrl: "", status: "draft", noIndex: false };
}

const PERSIAN_TO_LATIN: Record<string, string> = { "آ": "a", "ا": "a", "ب": "b", "پ": "p", "ت": "t", "ث": "s", "ج": "j", "چ": "ch", "ح": "h", "خ": "kh", "د": "d", "ذ": "z", "ر": "r", "ز": "z", "ژ": "zh", "س": "s", "ش": "sh", "ص": "s", "ض": "z", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "q", "ک": "k", "گ": "g", "ل": "l", "م": "m", "ن": "n", "و": "v", "ه": "h", "ی": "y", "ي": "y", "ئ": "y", "ء": "", "‌": "-" };
function slugify(value: string) {
  return value.toLowerCase().split("").map((char) => PERSIAN_TO_LATIN[char] ?? char).join("").normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 110);
}

export function ContentEditorPage({ kind, id }: { kind: Kind; id: number | null }) {
  const branding = usePlatformBranding();
  return <ToastProvider><div className="min-h-dvh bg-base-200/70" style={brandThemeStyle(branding.brandColor)}><ContentEditor key={`${kind}:${id ?? "new"}`} kind={kind} id={id} siteName={branding.siteName}/></div></ToastProvider>;
}

function ContentEditor({ kind, id, siteName }: { kind: Kind; id: number | null; siteName: string }) {
  const router = useRouter();
  const toast = useToast();
  const coverInput = useRef<HTMLInputElement>(null);
  const slugTouched = useRef(Boolean(id));
  const [article, setArticle] = useState<Article>(() => emptyArticle(kind));
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slugError, setSlugError] = useState("");

  useEffect(() => {
    let active = true;
    if (!id) return () => { active = false; };
    api<{ item: Record<string, any> }>(`/api/admin/content/${kind}/${id}`).then(({ item }) => {
      if (!active) return;
      setArticle({
        ...emptyArticle(kind), ...item,
        tags: Array.isArray(item.tags) ? item.tags : [],
        tagsText: Array.isArray(item.tags) ? item.tags.join(", ") : "",
        status: item.status === "published" ? "published" : "draft",
        noIndex: Boolean(item.noIndex),
      });
      slugTouched.current = true;
    }).catch((error) => { if (active) toast((error as Error).message, "error"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, kind, toast]);

  const publicPath = kind === "posts" ? `/blog/${article.slug}` : `/tutorials/${article.slug}`;
  const isPublished = article.status === "published";
  const seoTitle = article.metaTitle || article.title || "عنوان صفحه";
  const seoDescription = article.metaDescription || article.excerpt || article.summary || "توضیحات نتیجه جستجو اینجا نمایش داده می‌شود.";
  const tags = useMemo(() => (article.tagsText ?? "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20), [article.tagsText]);

  function set<K extends keyof Article>(key: K, value: Article[K]) {
    setArticle((current) => ({ ...current, [key]: value }));
  }
  function changeTitle(title: string) {
    setArticle((current) => ({ ...current, title, ...(slugTouched.current ? {} : { slug: slugify(title) }) }));
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("فقط تصویر برای تصویر شاخص مجاز است", "error"); return; }
    setUploading(true);
    try {
      const response = await fetch("/api/admin/media", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }, body: await file.arrayBuffer() });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") throw new Error(data.error || "بارگذاری ناموفق بود");
      set("coverImage", data.url); toast("تصویر شاخص بارگذاری شد");
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setUploading(false); if (coverInput.current) coverInput.current.value = ""; }
  }
  async function save(status = article.status) {
    if (!article.title.trim()) { toast("عنوان محتوا را وارد کنید", "error"); return; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug.trim())) { setSlugError("نشانی باید انگلیسی، با حروف کوچک و جداشده با خط تیره باشد."); toast("نشانی صفحه معتبر نیست", "error"); return; }
    setSlugError(""); setSaving(true);
    try {
      const body = {
        ...article,
        slug: article.slug.trim(),
        status,
        tags,
      };
      const url = id ? `/api/admin/content/${kind}/${id}` : `/api/admin/content/${kind}`;
      await api(url, { method: id ? "PATCH" : "POST", body });
      toast(status === "published" ? "محتوا منتشر شد" : "پیش‌نویس ذخیره شد");
      router.push("/admin#content");
      router.refresh();
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setSaving(false); }
  }

  if (loading) return <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6"><Skeleton className="h-16 rounded-2xl"/><Skeleton className="h-[60vh] rounded-2xl"/></main>;

  return <>
    <header className="sticky top-0 z-30 border-b border-base-300 bg-base-100/95 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-3 px-3 sm:px-6">
        <Link href="/admin#content" aria-label="بازگشت به فهرست محتوا" className="btn btn-ghost btn-square btn-sm size-10 rounded-xl"><ArrowRight className="size-5"/></Link>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BookOpenText className="size-5"/></span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{id ? "ویرایش محتوا" : "محتوای تازه"}</p><p className="truncate text-[11px] text-base-content/55">{siteName} · {kind === "posts" ? "وبلاگ" : "آموزش"}</p></div>
        <Badge color={isPublished ? "emerald" : "amber"}>{isPublished ? "منتشرشده" : "پیش‌نویس"}</Badge>
        <Button className="hidden sm:inline-flex" variant="secondary" disabled={!article.slug || !isPublished} onClick={() => window.open(publicPath, "_blank", "noopener,noreferrer")}><ExternalLink className="me-1 size-4"/>پیش‌نمایش</Button>
        <Button loading={saving} disabled={uploading} onClick={() => void save()}><Save className="me-1 size-4"/>ذخیره</Button>
      </div>
    </header>
    <main className="mx-auto max-w-[1600px] px-3 pb-28 pt-5 sm:px-6 sm:pt-7 lg:pb-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold text-primary">{kind === "posts" ? "مرکز انتشار" : "آکادمی و آموزش"}</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">{id ? "ویرایش محتوا" : kind === "posts" ? "نوشتن مقالهٔ وبلاگ" : "ساخت آموزش جدید"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-base-content/60">متن، رسانه، اطلاعات انتشار و سئوی صفحه را در یک فضای ویرایش کامل مدیریت کنید.</p></div><span className="hidden items-center gap-2 text-xs text-base-content/45 sm:flex"><FileText className="size-4"/> ذخیرهٔ امن پیش‌نویس پیش از انتشار</span></div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_330px] xl:gap-6">
        <div className="min-w-0 space-y-5">
          <Card className="space-y-4 p-4 sm:p-6">
            <Field label="عنوان محتوا" hint="عنوان اصلی صفحه و نتیجهٔ جستجو را مشخص می‌کند."><Input autoFocus maxLength={180} value={article.title} onChange={(e) => changeTitle(e.target.value)} placeholder="مثلاً راهنمای مدیریت هزینه رستوران" className="h-12 text-base font-bold"/></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="دسته‌بندی"><Input maxLength={80} value={article.category} onChange={(e) => set("category", e.target.value)} placeholder="مدیریت رستوران"/></Field><Field label="نشانی انگلیسی صفحه" hint={slugError || "پس از انتشار، تغییر نشانی روی لینک و سئو اثر دارد."}><div className="join w-full" dir="ltr"><span className="join-item flex items-center border border-base-300 bg-base-200 px-3 text-xs text-base-content/50">{kind === "posts" ? "/blog/" : "/tutorials/"}</span><Input className="join-item min-w-0 text-left" dir="ltr" maxLength={120} value={article.slug} onChange={(e) => { slugTouched.current = true; set("slug", slugify(e.target.value)); setSlugError(""); }} placeholder="restaurant-costs"/></div></Field></div>
            {kind === "posts" ? <><Field label="خلاصهٔ مقاله" hint="در فهرست وبلاگ و پیش‌نمایش اشتراک‌گذاری نمایش داده می‌شود."><textarea className="textarea textarea-bordered min-h-24 w-full bg-base-100" maxLength={600} value={article.excerpt} onChange={(e) => set("excerpt", e.target.value)} placeholder="در چند جمله بگویید مقاله چه مسئله‌ای را حل می‌کند."/><p className="mt-1 text-end text-[11px] text-base-content/45">{(article.excerpt ?? "").length.toLocaleString("fa-IR")} / ۶۰۰</p></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="نویسنده"><Input maxLength={100} value={article.author} onChange={(e) => set("author", e.target.value)}/></Field><Field label="برچسب‌ها" hint="تا ۲۰ برچسب، با ویرگول جدا کنید."><Input value={article.tagsText} onChange={(e) => set("tagsText", e.target.value)} placeholder="انبار، قیمت‌گذاری، رستوران"/></Field></div></> : <Field label="خلاصهٔ آموزش" hint="هدف و نتیجهٔ یادگیری را کوتاه شرح دهید."><textarea className="textarea textarea-bordered min-h-24 w-full bg-base-100" maxLength={600} value={article.summary} onChange={(e) => set("summary", e.target.value)} placeholder="پس از این آموزش چه چیزی یاد می‌گیرید؟"/></Field>}
          </Card>
          <section className="space-y-2"><div className="flex items-center justify-between gap-2"><div><h2 className="text-lg font-extrabold">بدنهٔ محتوا</h2><p className="mt-1 text-xs text-base-content/55">تصویر و ویدیو را از نوار ابزار بارگذاری و در متن درج کنید.</p></div><Badge color="brand">ادیتور غنی</Badge></div><RichTextEditor value={article.content} onChange={(value) => set("content", value)}/></section>
          <Card className="space-y-4 p-4 sm:p-5"><div className="flex items-center gap-2"><SearchCheck className="size-5 text-primary"/><div><h2 className="font-extrabold">پیش‌نمایش گوگل و شبکه‌های اجتماعی</h2><p className="mt-1 text-xs text-base-content/55">عنوان یا توضیح خالی باشد، از عنوان و خلاصهٔ محتوا استفاده می‌شود.</p></div></div><Field label="عنوان سئو"><Input maxLength={180} value={article.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} placeholder={article.title || "عنوان صفحه"}/><p className="mt-1 text-end text-[11px] text-base-content/45">{article.metaTitle.length.toLocaleString("fa-IR")} / ۱۸۰</p></Field><Field label="توضیح سئو"><textarea className="textarea textarea-bordered min-h-20 w-full bg-base-100" maxLength={320} value={article.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} placeholder={article.excerpt || article.summary || "توضیح کوتاه برای موتور جستجو"}/><p className="mt-1 text-end text-[11px] text-base-content/45">{article.metaDescription.length.toLocaleString("fa-IR")} / ۳۲۰</p></Field>{kind === "posts" && <Field label="Canonical URL (اختیاری)" hint="فقط در صورت نیاز به آدرس اصلی متفاوت وارد کنید."><Input dir="ltr" value={article.canonicalUrl} onChange={(e) => set("canonicalUrl", e.target.value)} placeholder="https://example.com/blog/article"/></Field>}<div className="rounded-xl border border-base-200 bg-base-200/40 p-4"><p className="truncate text-sm font-bold text-blue-700">{seoTitle}</p><p className="mt-1 text-xs text-emerald-700">{publicPath}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-base-content/60">{seoDescription}</p></div></Card>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card className="space-y-4 p-4"><div className="flex items-center justify-between"><h2 className="font-extrabold">انتشار</h2><Badge color={isPublished ? "emerald" : "amber"}>{isPublished ? "فعال" : "پیش‌نویس"}</Badge></div><Field label="وضعیت انتشار"><Select value={article.status} onChange={(e) => set("status", e.target.value as Article["status"])}><option value="draft">پیش‌نویس</option><option value="published">منتشرشده</option></Select></Field><label className="flex cursor-pointer items-start gap-2 rounded-xl border border-base-200 p-3 text-sm"><input type="checkbox" className="checkbox checkbox-sm mt-0.5" checked={article.noIndex} onChange={(e) => set("noIndex", e.target.checked)}/><span><b>عدم نمایه‌سازی</b><span className="mt-1 block text-xs leading-5 text-base-content/55">محتوا عمومی می‌ماند اما از موتورهای جستجو درخواست می‌شود آن را نمایه نکنند.</span></span></label><Button className="w-full" loading={saving} disabled={uploading} onClick={() => void save()}><Save className="me-1 size-4"/>ذخیرهٔ {isPublished ? "محتوا" : "پیش‌نویس"}</Button><Button variant="secondary" className="w-full" disabled={!article.slug || !isPublished} onClick={() => window.open(publicPath, "_blank", "noopener,noreferrer")}><ExternalLink className="me-1 size-4"/>مشاهدهٔ صفحهٔ عمومی</Button></Card>
          <Card className="space-y-3 p-4"><div><h2 className="font-extrabold">تصویر شاخص</h2><p className="mt-1 text-xs leading-5 text-base-content/55">در کارت محتوا و پیش‌نمایش اشتراک‌گذاری نمایش داده می‌شود. JPG، PNG، WebP یا GIF تا ۲٫۵ مگابایت.</p></div>{article.coverImage ? <div className="relative h-56 overflow-hidden rounded-xl border border-base-200 bg-base-200"><Image src={article.coverImage} alt="تصویر شاخص" fill unoptimized sizes="320px" className="object-cover"/><button type="button" aria-label="حذف تصویر شاخص" onClick={() => set("coverImage", "")} className="absolute end-2 top-2 rounded-lg bg-black/65 px-2 py-1 text-xs font-bold text-white">حذف تصویر</button></div> : <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-base-300 bg-base-200/40 text-base-content/35"><ImagePlus className="size-8"/></div>}<input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => { void upload(e.target.files?.[0]); }}/><Button type="button" variant="secondary" className="w-full" loading={uploading} onClick={() => coverInput.current?.click()}><ImagePlus className="me-1 size-4"/>{article.coverImage ? "تغییر تصویر شاخص" : "بارگذاری تصویر شاخص"}</Button></Card>
          {kind === "tutorials" && <Card className="space-y-3 p-4"><div className="flex items-center gap-2"><Video className="size-5 text-primary"/><div><h2 className="font-extrabold">ویدیوی اصلی آموزش</h2><p className="mt-1 text-xs text-base-content/55">این ویدیو بالای متن آموزش نمایش داده می‌شود.</p></div></div><Input dir="ltr" value={article.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="/api/files/... یا نشانی HTTPS"/><input type="file" accept="video/mp4,video/webm" className="file-input file-input-bordered w-full" onChange={async (e) => { const input = e.currentTarget; const file = input.files?.[0]; if (!file) return; setUploading(true); try { const response = await fetch("/api/admin/media", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }, body: await file.arrayBuffer() }); const data = await response.json(); if (!response.ok || typeof data.url !== "string") throw new Error(data.error || "بارگذاری ناموفق بود"); set("videoUrl", data.url); toast("ویدیوی آموزش بارگذاری شد"); } catch (error) { toast((error as Error).message, "error"); } finally { setUploading(false); input.value = ""; } }}/><p className="text-[11px] text-base-content/45">MP4 یا WebM، حداکثر ۵۰ مگابایت</p>{article.videoUrl && <video src={article.videoUrl} controls preload="metadata" className="max-h-48 w-full rounded-xl bg-black"/>}</Card>}
        </aside>
      </div>
    </main>
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-base-300 bg-base-100/95 p-3 backdrop-blur-xl sm:hidden"><div className="mx-auto flex max-w-xl gap-2"><Button variant="secondary" className="flex-1" loading={saving} disabled={uploading} onClick={() => void save("draft")}>ذخیره پیش‌نویس</Button><Button className="flex-1" loading={saving} disabled={uploading} onClick={() => void save("published")}>{article.status === "published" ? "ذخیره تغییرات" : "انتشار"}</Button></div></div>
  </>;
}
