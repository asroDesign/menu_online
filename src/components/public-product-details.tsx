"use client";

import { useEffect, useState } from "react";
import { Button, Icon, Modal, Textarea } from "@/components/ui";
import { formatPrice, toFa } from "@/lib/format";
import type { PublicCustomerProfile } from "@/components/public-menu-navigation";

type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  videoUrl: string;
  ingredients: { name: string; quantity: number; unit: string }[];
};
type Review = { id: number; rating: number; body: string; createdAt: string; customerName: string };

export function PublicProductDetails({
  product,
  slug,
  accent,
  profile,
  readOnly = false,
  onClose,
  onProfileRequired,
}: {
  product: Product | null;
  slug: string;
  accent: string;
  profile: PublicCustomerProfile | null;
  readOnly?: boolean;
  onClose: () => void;
  onProfileRequired: () => void;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState({ count: 0, average: 0 });
  const [reviewsAvailable, setReviewsAvailable] = useState(true);
  const [myReviewStatus, setMyReviewStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!product) return;
    let live = true;
    fetch(`/api/public/${encodeURIComponent(slug)}/products/${product.id}/reviews`, { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 403 ? "نظرات برای این رستوران فعال نیست." : "بارگذاری نظرات انجام نشد.");
        return response.json() as Promise<{ items: Review[]; summary: { count: number; average: number }; myReviewStatus?: string | null }>;
      })
      .then((result) => { if (live) { setReviews(result.items); setSummary(result.summary); setMyReviewStatus(result.myReviewStatus ?? null); } })
      .catch((cause: Error) => { if (live) { setReviewsAvailable(false); setError(cause.message); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [product, slug, reload]);

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product) return;
    if (!profile) { onProfileRequired(); return; }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(slug)}/products/${product.id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ rating, body }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "ثبت نظر انجام نشد.");
      setBody("");
      setMyReviewStatus("pending");
      setMessage("نظر شما برای بررسی مدیر ارسال شد و پس از تأیید در این صفحه نمایش داده می‌شود.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setSubmitting(false); }
  }

  return <Modal open={!!product} onClose={onClose} title={product?.name ?? "جزئیات محصول"} description="ویدیو، توضیحات، ترکیبات و دیدگاه مشتریان" size="lg">
    {product && <div className="max-h-[min(75dvh,48rem)] space-y-5 overflow-y-auto pe-1">
      {product.videoUrl && <div className="overflow-hidden rounded-2xl bg-black shadow-sm"><video className="max-h-[55dvh] w-full" controls preload="metadata" playsInline src={product.videoUrl}>مرورگر شما پخش ویدیو را پشتیبانی نمی‌کند.</video></div>}
      <section><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-extrabold">دربارهٔ محصول</h3><span className="text-sm font-extrabold" style={{ color: accent }}>{formatPrice(product.price)}</span></div><p className="mt-2 whitespace-pre-line text-sm leading-7 text-stone-600">{product.description || "توضیحی برای این محصول ثبت نشده است."}</p></section>
      <section className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-extrabold">مواد تشکیل‌دهنده</h3><Icon name="leaf" className="size-4 text-emerald-700" /></div>{product.ingredients.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{product.ingredients.map((ingredient, index) => <li key={`${ingredient.name}:${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-stone-200/70"><span className="font-semibold">{ingredient.name}</span><span className="shrink-0 text-stone-500">{toFa(ingredient.quantity)} {ingredient.unit}</span></li>)}</ul> : <p className="mt-2 text-xs leading-6 text-stone-500">ترکیبات این محصول هنوز ثبت نشده است.</p>}<p className="mt-3 text-[10px] leading-5 text-stone-400">اطلاعات ترکیبات بر اساس دستور تهیه ثبت‌شده توسط رستوران است.</p></section>
      <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-extrabold">نظر مشتریان</h3><p className="mt-1 text-xs text-stone-500">{summary.count ? `${toFa(summary.average)} از ۵ · ${toFa(summary.count)} نظر تأییدشده` : "هنوز نظری برای این محصول ثبت نشده است."}</p></div><div className="flex gap-0.5 text-amber-500" aria-label={`میانگین ${summary.average} از ۵`}>{[1, 2, 3, 4, 5].map((value) => <Icon key={value} name="star" className={`size-4 ${value <= Math.round(summary.average) ? "fill-current" : "text-stone-300"}`} />)}</div></div>
        {loading && <p className="rounded-xl bg-stone-50 p-3 text-xs text-stone-500">در حال بارگذاری نظرات…</p>}
        {!loading && reviewsAvailable && reviews.length > 0 && <div className="max-h-56 space-y-2 overflow-y-auto">{reviews.map((review) => <article key={review.id} className="rounded-xl border border-stone-200 p-3"><div className="flex items-center justify-between gap-2"><b className="text-xs">{review.customerName || "مشتری"}</b><span className="flex items-center gap-1 text-[11px] font-bold text-amber-600"><Icon name="star" className="size-3.5 fill-current" />{toFa(review.rating)}</span></div><p className="mt-2 whitespace-pre-line text-xs leading-6 text-stone-600">{review.body}</p><time className="mt-2 block text-[10px] text-stone-400">{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(review.createdAt))}</time></article>)}</div>}
        {!loading && !reviewsAvailable && <div className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900"><p>{error || "بارگذاری نظرها انجام نشد."}</p><Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => { setLoading(true); setError(""); setReviewsAvailable(true); setReload((value) => value + 1); }}>تلاش دوباره</Button></div>}
        {!readOnly && reviewsAvailable && <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">{myReviewStatus ? <p role="status" className="text-xs leading-6 text-blue-900">{myReviewStatus === "approved" ? "نظر شما برای این محصول تأیید و منتشر شده است." : myReviewStatus === "rejected" ? "نظر قبلی شما برای این محصول تأیید نشده است." : "نظر شما ثبت شده و در انتظار بررسی مدیر است."}</p> : <form onSubmit={(event) => void submitReview(event)}><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-extrabold">تجربه‌تان را ثبت کنید</h4><div role="group" aria-label="امتیاز محصول" className="flex items-center gap-1">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${toFa(value)} از ۵`} aria-pressed={rating === value} className="rounded-md p-1 text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><Icon name="star" className={`size-5 ${value <= rating ? "fill-current" : "text-stone-300"}`} /></button>)}</div></div><Textarea className="mt-3 min-h-24 bg-white" value={body} onChange={(event) => setBody(event.target.value)} minLength={10} maxLength={1000} placeholder="نظر خود را دربارهٔ این محصول بنویسید (حداقل ۱۰ نویسه)" required /><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] leading-5 text-stone-500">نظر پس از تأیید مدیر نمایش داده می‌شود.{profile ? ` شما با حساب ${profile.name} وارد شده‌اید.` : " برای ثبت نظر، ورود به پروفایل لازم است."}</p>{profile ? <Button type="submit" size="sm" loading={submitting} disabled={body.trim().length < 10}>ارسال برای بررسی</Button> : <Button type="button" size="sm" onClick={onProfileRequired}><Icon name="users" className="size-4" /> ورود با موبایل برای ثبت نظر</Button>}</div>{message && <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">{message}</p>}{error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{error}</p>}</form>}</div>}
      </section>
    </div>}
  </Modal>;
}
