"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate, formatNumber, formatPrice, formatTime } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Icon, Input, Modal, Select, Skeleton, Textarea, useToast } from "@/components/ui";

type Collection = "posts" | "tutorials" | "faqs" | "testimonials";
const COLLECTIONS: [Collection, string][] = [["posts", "وبلاگ"], ["tutorials", "آموزش‌ها"], ["faqs", "سوالات متداول"], ["testimonials", "نظرات کاربران"]];
const emptyForm = (c: Collection): Record<string, any> => c === "posts"
  ? { title: "", slug: "", excerpt: "", content: "", category: "عمومی", tags: [], coverImage: "", author: "تیم منوی دیجیتال", status: "draft", metaTitle: "", metaDescription: "", canonicalUrl: "", noIndex: false }
  : c === "tutorials"
    ? { title: "", slug: "", summary: "", content: "", category: "راهنمای شروع", coverImage: "", videoUrl: "", status: "draft", metaTitle: "", metaDescription: "", noIndex: false }
    : c === "faqs" ? { question: "", answer: "", category: "عمومی", isPublished: true, sortOrder: 0 }
      : { name: "", title: "", businessName: "", body: "", rating: 5, imageUrl: "", isPublished: false, sortOrder: 0 };

export function ContentTab() {
  const [collection, setCollection] = useState<Collection>("posts");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems((await api<{ items: any[] }>(`/api/admin/content/${collection}`)).items); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [collection]);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const body = collection === "posts" ? { ...form, tags: typeof form.tags === "string" ? form.tags.split(",").map((x: string) => x.trim()).filter(Boolean) : form.tags }
        : form;
      const url = form.id ? `/api/admin/content/${collection}/${form.id}` : `/api/admin/content/${collection}`;
      await api(url, { method: form.id ? "PATCH" : "POST", body });
      toast("محتوا ذخیره شد"); setForm(null); await load();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  }
  async function remove(item: any) {
    if (!confirm("این محتوا حذف شود؟")) return;
    try { await api(`/api/admin/content/${collection}/${item.id}`, { method: "DELETE" }); toast("حذف شد"); await load(); }
    catch (e) { toast((e as Error).message, "error"); }
  }
  async function upload(file: File, field: string) {
    setUploading(field);
    try {
      const response = await fetch("/api/admin/media", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }, body: await file.arrayBuffer() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "بارگذاری ناموفق بود");
      setForm((f) => f ? { ...f, [field]: data.url } : f); toast("فایل بارگذاری شد");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setUploading(""); }
  }
  const input = (label: string, key: string, opts: { area?: boolean; hint?: string; type?: string } = {}) => <Field key={key} label={label} hint={opts.hint}><>{opts.area ? <Textarea rows={key === "content" || key === "answer" || key === "body" ? 8 : 3} value={form?.[key] ?? ""} onChange={(e) => setForm((f) => f && ({ ...f, [key]: e.target.value }))} /> : <Input type={opts.type ?? "text"} value={form?.[key] ?? ""} onChange={(e) => setForm((f) => f && ({ ...f, [key]: e.target.value }))} />}</></Field>;
  const media = (label: string, key: string, accept: string) => <Field key={key} label={label} hint={form?.[key] || "تصویر تا ۲٫۵ مگابایت؛ ویدیو تا ۵۰ مگابایت"}><div className="flex flex-wrap items-center gap-2"><Input value={form?.[key] ?? ""} onChange={(e) => setForm((f) => f && ({ ...f, [key]: e.target.value }))} placeholder="نشانی فایل یا بارگذاری" /><label className="btn btn-secondary h-10 cursor-pointer rounded-xl px-3 text-xs">{uploading === key ? "در حال بارگذاری…" : "انتخاب فایل"}<input type="file" accept={accept} className="sr-only" disabled={!!uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, key); e.currentTarget.value = ""; }} /></label></div></Field>;

  return <div className="space-y-5">
    <div><h1 className="text-xl font-extrabold sm:text-2xl">مدیریت محتوای وب‌سایت</h1><p className="mt-1 text-sm text-base-content/60">وبلاگ و سئو، آموزش‌ها، سوالات متداول و نظرات کاربران</p></div>
    <div className="flex flex-wrap gap-2">{COLLECTIONS.map(([key, label]) => <Button key={key} variant={collection === key ? "primary" : "secondary"} size="sm" onClick={() => setCollection(key)}>{label}</Button>)}<Button className="ms-auto" onClick={() => setForm(emptyForm(collection))}><Icon name="plus" className="size-4" />افزودن</Button></div>
    {error ? <ErrorState message={error} onRetry={load} /> : loading ? <Skeleton className="h-60 rounded-2xl" /> : !items.length ? <EmptyState title="محتوایی وجود ندارد" description="اولین مورد را با دکمه افزودن بسازید." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Card key={item.id} className="flex min-w-0 flex-col gap-3 p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate font-bold">{item.title || item.question || item.name}</h3><p className="mt-1 line-clamp-2 text-xs leading-6 text-base-content/60">{item.excerpt || item.summary || item.answer || item.body}</p></div><Badge color={item.status === "published" || item.isPublished ? "emerald" : "amber"}>{item.status === "published" || item.isPublished ? "منتشرشده" : "پیش‌نویس"}</Badge></div><div className="flex items-center justify-between gap-2 border-t border-base-200 pt-2"><span className="truncate text-xs text-base-content/50">{item.slug ? `/${collection === "posts" ? "blog" : "tutorials"}/${item.slug}` : item.category || item.businessName || ""}</span><div className="flex shrink-0 gap-1"><Button size="sm" variant="secondary" onClick={() => setForm({ ...item, tags: Array.isArray(item.tags) ? item.tags.join(", ") : item.tags })}>ویرایش</Button><Button size="sm" variant="ghost" onClick={() => void remove(item)}>حذف</Button></div></div></Card>)}</div>}
    <Modal
      open={!!form}
      onClose={() => { if (!saving && !uploading) setForm(null); }}
      title={`${form?.id ? "ویرایش" : "ایجاد"} ${COLLECTIONS.find(([k]) => k === collection)?.[1] ?? "محتوا"}`}
      description="محتوای سایت را ویرایش کنید و پیش از انتشار بررسی کنید."
      size="lg"
      footer={<><Button variant="ghost" disabled={saving || !!uploading} onClick={() => setForm(null)}>انصراف</Button><Button loading={saving} disabled={!!uploading} onClick={() => void save()}>ذخیره</Button></>}
    >
      {form && <div className="grid gap-3 sm:grid-cols-2">
      {collection === "posts" && <>{input("عنوان", "title")}{input("نشانی انگلیسی (slug)", "slug")}{input("دسته‌بندی", "category")}{input("نویسنده", "author")}{input("خلاصه", "excerpt", { area: true })}{media("تصویر شاخص", "coverImage", "image/*")}{input("برچسب‌ها (با ویرگول)", "tags")}{input("عنوان سئو", "metaTitle")}{input("توضیح سئو", "metaDescription", { area: true })}{input("Canonical URL (اختیاری)", "canonicalUrl")}{input("متن مقاله (متن ساده یا Markdown)", "content", { area: true })}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.noIndex} onChange={(e) => setForm({ ...form, noIndex: e.target.checked })} />نمایه نشود</label><Field label="وضعیت"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="draft">پیش‌نویس</option><option value="published">منتشرشده</option></Select></Field></>}
      {collection === "tutorials" && <>{input("عنوان", "title")}{input("نشانی انگلیسی (slug)", "slug")}{input("دسته‌بندی", "category")}{input("خلاصه", "summary", { area: true })}{media("تصویر شاخص", "coverImage", "image/*")}{media("ویدیوی آموزش", "videoUrl", "video/mp4,video/webm")}{input("عنوان سئو", "metaTitle")}{input("توضیح سئو", "metaDescription", { area: true })}{input("متن آموزش", "content", { area: true })}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.noIndex} onChange={(e) => setForm({ ...form, noIndex: e.target.checked })} />نمایه نشود</label><Field label="وضعیت"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="draft">پیش‌نویس</option><option value="published">منتشرشده</option></Select></Field></>}
      {collection === "faqs" && <>{input("پرسش", "question")}{input("دسته‌بندی", "category")}{input("پاسخ", "answer", { area: true })}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} />نمایش عمومی</label></>}
      {collection === "testimonials" && <>{input("نام", "name")}{input("سمت", "title")}{input("نام کسب‌وکار", "businessName")}{input("امتیاز (۱ تا ۵)", "rating", { type: "number" })}{input("نشانی تصویر", "imageUrl")}{input("متن نظر", "body", { area: true })}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} />تأیید و انتشار</label></>}
    </div>}
    </Modal>
  </div>;
}

const LEAD_LABEL: Record<string, string> = { contact: "تماس", consultation: "مشاوره", demo: "دموی رایگان" };
export function LeadsTab() {
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [kind, setKind] = useState(""); const toast = useToast();
  const load = useCallback(async () => { setLoading(true); setError(""); try { setItems((await api<{ items: any[] }>(`/api/admin/leads${kind ? `?kind=${kind}` : ""}`)).items); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }, [kind]);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect
  async function patch(id: number, body: Record<string, unknown>) { try { const { item } = await api<{ item: any }>(`/api/admin/leads/${id}`, { method: "PATCH", body }); setItems((v) => v.map((x) => x.id === id ? { ...x, ...item } : x)); toast("درخواست به‌روزرسانی شد"); } catch (e) { toast((e as Error).message, "error"); } }
  return <div className="space-y-4"><div><h1 className="text-xl font-extrabold sm:text-2xl">درخواست‌های سایت</h1><p className="mt-1 text-sm text-base-content/60">درخواست‌های تماس، مشاوره و دموی رایگان؛ قابل پیگیری توسط فروش و پشتیبانی</p></div><div className="flex flex-wrap gap-2">{[["", "همه"], ["consultation", "مشاوره"], ["demo", "دمو"], ["contact", "تماس"]].map(([k, l]) => <Button key={k} variant={kind === k ? "primary" : "secondary"} size="sm" onClick={() => setKind(k)}>{l}</Button>)}</div>{error ? <ErrorState message={error} onRetry={load} /> : loading ? <Skeleton className="h-52 rounded-2xl" /> : !items.length ? <EmptyState title="درخواستی ثبت نشده" description="درخواست‌های تازه از فرم‌های سایت اینجا دیده می‌شوند." /> : <div className="space-y-3">{items.map((x) => <Card key={x.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><Badge color="brand">{LEAD_LABEL[x.kind] || x.kind}</Badge><b>{x.name}</b><span className="text-xs text-base-content/50">{formatDate(x.createdAt)}</span></div><p className="mt-2 text-sm">{x.businessName && <b>{x.businessName} · </b>}{x.subject}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-base-content/70">{x.message}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"><a className="link" href={`tel:${x.phone}`}>{x.phone}</a>{x.email && <a className="link" href={`mailto:${x.email}`}>{x.email}</a>}{x.preferredAt && <span>زمان پیشنهادی: {formatDate(x.preferredAt)} {formatTime(x.preferredAt)}</span>}</div><Textarea className="mt-3" rows={2} defaultValue={x.adminNote} placeholder="یادداشت پیگیری" onBlur={(e) => e.target.value !== x.adminNote && void patch(x.id, { adminNote: e.target.value })} /></div><div className="flex items-center gap-2 lg:flex-col lg:items-stretch"><Select value={x.status} onChange={(e) => void patch(x.id, { status: e.target.value })}><option value="new">جدید</option><option value="contacted">تماس‌گرفته</option><option value="qualified">واجد شرایط</option><option value="closed">بسته‌شده</option></Select><Button variant="secondary" size="sm" onClick={() => void patch(x.id, { status: "contacted" })}>ثبت پیگیری</Button></div></Card>)}</div>}</div>;
}

const AFF_STATUS: Record<string, string> = { pending: "در انتظار", active: "فعال", rejected: "ردشده", suspended: "تعلیق" };
export function AffiliatesTab() {
  const [sub, setSub] = useState<"partners" | "withdrawals">("partners"); const [items, setItems] = useState<any[]>([]); const [withdrawals, setWithdrawals] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const toast = useToast();
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [a, w] = await Promise.all([api<{ items: any[] }>("/api/admin/affiliates"), api<{ items: any[] }>("/api/admin/affiliate-withdrawals")]); setItems(a.items); setWithdrawals(w.items); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect
  async function update(item: any, body: Record<string, unknown>) { try { await api(`/api/admin/affiliates/${item.id}`, { method: "PATCH", body }); toast("تنظیمات همکار ذخیره شد"); await load(); } catch (e) { toast((e as Error).message, "error"); } }
  async function decide(item: any, action: "pay" | "reject") { const payoutReference = action === "pay" ? prompt("شماره پیگیری واریز (اختیاری)") ?? "" : ""; try { await api(`/api/admin/affiliate-withdrawals/${item.id}`, { method: "PATCH", body: { action, payoutReference } }); toast(action === "pay" ? "پرداخت ثبت شد و سند حسابداری ایجاد شد" : "درخواست رد و موجودی آزاد شد"); await load(); } catch (e) { toast((e as Error).message, "error"); } }
  return <div className="space-y-4"><div><h1 className="text-xl font-extrabold sm:text-2xl">همکاری در فروش</h1><p className="mt-1 text-sm text-base-content/60">مدیریت بازاریاب‌ها، نرخ پورسانت اختصاصی، انتساب فروش و درخواست‌های برداشت</p></div><div className="flex gap-2"><Button size="sm" variant={sub === "partners" ? "primary" : "secondary"} onClick={() => setSub("partners")}>بازاریاب‌ها ({items.length})</Button><Button size="sm" variant={sub === "withdrawals" ? "primary" : "secondary"} onClick={() => setSub("withdrawals")}>برداشت‌ها ({withdrawals.filter((w) => w.status === "pending").length} معوق)</Button></div>{error ? <ErrorState message={error} onRetry={load} /> : loading ? <Skeleton className="h-64 rounded-2xl" /> : sub === "partners" ? !items.length ? <EmptyState title="درخواست همکاری نداریم" description="درخواست‌های جدید پس از ثبت در این فهرست نمایش داده می‌شوند." /> : <div className="space-y-3">{items.map((x) => <Card key={x.id} className="space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{x.name}</h3><Badge color={x.status === "active" ? "emerald" : x.status === "pending" ? "amber" : "stone"}>{AFF_STATUS[x.status]}</Badge></div><p className="mt-1 text-xs text-base-content/60">{x.email} · {x.phone} · ثبت {formatDate(x.createdAt)}</p><p className="mt-1 text-xs">{x.channel} {x.website && `· ${x.website}`}</p><p className="mt-1 text-xs leading-5 text-base-content/70">{x.introduction}</p></div><div className="rounded-xl bg-base-200 p-3 text-end"><p className="text-xs text-base-content/50">موجودی کیف پول</p><b>{formatPrice(x.balance)}</b></div></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Field label="پورسانت فروش (%)"><Input type="number" min="0" max="50" step="1" defaultValue={x.commissionPercent} id={`rate-${x.id}`} /></Field><Field label="انتساب (روز)"><Input type="number" min="1" max="365" defaultValue={x.attributionDays} id={`days-${x.id}`} /></Field><Field label="حداقل برداشت"><Input type="number" min="0" defaultValue={x.minimumWithdrawal} id={`min-${x.id}`} /></Field><Field label="لینک ارجاع"><Input readOnly value={`/ref/${x.referralCode}`} /></Field></div><p className="text-xs text-base-content/60">بانک: {x.bankName || "—"} · صاحب حساب: {x.accountHolder || "—"} · کارت: {x.cardNumber || "—"} · شبا: {x.sheba || "—"}</p><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => { const rate = Number((document.getElementById(`rate-${x.id}`) as HTMLInputElement)?.value); const days = Number((document.getElementById(`days-${x.id}`) as HTMLInputElement)?.value); const min = Number((document.getElementById(`min-${x.id}`) as HTMLInputElement)?.value); void update(x, { commissionPercent: rate, attributionDays: days, minimumWithdrawal: min }); }}>ذخیره نرخ و شرایط</Button>{x.status !== "active" && <Button size="sm" variant="secondary" onClick={() => void update(x, { status: "active" })}>تأیید و فعال‌سازی</Button>}{x.status === "active" && <Button size="sm" variant="secondary" onClick={() => void update(x, { status: "suspended" })}>تعلیق</Button>}{x.status === "pending" && <Button size="sm" variant="ghost" onClick={() => void update(x, { status: "rejected" })}>رد درخواست</Button>}</div></Card>)}</div> : !withdrawals.length ? <EmptyState title="درخواست برداشتی نیست" description="درخواست‌های بازاریاب‌ها در این فهرست قرار می‌گیرد." /> : <div className="space-y-3">{withdrawals.map((x) => <Card key={x.id} className="flex flex-wrap items-center justify-between gap-4 p-4"><div><b>{x.affiliateName}</b><p className="mt-1 text-xs text-base-content/60">{x.affiliateEmail} · {formatDate(x.createdAt)} · {x.bankName} · کارت {x.cardNumber} · {x.sheba}</p><p className="mt-1 text-sm font-bold">{formatPrice(x.amount)} <span className="font-normal">· {x.status === "pending" ? "در انتظار" : x.status === "paid" ? "پرداخت‌شده" : "ردشده"}</span></p></div>{x.status === "pending" && <div className="flex gap-2"><Button size="sm" onClick={() => void decide(x, "pay")}>ثبت واریز</Button><Button variant="ghost" size="sm" onClick={() => void decide(x, "reject")}>رد</Button></div>}</Card>)}</div>}</div>;
}
