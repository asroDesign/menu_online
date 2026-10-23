"use client";

import { useEffect, useState } from "react";
import { Button, Icon, Modal, Textarea } from "@/components/ui";
import { formatPrice, toFa } from "@/lib/format";
import type { PublicCustomerProfile } from "@/components/public-menu-navigation";
import styles from "@/components/captainm-theme.module.css";

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
  darkTheme = false,
  readOnly = false,
  onClose,
  onProfileRequired,
}: {
  product: Product | null;
  slug: string;
  accent: string;
  profile: PublicCustomerProfile | null;
  darkTheme?: boolean;
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

  return <Modal open={!!product} onClose={onClose} title={product?.name ?? "جزئیات محصول"} description="ویدیو، توضیحات، ترکیبات و دیدگاه مشتریان" size="lg" theme={darkTheme ? "dark" : "default"}>
    {product && <div className={`max-h-[min(75dvh,48rem)] space-y-5 overflow-y-auto pe-1 ${darkTheme ? styles.productDetails : ""}`}>
      {product.videoUrl && <div className="overflow-hidden rounded-2xl bg-black shadow-sm"><video className="max-h-[55dvh] w-full" controls preload="metadata" playsInline src={product.videoUrl}>مرورگر شما پخش ویدیو را پشتیبانی نمی‌کند.</video></div>}
      <section><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-extrabold">دربارهٔ محصول</h3><span className={`text-sm font-extrabold ${darkTheme ? "text-cyan-200" : ""}`} style={darkTheme ? undefined : { color: accent }}>{formatPrice(product.price)}</span></div><p className={`mt-2 whitespace-pre-line text-sm leading-7 ${darkTheme ? "text-indigo-100/75" : "text-stone-600"}`}>{product.description || "توضیحی برای این محصول ثبت نشده است."}</p></section>
      <section className={`rounded-2xl border p-4 ${darkTheme ? "border-indigo-100/10 bg-[#101a32]" : "border-stone-200 bg-stone-50/70"}`}><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-extrabold">مواد تشکیل‌دهنده</h3><Icon name="leaf" className={`size-4 ${darkTheme ? "text-cyan-200" : "text-emerald-700"}`} /></div>{product.ingredients.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{product.ingredients.map((ingredient, index) => <li key={`${ingredient.name}:${index}`} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs ring-1 ${darkTheme ? "bg-[#0b142b] text-indigo-50 ring-indigo-100/10" : "bg-white ring-stone-200/70"}`}><span className="font-semibold">{ingredient.name}</span><span className={`shrink-0 ${darkTheme ? "text-indigo-100/60" : "text-stone-500"}`}>{toFa(ingredient.quantity)} {ingredient.unit}</span></li>)}</ul> : <p className={`mt-2 text-xs leading-6 ${darkTheme ? "text-indigo-100/65" : "text-stone-500"}`}>ترکیبات این محصول هنوز ثبت نشده است.</p>}<p className={`mt-3 text-[10px] leading-5 ${darkTheme ? "text-indigo-100/40" : "text-stone-400"}`}>اطلاعات ترکیبات بر اساس دستور تهیه ثبت‌شده توسط رستوران است.</p></section>
      <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-extrabold">نظر مشتریان</h3><p className={`mt-1 text-xs ${darkTheme ? "text-indigo-100/60" : "text-stone-500"}`}>{summary.count ? `${toFa(summary.average)} از ۵ · ${toFa(summary.count)} نظر تأییدشده` : "هنوز نظری برای این محصول ثبت نشده است."}</p></div><div className="flex gap-0.5 text-amber-400" aria-label={`میانگین ${summary.average} از ۵`}>{[1, 2, 3, 4, 5].map((value) => <Icon key={value} name="star" className={`size-4 ${value <= Math.round(summary.average) ? "fill-current" : darkTheme ? "text-indigo-100/20" : "text-stone-300"}`} />)}</div></div>
        {loading && <p className={`rounded-xl p-3 text-xs ${darkTheme ? "bg-[#101a32] text-indigo-100/60" : "bg-stone-50 text-stone-500"}`}>در حال بارگذاری نظرات…</p>}
        {!loading && reviewsAvailable && reviews.length > 0 && <div className="max-h-56 space-y-2 overflow-y-auto">{reviews.map((review) => <article key={review.id} className={`rounded-xl border p-3 ${darkTheme ? "border-indigo-100/10 bg-[#101a32]" : "border-stone-200"}`}><div className="flex items-center justify-between gap-2"><b className="text-xs">{review.customerName || "مشتری"}</b><span className="flex items-center gap-1 text-[11px] font-bold text-amber-400"><Icon name="star" className="size-3.5 fill-current" />{toFa(review.rating)}</span></div><p className={`mt-2 whitespace-pre-line text-xs leading-6 ${darkTheme ? "text-indigo-100/75" : "text-stone-600"}`}>{review.body}</p><time className={`mt-2 block text-[10px] ${darkTheme ? "text-indigo-100/40" : "text-stone-400"}`}>{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(review.createdAt))}</time></article>)}</div>}
        {!loading && !reviewsAvailable && <div className={`rounded-xl p-3 text-xs leading-6 ${darkTheme ? "bg-amber-300/10 text-amber-100" : "bg-amber-50 text-amber-900"}`}><p>{error || "بارگذاری نظرها انجام نشد."}</p><Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => { setLoading(true); setError(""); setReviewsAvailable(true); setReload((value) => value + 1); }}>تلاش دوباره</Button></div>}
        {!readOnly && reviewsAvailable && <div className={`rounded-2xl border p-4 ${darkTheme ? "border-cyan-200/10 bg-[#111b35]" : "border-blue-100 bg-blue-50/50"}`}>{myReviewStatus ? <p role="status" className={`text-xs leading-6 ${darkTheme ? "text-cyan-100/80" : "text-blue-900"}`}>{myReviewStatus === "approved" ? "نظر شما برای این محصول تأیید و منتشر شده است." : myReviewStatus === "rejected" ? "نظر قبلی شما برای این محصول تأیید نشده است." : "نظر شما ثبت شده و در انتظار بررسی مدیر است."}</p> : <form onSubmit={(event) => void submitReview(event)}><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-extrabold">تجربه‌تان را ثبت کنید</h4><div role="group" aria-label="امتیاز محصول" className="flex items-center gap-1">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${toFa(value)} از ۵`} aria-pressed={rating === value} className="rounded-md p-1 text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><Icon name="star" className={`size-5 ${value <= rating ? "fill-current" : darkTheme ? "text-indigo-100/20" : "text-stone-300"}`} /></button>)}</div></div><Textarea className={`mt-3 min-h-24 ${darkTheme ? "border-indigo-100/15 bg-[#090f23] text-white placeholder:text-indigo-100/40 focus:border-cyan-200/50" : "bg-white"}`} value={body} onChange={(event) => setBody(event.target.value)} minLength={10} maxLength={1000} placeholder="نظر خود را دربارهٔ این محصول بنویسید (حداقل ۱۰ نویسه)" required /><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className={`text-[10px] leading-5 ${darkTheme ? "text-indigo-100/60" : "text-stone-500"}`}>نظر پس از تأیید مدیر نمایش داده می‌شود.{profile ? ` شما با حساب ${profile.name} وارد شده‌اید.` : " برای ثبت نظر، ورود به پروفایل لازم است."}</p>{profile ? <Button type="submit" size="sm" loading={submitting} disabled={body.trim().length < 10}>ارسال برای بررسی</Button> : <Button type="button" size="sm" onClick={onProfileRequired}><Icon name="users" className="size-4" /> ورود با موبایل برای ثبت نظر</Button>}</div>{message && <p role="status" className={`mt-2 rounded-lg px-3 py-2 text-xs leading-5 ${darkTheme ? "bg-emerald-300/10 text-emerald-100" : "bg-emerald-50 text-emerald-800"}`}>{message}</p>}{error && <p role="alert" className={`mt-2 rounded-lg px-3 py-2 text-xs leading-5 ${darkTheme ? "bg-rose-300/10 text-rose-100" : "bg-rose-50 text-rose-700"}`}>{error}</p>}</form>}</div>}
      </section>
    </div>}
  </Modal>;
}
