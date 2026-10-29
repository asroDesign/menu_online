"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api, useCollection } from "@/lib/api";
import { formatPrice, toFa } from "@/lib/format";
import { AmountInput, useToast } from "@/components/ui";
import { Camera, Check, FileText, ImagePlus, List, LoaderCircle, Sparkles, Upload, WandSparkles, X } from "lucide-react";

type DraftItem = { key: string; name: string; category: string; description: string; priceToman: number | null; imageUrl: string };
type Product = { id: number; name: string; description: string; imageUrl: string };
type Method = "list" | "photo" | "description" | "image";
const tabs: { id: Method; title: string; icon: typeof List }[] = [
  { id: "list", title: "از فهرست غذاها", icon: List },
  { id: "photo", title: "از عکس منوی فعلی", icon: Camera },
  { id: "description", title: "نوشتن توضیحات غذا", icon: FileText },
  { id: "image", title: "ساخت و بهبود عکس", icon: ImagePlus },
];

function dataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("خواندن فایل ناموفق بود"));
    reader.onerror = () => reject(new Error("خواندن فایل ناموفق بود"));
    reader.readAsDataURL(file);
  });
}

export function AiMenuBuilder() {
  const toast = useToast();
  const products = useCollection<Product>("/api/products");
  const [method, setMethod] = useState<Method>("list");
  const [menuText, setMenuText] = useState("");
  const [menuPhoto, setMenuPhoto] = useState<File | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [engine, setEngine] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ created: number; skipped: number } | null>(null);
  const [descriptionProduct, setDescriptionProduct] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageDescription, setImageDescription] = useState("");
  const [imageSource, setImageSource] = useState<File | null>(null);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [generatedImage, setGeneratedImage] = useState("");
  const [savedImageProduct, setSavedImageProduct] = useState("");

  async function parseMenu() {
    setBusy(true); setSaved(null);
    try {
      const result = await api<{ items: Omit<DraftItem, "key" | "imageUrl">[]; engine: string }>("/api/ai/menu/parse", {
        method: "POST", body: method === "photo" ? { source: "photo", imageData: menuPhoto ? await dataUrl(menuPhoto) : "" } : { source: "list", text: menuText },
      });
      setDrafts(result.items.map((item) => ({ ...item, key: crypto.randomUUID(), imageUrl: "" })));
      setEngine(result.engine); toast(`${toFa(result.items.length)} قلم برای بازبینی آماده شد`);
      document.getElementById("ai-menu-drafts")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setBusy(false); }
  }

  function patchDraft(key: string, patch: Partial<DraftItem>) {
    setDrafts((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  async function createDraftImage(item: DraftItem) {
    setBusy(true);
    try {
      const result = await api<{ url: string }>("/api/ai/menu/image", { method: "POST", body: { mode: "generate", name: item.name, description: item.description } });
      patchDraft(item.key, { imageUrl: result.url });
      toast(`تصویر پیشنهادی «${item.name}» آماده شد؛ پیش از ثبت منو آن را بررسی کنید.`);
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function saveMenu() {
    if (!drafts.length) return;
    setBusy(true);
    try {
      const result = await api<{ item: { created: number; skipped: number } }>("/api/ai/menu/parse", {
        method: "PUT", body: { confirmed: true, items: drafts.map(({ name, category, description, priceToman, imageUrl }) => ({ name, category, description, priceToman, imageUrl })) },
      });
      setSaved(result.item); await products.reload();
      toast("پیش‌نویس منو ثبت شد؛ محصولات هنوز برای مشتری منتشر نشده‌اند.");
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function makeDescription() {
    if (!descriptionProduct) return;
    setBusy(true);
    try {
      const result = await api<{ item: { text: string } }>("/api/r/ai", { method: "POST", body: { productId: Number(descriptionProduct), tone: "friendly" } });
      setDescriptionDraft(result.item.text);
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function applyDescription() {
    if (!descriptionProduct || !descriptionDraft) return;
    setBusy(true);
    try { await products.update(Number(descriptionProduct), { description: descriptionDraft }); toast("توضیح ویرایش‌شده روی محصول ذخیره شد."); }
    catch (error) { toast((error as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function makeImage() {
    if (!imageName.trim()) { toast("نام محصول را وارد کنید.", "error"); return; }
    if (imageSource && !["image/png", "image/jpeg", "image/webp"].includes(imageSource.type)) { toast("فقط عکس PNG، JPG یا WebP پذیرفته می‌شود.", "error"); return; }
    if (imageSource && imageSource.size > 2_500_000) { toast("حجم عکس حداکثر ۲٫۵ مگابایت باشد.", "error"); return; }
    setBusy(true); setGeneratedImage("");
    try {
      const result = await api<{ url: string }>("/api/ai/menu/image", { method: "POST", body: { mode: imageSource ? "improve" : "generate", name: imageName, description: imageDescription, imageData: imageSource ? await dataUrl(imageSource) : undefined } });
      setGeneratedImage(result.url);
      setSavedImageProduct("");
      if (selectedProduct) { await products.update(Number(selectedProduct), { imageUrl: result.url }); setSavedImageProduct(products.items.find((item) => String(item.id) === selectedProduct)?.name ?? "محصول انتخاب‌شده"); toast("تصویر جدید ذخیره شد."); }
      else toast("تصویر آماده است؛ برای ثبت محصول، ابتدا آن را بازبینی کنید.");
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setBusy(false); }
  }

  return <section className="card border border-base-300 bg-base-100 p-4 shadow-sm sm:p-6" aria-labelledby="ai-menu-builder-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><span className="badge badge-primary badge-outline gap-1"><Sparkles size={12}/> دستیار ساخت منو</span><h2 id="ai-menu-builder-title" className="mt-2 text-lg font-black">از فهرست یا عکس، پیش‌نویس منو بسازید</h2><p className="mt-1 max-w-3xl text-xs leading-6 text-base-content/60">دسته‌بندی و توضیح‌ها را بررسی و ویرایش کنید؛ سپس پیش‌نویس را ثبت کنید. محصول‌های تازه تا زمان انتشار دستی غیرفعال می‌مانند.</p></div>
      <Link href="/dashboard/products" className="btn btn-outline btn-sm">مدیریت محصولات</Link>
    </div>
    <div role="tablist" aria-label="روش ساخت منو" className="mt-5 grid grid-cols-2 gap-2 xl:grid-cols-4">
      {tabs.map(({ id, title, icon: Icon }) => <button key={id} id={`ai-builder-tab-${id}`} role="tab" aria-selected={method === id} aria-controls={`ai-builder-panel-${id}`} type="button" onClick={() => setMethod(id)} className={`btn h-auto min-h-11 justify-start gap-2 whitespace-normal text-start text-xs ${method === id ? "btn-primary" : "btn-ghost border border-base-300"}`}><Icon size={15}/>{title}</button>)}
    </div>

    {method === "list" && <div id="ai-builder-panel-list" role="tabpanel" aria-labelledby="ai-builder-tab-list" className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
      <label className="form-control"><span className="label-text mb-2 text-xs font-bold">فهرست غذا و نوشیدنی</span><textarea className="textarea textarea-bordered min-h-36 leading-7" value={menuText} onChange={(event) => setMenuText(event.target.value)} maxLength={20_000} placeholder={'پیتزا پپرونی، غذای اصلی، ۳۲۰۰۰۰\nلاته، قهوه، ۱۴۵۰۰۰\nکیک هویج، دسر، ۱۲۰۰۰۰'} /></label>
      <div className="flex flex-col justify-between gap-3 rounded-2xl bg-base-200/60 p-4"><p className="text-xs leading-6 text-base-content/65">نام هر قلم را در یک خط بنویسید؛ دسته و قیمت اختیاری است. هوش مصنوعی فهرست را مرتب می‌کند و متن‌ها قبل از ثبت قابل ویرایش‌اند.</p><button type="button" className="btn btn-primary" disabled={!menuText.trim() || busy} onClick={() => void parseMenu()}>{busy ? <LoaderCircle className="animate-spin" size={16}/> : <WandSparkles size={16}/>}ساخت پیش‌نویس</button></div>
    </div>}

    {method === "photo" && <div id="ai-builder-panel-photo" role="tabpanel" aria-labelledby="ai-builder-tab-photo" className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
      <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-base-300 bg-base-200/40 p-4 text-center"><Upload size={22} className="text-primary"/><span className="text-sm font-bold">{menuPhoto?.name ?? "عکس منوی چاپی را انتخاب کنید"}</span><span className="text-xs text-base-content/55">PNG، JPG یا WebP · حداکثر ۲٫۵ مگابایت</span><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setMenuPhoto(event.target.files?.[0] ?? null)} /></label>
      <div className="flex flex-col justify-between gap-3 rounded-2xl bg-base-200/60 p-4"><p className="text-xs leading-6 text-base-content/65">نام، دسته و قیمت‌های خوانا استخراج می‌شوند. متن و قیمت پیشنهادی را پیش از ساخت محصول بازبینی کنید.</p><button type="button" className="btn btn-primary" disabled={!menuPhoto || busy} onClick={() => void parseMenu()}>{busy ? <LoaderCircle className="animate-spin" size={16}/> : <WandSparkles size={16}/>}خواندن عکس و ساخت پیش‌نویس</button></div>
    </div>}

    {method === "description" && <div id="ai-builder-panel-description" role="tabpanel" aria-labelledby="ai-builder-tab-description" className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3"><label className="form-control"><span className="label-text mb-2 text-xs font-bold">محصول</span><select className="select select-bordered w-full" value={descriptionProduct} onChange={(event) => { setDescriptionProduct(event.target.value); setDescriptionDraft(""); }}><option value="">انتخاب محصول</option>{products.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" className="btn btn-primary w-full" disabled={!descriptionProduct || busy} onClick={() => void makeDescription()}>{busy ? <LoaderCircle className="animate-spin" size={16}/> : <WandSparkles size={16}/>}نوشتن توضیح پیشنهادی</button></div>
      <div className="space-y-3"><label className="form-control"><span className="label-text mb-2 text-xs font-bold">پیش‌نویس قابل ویرایش</span><textarea className="textarea textarea-bordered min-h-28 leading-7" value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} placeholder="توضیح پیشنهادی پس از تولید اینجا نمایش داده می‌شود." /></label><button type="button" className="btn btn-outline btn-sm" disabled={!descriptionProduct || !descriptionDraft || busy} onClick={() => void applyDescription()}><Check size={15}/>اعمال توضیح روی محصول</button></div>
    </div>}

    {method === "image" && <div id="ai-builder-panel-image" role="tabpanel" aria-labelledby="ai-builder-tab-image" className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="grid gap-3 sm:grid-cols-2"><label className="form-control"><span className="label-text mb-2 text-xs font-bold">نام غذا</span><input className="input input-bordered" value={imageName} onChange={(event) => setImageName(event.target.value)} placeholder="مثلاً چیزبرگر دوبل" /></label><label className="form-control"><span className="label-text mb-2 text-xs font-bold">شرح کوتاه (اختیاری)</span><input className="input input-bordered" value={imageDescription} onChange={(event) => setImageDescription(event.target.value)} placeholder="مواد یا سبک سرو" /></label><label className="form-control sm:col-span-2"><span className="label-text mb-2 text-xs font-bold">برای بهبود، عکس فعلی را بارگذاری کنید (اختیاری)</span><input className="file-input file-input-bordered w-full" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImageSource(event.target.files?.[0] ?? null)} /></label><label className="form-control sm:col-span-2"><span className="label-text mb-2 text-xs font-bold">ذخیره مستقیم روی محصول (اختیاری)</span><select className="select select-bordered w-full" value={selectedProduct} onChange={(event) => setSelectedProduct(event.target.value)}><option value="">فعلاً فقط پیش‌نمایش</option>{products.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <div className="flex flex-col justify-between gap-3 rounded-2xl bg-base-200/60 p-4"><p className="text-xs leading-6 text-base-content/65">بدون عکس، تصویر تازه می‌سازیم؛ با عکس، نور و ظاهر آن را بهبود می‌دهیم. تصویر تولیدشده پیش از استفاده قابل مشاهده است.</p><button type="button" className="btn btn-primary" disabled={!imageName.trim() || busy} onClick={() => void makeImage()}>{busy ? <LoaderCircle className="animate-spin" size={16}/> : <ImagePlus size={16}/>}ساخت یا بهبود تصویر</button></div>
    </div>}

    {!!drafts.length && <div id="ai-menu-drafts" className="mt-6 scroll-mt-6 rounded-2xl border border-base-300 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-extrabold">پیش‌نویس منو · {toFa(drafts.length)} قلم</h3><p className="mt-1 text-[11px] text-base-content/55">{engine === "openai" ? "پردازش با هوش مصنوعی" : "مرتب‌سازی قاعده‌محور؛ برای استخراج عکس یا توضیح کامل، کلید هوش مصنوعی لازم است"}</p></div><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDrafts([]); setSaved(null); }}><X size={14}/>پاک‌کردن</button></div>
      {saved && <div role="status" className="alert alert-success mb-3 py-2 text-xs"><Check size={16}/>ثبت شد: {toFa(saved.created)} پیش‌نویس تازه، {toFa(saved.skipped)} مورد تکراری رد شد. محصولات هنوز در منوی مشتری منتشر نشده‌اند.</div>}
      <div className="max-h-[480px] space-y-2 overflow-auto">{drafts.map((item) => <article key={item.key} className="grid gap-2 rounded-xl bg-base-200/45 p-3 md:grid-cols-[1fr_150px_170px_auto]">
        <div className="grid gap-2 sm:grid-cols-2"><input className="input input-bordered input-sm" aria-label="نام محصول" value={item.name} onChange={(event) => patchDraft(item.key, { name: event.target.value })} /><input className="input input-bordered input-sm" aria-label="دسته محصول" value={item.category} onChange={(event) => patchDraft(item.key, { category: event.target.value })} placeholder="دسته" /><textarea className="textarea textarea-bordered textarea-sm min-h-16 sm:col-span-2" aria-label="توضیح محصول" value={item.description} onChange={(event) => patchDraft(item.key, { description: event.target.value })} placeholder="توضیح کوتاه" /></div>
        <label className="form-control"><span className="label-text mb-1 text-[10px]">قیمت تومان</span><AmountInput min={0} max={100000000} className="input-sm" value={item.priceToman ?? ""} onValueChange={(value) => patchDraft(item.key, { priceToman: value ? Number(value) : null })} placeholder="وارد نشده" /></label>
        <div className="flex min-w-0 items-center gap-2">{item.imageUrl ? <Image src={item.imageUrl} alt={`پیش‌نمایش ${item.name}`} width={48} height={48} unoptimized className="size-12 rounded-lg object-cover"/> : <span className="grid size-12 place-items-center rounded-lg bg-base-300 text-base-content/45"><ImagePlus size={17}/></span>}<button type="button" className="btn btn-outline btn-xs" disabled={busy || !item.name} onClick={() => void createDraftImage(item)}>ساخت عکس</button>{item.imageUrl && <button type="button" className="btn btn-ghost btn-xs" aria-label="حذف عکس پیش‌نمایش" onClick={() => patchDraft(item.key, { imageUrl: "" })}><X size={13}/></button>}</div>
        <div className="text-xs text-base-content/55">{item.priceToman ? formatPrice(item.priceToman) : "قیمت ثبت نشده"}</div>
      </article>)}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-[11px] leading-5 text-base-content/55">ثبت این مرحله فقط پیش‌نویس می‌سازد؛ برای نمایش در منو، قیمت را کامل و وضعیت دسترس‌پذیری را بعداً از صفحه محصولات بررسی کنید.</p><button type="button" className="btn btn-primary" disabled={busy || !drafts.length} onClick={() => void saveMenu()}>{busy ? <LoaderCircle className="animate-spin" size={16}/> : <Check size={16}/>}تأیید و ثبت پیش‌نویس</button></div>
    </div>}

    {generatedImage && <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-success/25 bg-success/5 p-3"><Image src={generatedImage} alt={`تصویر ساخته‌شده برای ${imageName}`} width={96} height={96} unoptimized className="size-24 rounded-xl object-cover"/><div><p className="font-bold">تصویر آمادهٔ بازبینی است</p><p className="mt-1 text-xs text-base-content/60">{savedImageProduct ? `تصویر روی «${savedImageProduct}» ذخیره شد.` : "این تصویر هنوز به محصولی متصل نشده است."}</p></div></div>}
  </section>;
}
