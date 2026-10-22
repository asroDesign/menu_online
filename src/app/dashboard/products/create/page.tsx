"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCollection, api } from "@/lib/api";
import { useFeatures } from "@/components/features";
import { ImageUpload } from "@/components/image-upload";
import { notifySetupSaved } from "@/lib/onboarding-tour";
import { AmountInput, Button, Card, Field, Icon, Input, Modal, PageHeader, Select, Switch, Textarea, useToast } from "@/components/ui";
import { formatPrice, toFa } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
import { calculateRecipeCost, calculateTargetPrice, currentRecipeMaterialCost, type PriceTargetType } from "@/lib/price-target-core";
import { ALLERGEN_TAGS, DIETARY_TAGS, optionId, type ProductOptionGroup } from "@/lib/product-options";

type Material = { id: number; name: string; unit: string; recipeUnit?: string; recipeToStockFactor?: number; costPerUnit: number; lastPurchaseCost?: number; stock: number; isActive?: boolean };
type IngredientLine = { key: string; recipeId?: number; itemId: string; quantity: string; wastePercent: string };
type SavedRecipe = { id: number; productId: number; itemId: number; quantity: number; wastePercent: number };
type PriceVariant = { id: string; name: string; price: string; active: boolean };
type Preview = {
  batchCost: number; unitCost: number; profitPerUnit: number; suggestedPrice: number;
  priceFactor: number; materialSharePercent: number; outputUnits: number;
  lines: { itemId: number; name: string; unit: string; stockUnit: string; recipeToStockFactor: number; batchQuantity: number; quantityPerUnit: number; costPerUnit: number; costBasis: "last_purchase" | "stock_average"; wastePercent: number; extendedCost: number }[];
};

const digits = (value: string) => value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "");
const numberText = (value: string, fallback = 0) => {
  const normalized = digits(value);
  return normalized === "" ? fallback : Number(normalized);
};
const priceVariantGroupId = "product-price-variants";

export default function CreateProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editParam = searchParams.get("edit");
  const parsedEditId = Number(editParam);
  const editingMode = editParam !== null;
  const editingId = editingMode && Number.isSafeInteger(parsedEditId) && parsedEditId > 0 ? parsedEditId : null;
  const invalidEditId = editingMode && editingId === null;
  const toast = useToast();
  const features = useFeatures();
  const hasRecipes = features.has("recipes");
  const hasCosting = features.has("costing");
  const categories = useCollection<Category>("/api/categories");
  const materials = useCollection<Material>("/api/r/items");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [oldPrice, setOldPrice] = useState("");
  const [prepMinutes, setPrepMinutes] = useState("10");
  const [imageUrl, setImageUrl] = useState("");
  const [emoji, setEmoji] = useState("");
  const [available, setAvailable] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [arModelUrl, setArModelUrl] = useState("");
  const [modifierGroups, setModifierGroups] = useState<ProductOptionGroup[]>([]);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [allergenTags, setAllergenTags] = useState<string[]>([]);
  const [variants, setVariants] = useState<PriceVariant[]>([]);
  const [ingredients, setIngredients] = useState<IngredientLine[]>([]);
  const [initialRecipes, setInitialRecipes] = useState<SavedRecipe[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [loadError, setLoadError] = useState<{ productId: number; message: string } | null>(null);
  const [outputUnits, setOutputUnits] = useState("1");
  const [yieldRatio, setYieldRatio] = useState("1");
  const [sellingMode, setSellingMode] = useState<"count" | "weight">("count");
  const [targetType, setTargetType] = useState<PriceTargetType>("gross_margin");
  const [targetPercent, setTargetPercent] = useState("30");
  const [preview, setPreview] = useState<{ key: string; value: Preview } | null>(null);
  const [busy, setBusy] = useState(false);
  const [categoryModal, setCategoryModal] = useState(false);
  const [recipeHelpOpen, setRecipeHelpOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editingId === null) return;
    let current = true;
    Promise.all([
      api<{ items: Product[] }>("/api/products"),
      hasRecipes || hasCosting ? api<{ items: SavedRecipe[] }>("/api/r/recipes") : Promise.resolve({ items: [] as SavedRecipe[] }),
    ]).then(([productData, recipeData]) => {
      if (!current) return;
      const product = productData.items.find((item) => item.id === editingId);
      if (!product) { setLoadError({ productId: editingId, message: "محصول مورد نظر پیدا نشد یا به آن دسترسی ندارید." }); return; }
      setLoadError(null);
      setEditingProduct(product);
      setName(product.name); setCategoryId(product.categoryId ? String(product.categoryId) : "");
      setDescription(product.description ?? ""); setBasePrice(String(product.price)); setOldPrice(product.oldPrice ? String(product.oldPrice) : "");
      setPrepMinutes(String(product.prepMinutes ?? 10)); setImageUrl(product.imageUrl ?? ""); setEmoji(product.emoji || "");
      setAvailable(product.isAvailable); setFeatured(product.isFeatured);
      setSellingMode(product.sellingMode === "weight" ? "weight" : "count"); setYieldRatio(String(product.yieldRatio ?? 1));
      setArModelUrl(product.arModelUrl ?? ""); setDietaryTags(product.dietaryTags ?? []); setAllergenTags(product.allergenTags ?? []);
      const priceGroup = (product.modifierGroups ?? []).find((group) => group.id === priceVariantGroupId);
      setVariants(priceGroup?.options.map((option) => ({ id: option.id, name: option.name, price: String(product.price + option.priceDelta), active: option.active })) ?? []);
      setModifierGroups((product.modifierGroups ?? []).filter((group) => group.id !== priceVariantGroupId));
      const rows = recipeData.items.filter((line) => line.productId === product.id);
      setInitialRecipes(rows);
      setIngredients(rows.map((line) => ({ key: `saved-${line.id}`, recipeId: line.id, itemId: String(line.itemId), quantity: String(line.quantity), wastePercent: String(line.wastePercent ?? 0) })));
      setOutputUnits("1");
    }).catch((cause) => { if (current) setLoadError({ productId: editingId, message: (cause as Error).message }); });
    return () => { current = false; };
  }, [editingId, hasRecipes, hasCosting]);

  const productLoadError = editingId !== null && loadError?.productId === editingId ? loadError.message : "";
  const productLoading = editingId !== null && editingProduct?.id !== editingId && !productLoadError;

  const previewKey = JSON.stringify({ ingredients, outputUnits, yieldRatio, sellingMode, targetType, targetPercent });
  const activePreview = preview?.key === previewKey ? preview.value : null;
  const activeVariants = variants.filter((variant) => variant.active);
  const canApplySuggestion = !!activePreview && (!variants.length || (activeVariants.length > 0 && activeVariants.every((variant) => variant.name.trim() && Number.isSafeInteger(numberText(variant.price, NaN)) && numberText(variant.price) >= 0 && numberText(variant.price) <= 100_000_000)));
  const selectedLines = useMemo(() => ingredients.map((line) => ({
    ...line,
    itemId: Number(line.itemId),
    quantity: numberText(line.quantity),
    wastePercent: numberText(line.wastePercent),
    material: materials.items.find((item) => item.id === Number(line.itemId)),
  })), [ingredients, materials.items]);
  const localEstimate = useMemo(() => {
    const rows = selectedLines;
    if (!rows.length || rows.some((line) => !line.material || !Number.isFinite(line.quantity) || line.quantity <= 0 || currentRecipeMaterialCost(line.material.lastPurchaseCost, line.material.costPerUnit).costPerUnit <= 0)) return null;
    try {
      const result = calculateRecipeCost(rows.map((line) => ({ quantity: line.quantity * (line.material!.recipeToStockFactor ?? 1), costPerUnit: currentRecipeMaterialCost(line.material!.lastPurchaseCost, line.material!.costPerUnit).costPerUnit, wastePercent: line.wastePercent })), numberText(outputUnits), sellingMode === "weight" ? numberText(yieldRatio, 1) : 1);
      const price = calculateTargetPrice(result.unitCost, numberText(targetPercent), targetType);
      return { batchCost: result.batchCost, unitCost: result.unitCost, suggestedPrice: price, profitPerUnit: price - result.unitCost, priceFactor: result.unitCost ? Number((price / result.unitCost).toFixed(2)) : 0, materialSharePercent: Number((result.unitCost / price * 100).toFixed(1)) };
    } catch { return null; }
  }, [selectedLines, outputUnits, sellingMode, targetPercent, targetType, yieldRatio]);

  function changeVariant(id: string, patch: Partial<PriceVariant>) {
    setVariants((list) => list.map((variant) => variant.id === id ? { ...variant, ...patch } : variant));
    setPreview(null);
  }
  function addVariant(nameHint = "") {
    setVariants((list) => [...list, { id: optionId("price"), name: nameHint, price: "", active: true }]);
  }
  function changeIngredient(id: string, patch: Partial<IngredientLine>) {
    setIngredients((list) => list.map((line) => line.key === id ? { ...line, ...patch } : line));
    setPreview(null);
  }
  function updateModifierGroup(id: string, update: (group: ProductOptionGroup) => ProductOptionGroup) {
    setModifierGroups((list) => list.map((group) => group.id === id ? update(group) : group));
  }
  function toggleProductTag(field: "dietaryTags" | "allergenTags", id: string) {
    const update = field === "dietaryTags" ? setDietaryTags : setAllergenTags;
    const selected = field === "dietaryTags" ? dietaryTags : allergenTags;
    update(selected.includes(id) ? selected.filter((tag) => tag !== id) : [...selected, id]);
  }

  async function calculate() {
    setError("");
    if (!hasCosting) { setError("آنالیز قیمت در پلن فعلی فعال نیست."); return; }
    if (!selectedLines.length || selectedLines.some((line) => !line.itemId || !line.material || line.quantity <= 0)) { setError("ماده و مقدار همه ردیف‌های دستور تهیه را کامل کنید."); return; }
    setBusy(true);
    try {
      const data = await api<{ item: Preview }>("/api/costing/preview", {
        method: "POST",
        body: {
          lines: selectedLines.map(({ itemId, quantity, wastePercent }) => ({ itemId, quantity, wastePercent })),
          outputUnits: numberText(outputUnits), sellingMode, yieldRatio: numberText(yieldRatio, 1), targetType,
          targetPercent: numberText(targetPercent),
        },
      });
      setPreview({ key: previewKey, value: data.item });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  function applySuggestedPrice() {
    if (!activePreview || !canApplySuggestion) return;
    if (!variants.length) setBasePrice(String(activePreview.suggestedPrice));
    else {
      const minPrice = Math.min(...activeVariants.map((variant) => numberText(variant.price)));
      const delta = activePreview.suggestedPrice - minPrice;
      setVariants((list) => list.map((variant) => variant.active ? { ...variant, price: String(Math.max(0, numberText(variant.price) + delta)) } : variant));
      setBasePrice(String(activePreview.suggestedPrice));
    }
  }

  async function createCategory() {
    if (!newCategoryName.trim()) return;
    setCategoryBusy(true);
    try {
      const data = await api<{ item: Category }>("/api/categories", { method: "POST", body: { name: newCategoryName.trim(), emoji: "" } });
      await categories.reload(true);
      setCategoryId(String(data.item.id));
      setNewCategoryName(""); setCategoryModal(false);
      toast("دسته‌بندی ساخته شد");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setCategoryBusy(false); }
  }

  async function save() {
    setError("");
    if (invalidEditId) { setError("شناسهٔ محصول برای ویرایش معتبر نیست."); return; }
    if (!name.trim()) { setError("نام محصول را وارد کنید."); return; }
    if (!categoryId && !editingId) { setError("برای ثبت محصول، یک دسته‌بندی انتخاب کنید."); return; }
    if (description.length > 400) { setError("توضیحات حداکثر ۴۰۰ نویسه است."); return; }
    const output = numberText(outputUnits, NaN);
    if (!Number.isSafeInteger(output) || output < 1 || output > 100_000) { setError("تعداد واحد خروجی باید عدد صحیح بین ۱ تا ۱۰۰٬۰۰۰ باشد."); return; }
    if (sellingMode === "weight" && variants.some((variant) => variant.active)) { setError("برای فروش وزنی، تنوع قیمت فعال نیست؛ نرخ هر کیلو را وارد کنید."); return; }
    const activeVariants = variants.filter((variant) => variant.active);
    if (variants.length && (!activeVariants.length || activeVariants.some((variant) => !variant.name.trim() || !Number.isSafeInteger(numberText(variant.price, NaN)) || numberText(variant.price) < 0 || numberText(variant.price) > 100_000_000))) { setError("عنوان و قیمت تنوع‌های فعال را تا سقف ۱۰۰ میلیون تومان کامل کنید."); return; }
    const rawPrice = activeVariants.length ? Math.min(...activeVariants.map((variant) => numberText(variant.price))) : numberText(basePrice, NaN);
    if (!Number.isSafeInteger(rawPrice) || rawPrice < 0) { setError("قیمت محصول معتبر وارد کنید."); return; }
    if (activeVariants.length && activeVariants.length > 10) { setError("حداکثر ۱۰ تنوع قیمت فعال می‌توانید ثبت کنید."); return; }
    if (!editingId && ingredients.length && !hasRecipes) { setError("دستور تهیه در پلن فعلی فعال نیست."); return; }
    if (hasRecipes && ingredients.some((line) => !line.itemId || !Number.isFinite(numberText(line.quantity)) || numberText(line.quantity) <= 0 || numberText(line.wastePercent, NaN) < 0 || numberText(line.wastePercent, NaN) > 99.9)) { setError("ماده، مقدار و ضایعات دستور تهیه را بررسی کنید."); return; }
    if (hasRecipes && new Set(ingredients.map((line) => line.itemId)).size !== ingredients.length) { setError("هر ماده اولیه را فقط یک بار به دستور تهیه اضافه کنید."); return; }

    const priceGroup: ProductOptionGroup | null = activeVariants.length ? {
      id: priceVariantGroupId, name: "تنوع قیمت", required: true, min: 1, max: 1, active: true,
      options: activeVariants.map((variant) => ({ id: variant.id, name: variant.name.trim(), priceDelta: numberText(variant.price) - rawPrice, active: true })),
    } : null;
    const recipePerUnit = hasRecipes ? ingredients.map((line) => ({ recipeId: line.recipeId, itemId: Number(line.itemId), quantity: numberText(line.quantity) / (editingId ? 1 : output), wastePercent: numberText(line.wastePercent) })) : [];
    const payload = {
      name: name.trim(), description: description.trim(), price: rawPrice, oldPrice: oldPrice ? numberText(oldPrice) : null,
      categoryId: categoryId ? Number(categoryId) : null, emoji, imageUrl: imageUrl.trim(), prepMinutes: Math.max(0, Math.min(300, numberText(prepMinutes, 10))),
      sellingMode, yieldRatio: sellingMode === "weight" ? numberText(yieldRatio, 1) : 1,
      isAvailable: available, isFeatured: featured, modifierGroups: [...modifierGroups, ...(priceGroup ? [priceGroup] : [])],
      dietaryTags, allergenTags, arModelUrl: arModelUrl.trim(),
    };
    setBusy(true);
    let createdId: number | null = null;
    let cleanupFailed = false;
    const createdRecipes: number[] = [];
    const changedRecipes: SavedRecipe[] = [];
    const removedRecipes: SavedRecipe[] = [];
    try {
      let productId = editingId;
      if (!productId) {
        const product = await api<{ item: { id: number } }>("/api/products", { method: "POST", body: payload });
        productId = product.item.id;
        createdId = productId;
      }
      if (hasRecipes) {
        for (const recipe of recipePerUnit) {
          const body = { productId, itemId: recipe.itemId, quantity: recipe.quantity, wastePercent: recipe.wastePercent };
          if (recipe.recipeId) {
            const before = initialRecipes.find((row) => row.id === recipe.recipeId);
            if (before) changedRecipes.push(before);
            await api(`/api/r/recipes/${recipe.recipeId}`, { method: "PATCH", body });
          } else {
            const response = await api<{ item: SavedRecipe }>("/api/r/recipes", { method: "POST", body });
            createdRecipes.push(response.item.id);
          }
        }
        const keepIds = new Set(recipePerUnit.map((recipe) => recipe.recipeId).filter((id): id is number => !!id));
        for (const before of initialRecipes.filter((row) => !keepIds.has(row.id))) {
          await api(`/api/r/recipes/${before.id}`, { method: "DELETE" });
          removedRecipes.push(before);
        }
      }
      if (editingId) await api(`/api/products/${editingId}`, { method: "PATCH", body: payload });
      else notifySetupSaved("products");
      toast(editingId ? "محصول و دستور تهیه به‌روزرسانی شد" : "محصول با تنوع‌ها و دستور تهیه ثبت شد");
      router.replace("/dashboard/products");
      router.refresh();
    } catch (e) {
      if (createdId) {
        for (const id of createdRecipes) { try { await api(`/api/r/recipes/${id}`, { method: "DELETE" }); } catch { cleanupFailed = true; } }
        try { await api(`/api/products/${createdId}`, { method: "DELETE" }); }
        catch { cleanupFailed = true; }
      } else if (editingId) {
        for (const id of createdRecipes) { try { await api(`/api/r/recipes/${id}`, { method: "DELETE" }); } catch { cleanupFailed = true; } }
        for (const row of changedRecipes) { try { await api(`/api/r/recipes/${row.id}`, { method: "PATCH", body: { productId: row.productId, itemId: row.itemId, quantity: row.quantity, wastePercent: row.wastePercent } }); } catch { cleanupFailed = true; } }
        for (const row of removedRecipes) { try { await api("/api/r/recipes", { method: "POST", body: { productId: row.productId, itemId: row.itemId, quantity: row.quantity, wastePercent: row.wastePercent } }); } catch { cleanupFailed = true; } }
      }
      setError(cleanupFailed ? "ذخیرهٔ کامل انجام نشد و بازگردانی خودکار هم کامل نشد. محصول و دستور تهیه را بازبینی کنید." : (e as Error).message);
    } finally { setBusy(false); }
  }

  const chosenIds = new Set(ingredients.map((line) => line.itemId).filter(Boolean));
  const addQuickVariant = (label: string) => addVariant(label);

  return <div className="mx-auto max-w-screen-2xl animate-fade-in pb-24">
    <nav aria-label="مسیر صفحه" className="mb-4 text-sm text-stone-500"><ol className="flex flex-wrap items-center gap-2"><li><Link href="/dashboard" className="hover:text-brand-700">داشبورد</Link></li><li aria-hidden="true">‹</li><li><Link href="/dashboard/products" className="hover:text-brand-700">محصولات منو</Link></li><li aria-hidden="true">‹</li><li className="font-semibold text-stone-800">{editingId ? "ویرایش محصول" : "ایجاد محصول"}</li></ol></nav>
    <PageHeader title={editingMode ? "ویرایش محصول" : "ایجاد محصول"} subtitle={editingMode ? "همهٔ اطلاعات محصول، تنوع‌ها، دستور تهیه و قیمت‌گذاری را در همین صفحه ویرایش کنید." : "اطلاعات محصول، تنوع قیمت و دستور تهیه را یک‌جا ثبت کنید."} actions={<div className="flex gap-2"><Button variant="ghost" onClick={() => router.push("/dashboard/products")}><Icon name="arrowRight" className="size-4"/> بازگشت</Button><Button data-tour="product-save" onClick={save} loading={busy} disabled={productLoading || invalidEditId}><Icon name="check" className="size-4"/> {editingMode ? "ذخیره تغییرات" : "افزودن محصول"}</Button></div>} />
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-700">{error}</p>}

    {invalidEditId ? <Card className="p-8 text-center text-sm text-rose-700"><p role="alert">شناسهٔ محصول برای ویرایش معتبر نیست.</p></Card> : editingMode && editingId !== null && editingProduct?.id !== editingId ? <Card className="p-8 text-center text-sm text-stone-600"><p role={productLoadError ? "alert" : undefined}>{productLoading ? "در حال بارگذاری اطلاعات محصول…" : productLoadError || "محصول بارگذاری نشد. از فهرست محصولات دوباره وارد ویرایش شوید."}</p></Card> : <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <Card className="space-y-5 p-4 sm:p-6">
          <SectionTitle title="اطلاعات محصول" description="نام و دسته‌بندی در منوی مشتری نمایش داده می‌شود." />
          <Field label="نام محصول *"><Input data-tour="product-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً کاپوچینو" autoFocus /></Field>
          <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="product-category" className="text-sm font-semibold">دسته‌بندی <span className="text-rose-500">*</span></label><div className="flex items-center gap-3 text-xs"><Link href="/dashboard/categories" className="font-semibold text-brand-700">مدیریت</Link><button type="button" onClick={() => setCategoryModal(true)} className="font-semibold text-brand-700">+ دسته جدید</button></div></div>
          {categories.items.length === 0 && !categories.loading ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">برای ثبت محصول ابتدا یک دسته‌بندی بسازید.</p> : <Select data-tour="product-category" id="product-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option key="empty" value="">انتخاب دسته‌بندی</option>{categories.items.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select>}
          <Field label="توضیحات" hint={`${toFa(description.length)}/۴۰۰`}><Textarea data-tour="product-description" rows={3} maxLength={400} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مواد تشکیل‌دهنده، مقدار یا توضیح کوتاه محصول" /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="زمان آماده‌سازی (دقیقه)"><Input data-tour="product-prep" inputMode="numeric" value={prepMinutes} onChange={(e) => setPrepMinutes(e.target.value)} placeholder="۱۰" /></Field><Field label="نوع فروش"><Select data-tour="product-mode" value={sellingMode} onChange={(e) => { setSellingMode(e.target.value as "count" | "weight"); setPreview(null); }}><option key="count" value="count">تعدادی</option><option key="weight" value="weight">وزنی (قیمت هر کیلو)</option></Select></Field></div>
          {sellingMode === "weight" && <Field label="بازده خام به پخته" hint="مثلاً ۰٫۸ یعنی برای هر کیلو محصول پخته، ۱٫۲۵ کیلو ماده خام لازم است."><Input dir="ltr" inputMode="decimal" value={yieldRatio} onChange={(e) => { setYieldRatio(e.target.value); setPreview(null); }} placeholder="0.8" /></Field>}
        </Card>

        <Card className="space-y-5 p-4 sm:p-6">
          <SectionTitle title="قیمت‌گذاری محصول" description="قیمت پایه برای سفارش‌های بدون تنوع استفاده می‌شود؛ با تنوع فعال، کمترین قیمت آن‌ها قیمت پایهٔ منو است." />
          <div className="grid gap-3 sm:grid-cols-2"><Field label={sellingMode === "weight" ? "قیمت هر کیلوگرم (تومان) *" : "قیمت پایه (تومان) *"}><AmountInput data-tour="product-price" value={basePrice} onValueChange={setBasePrice} placeholder="مثلاً ۱۲۰٬۰۰۰" /></Field><Field label="قیمت قبل از تخفیف (اختیاری)"><AmountInput value={oldPrice} onValueChange={setOldPrice} placeholder="۰" /></Field></div>
          <div className="rounded-2xl border border-stone-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">تنوع قیمت</h3><p className="mt-1 text-xs leading-6 text-stone-500">هر سفارش باید یک تنوع فعال را انتخاب کند؛ مبلغ انتخابی در سرور به قیمت سفارش افزوده می‌شود.</p></div><Button size="sm" variant="secondary" disabled={sellingMode === "weight"} onClick={() => addVariant()}><Icon name="plus" className="size-4"/> تنوع جدید</Button></div>
            {sellingMode === "weight" && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-900">برای محصول وزنی، نرخ ترازو مبنای قیمت است و تنوع قیمت فعال نمی‌شود.</p>}
            {variants.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-stone-300 px-4 py-5 text-center"><p className="text-sm font-semibold">هنوز تنوعی اضافه نکرده‌اید</p><p className="mt-1 text-xs text-stone-500">مثلاً «سایز بزرگ» با مبلغ جدا یا «سایز کوچک»</p><div className="mt-3 flex flex-wrap justify-center gap-2">{["سایز بزرگ", "سایز کوچک", "سیروپ اضافه"].map((label) => <button type="button" key={label} disabled={sellingMode === "weight"} onClick={() => addQuickVariant(label)} className="rounded-full border border-stone-200 px-3 py-1.5 text-xs hover:border-brand-300 hover:text-brand-700 disabled:opacity-40">+ {label}</button>)}</div></div> : <div className="mt-4 space-y-2">{variants.map((variant, index) => <div key={variant.id} className="grid gap-2 rounded-xl bg-stone-50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(120px,180px)_auto_auto] sm:items-end"><Field label={`تنوع ${toFa(index + 1)}`}><Input value={variant.name} onChange={(e) => changeVariant(variant.id, { name: e.target.value })} placeholder="مثلاً سایز بزرگ" /></Field><Field label="مبلغ (تومان)"><AmountInput value={variant.price} onValueChange={(price) => changeVariant(variant.id, { price })} placeholder="۰" /></Field><label className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" className="checkbox checkbox-sm" checked={variant.active} onChange={(e) => changeVariant(variant.id, { active: e.target.checked })}/> فعال</label><button type="button" aria-label="حذف تنوع" onClick={() => { setVariants((list) => list.filter((item) => item.id !== variant.id)); setPreview(null); }} className="min-h-10 rounded-lg px-3 text-sm text-rose-600 hover:bg-rose-50">حذف</button></div>)}</div>}
          </div>
        </Card>

        <Card className="space-y-4 p-4 sm:p-6">
          <SectionTitle title="گزینه‌ها و ویژگی‌های محصول" description="آیتم‌های این فرم هنگام افزودن و ویرایش یکسان‌اند و در صفحهٔ سفارش نیز به کار می‌روند." />
          <div><p className="mb-2 text-sm font-semibold">آیکن محصول</p><div className="flex flex-wrap gap-2">{["", "", "", "", "", "", "", ""].map((glyph) => <button key={glyph} type="button" aria-label={`انتخاب آیکن ${glyph}`} aria-pressed={emoji === glyph} onClick={() => setEmoji(glyph)} className={`flex size-10 items-center justify-center rounded-xl border text-lg ${emoji === glyph ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-200" : "border-stone-200 hover:bg-stone-50"}`}>{glyph}</button>)}</div></div>
          <section className="space-y-3 rounded-2xl border border-stone-200 p-4" aria-label="افزودنی‌ها و انتخاب‌های محصول">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">افزودنی‌ها و انتخاب‌ها</h3><p className="mt-1 text-xs text-stone-500">قیمت گزینه‌ها هنگام ثبت سفارش سمت سرور محاسبه می‌شود.</p></div><Button size="sm" variant="secondary" onClick={() => setModifierGroups((list) => [...list, { id: optionId("group"), name: "", required: false, min: 0, max: 1, active: true, options: [{ id: optionId("option"), name: "", priceDelta: 0, active: true }] }])}><Icon name="plus" className="size-4" />افزودن گروه</Button></div>
            {modifierGroups.map((group) => <div key={group.id} className="space-y-3 rounded-xl bg-stone-50 p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_auto] sm:items-end"><Field label="نام گروه"><Input value={group.name} onChange={(event) => updateModifierGroup(group.id, (current) => ({ ...current, name: event.target.value }))} placeholder="مثلاً مخلفات" /></Field><Field label="حداقل"><Input type="number" min="0" max="10" value={group.min} onChange={(event) => updateModifierGroup(group.id, (current) => ({ ...current, min: Number(event.target.value), required: Number(event.target.value) > 0 }))} /></Field><Field label="حداکثر"><Input type="number" min="1" max="10" value={group.max} onChange={(event) => updateModifierGroup(group.id, (current) => ({ ...current, max: Number(event.target.value) }))} /></Field><Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setModifierGroups((list) => list.filter((entry) => entry.id !== group.id))}>حذف گروه</Button></div>
              {group.options.map((option) => <div key={option.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto_auto] sm:items-center"><Input aria-label="نام گزینه" value={option.name} onChange={(event) => updateModifierGroup(group.id, (current) => ({ ...current, options: current.options.map((entry) => entry.id === option.id ? { ...entry, name: event.target.value } : entry) }))} placeholder="مثلاً پنیر اضافه" /><AmountInput allowNegative aria-label="تغییر قیمت گزینه" value={option.priceDelta} onValueChange={(price) => updateModifierGroup(group.id, (current) => ({ ...current, options: current.options.map((entry) => entry.id === option.id ? { ...entry, priceDelta: Number(price) || 0 } : entry) }))} placeholder="تغییر قیمت (تومان)" /><label className="flex items-center gap-2 text-xs"><input type="checkbox" className="checkbox checkbox-sm" checked={option.active} onChange={(event) => updateModifierGroup(group.id, (current) => ({ ...current, options: current.options.map((entry) => entry.id === option.id ? { ...entry, active: event.target.checked } : entry) }))} />فعال</label><Button size="sm" variant="ghost" disabled={group.options.length <= 1} onClick={() => updateModifierGroup(group.id, (current) => { const options = current.options.filter((entry) => entry.id !== option.id); return { ...current, options, min: Math.min(current.min, options.filter((entry) => entry.active).length), max: Math.max(1, Math.min(current.max, options.length)) }; })}>حذف</Button></div>)}
              <div className="flex flex-wrap items-center justify-between gap-2"><Button size="sm" variant="ghost" onClick={() => updateModifierGroup(group.id, (current) => ({ ...current, options: [...current.options, { id: optionId("option"), name: "", priceDelta: 0, active: true }], max: Math.min(10, current.max + 1) }))}><Icon name="plus" className="size-4" />افزودن گزینه</Button><label className="flex items-center gap-2 text-xs"><input type="checkbox" className="checkbox checkbox-sm" checked={group.active} onChange={(event) => updateModifierGroup(group.id, (current) => ({ ...current, active: event.target.checked }))} />گروه فعال</label></div>
            </div>)}
          </section>
          <div className="grid gap-4 sm:grid-cols-2"><fieldset><legend className="mb-2 text-sm font-bold">ویژگی‌های تغذیه‌ای</legend><div className="flex flex-wrap gap-2">{DIETARY_TAGS.map((tag) => <label key={tag.id} className="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-2 text-xs"><input type="checkbox" className="checkbox checkbox-xs" checked={dietaryTags.includes(tag.id)} onChange={() => toggleProductTag("dietaryTags", tag.id)} />{tag.label}</label>)}</div></fieldset><fieldset><legend className="mb-2 text-sm font-bold">آلرژن‌های اعلام‌شده</legend><div className="flex flex-wrap gap-2">{ALLERGEN_TAGS.map((tag) => <label key={tag.id} className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs"><input type="checkbox" className="checkbox checkbox-xs" checked={allergenTags.includes(tag.id)} onChange={() => toggleProductTag("allergenTags", tag.id)} />{tag.label}</label>)}</div><p className="mt-2 text-xs text-stone-500">خالی بودن فهرست به معنی نبود آلرژن نیست.</p></fieldset></div>
          {features.has("ar") && <Field label="مدل سه‌بعدی واقعیت افزوده (GLB)" hint="اختیاری؛ URL مدل سه‌بعدی محصول"><Input className="text-left" dir="ltr" value={arModelUrl} onChange={(event) => setArModelUrl(event.target.value)} placeholder="https://…/model.glb" /></Field>}
        </Card>

        <Card className="space-y-4 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
            <div>
              <h2 className="text-lg font-extrabold">دستور تهیه</h2>
              <p className="mt-1 text-xs leading-6 text-stone-500">{editingId ? "مقدار هر ماده در این فرم به‌ازای یک واحد محصول است." : "مقدار هر ماده را برای کل batch وارد کنید؛ تعداد خروجی در آنالیز قیمت، مقدار ذخیره‌شده برای هر واحد را محاسبه می‌کند."}</p>
            </div>
            <button type="button" onClick={() => setRecipeHelpOpen(true)} aria-label="راهنمای ثبت دستور تهیه" title="راهنمای ثبت دستور تهیه" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-brand-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Icon name="book" className="size-4"/></button>
          </div>
          {!hasRecipes && <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">دسترسی دستور تهیه در پلن فعلی فعال نیست. برای استفاده، پلن را ارتقا دهید.</p>}
          {materials.error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">دریافت مواد اولیه ممکن نشد: {materials.error}</p>}
          {hasRecipes && !materials.loading && !materials.error && materials.items.filter((item) => item.isActive !== false).length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4"><div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-700"><Icon name="box" className="size-4"/></span><div className="min-w-0"><p className="text-sm font-bold text-amber-950">مادهٔ اولیهٔ فعالی برای دستور تهیه در دسترس نیست</p><p className="mt-1 text-xs leading-6 text-amber-900">مواد مصرفی دستور تهیه از فهرست انبار انتخاب می‌شوند. یک مادهٔ جدید ثبت یا قلم موجود را فعال کنید؛ سپس به این فرم برگردید تا مقدار مصرف را وارد کنید.</p><Link href="/dashboard/inventory/add" className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"><Icon name="plus" className="size-3.5"/> رفتن به ثبت کالای انبار</Link></div></div></div>}
          {ingredients.map((line, index) => {
            const material = materials.items.find((item) => item.id === Number(line.itemId));
            const materialCost = material ? currentRecipeMaterialCost(material.lastPurchaseCost, material.costPerUnit) : null;
            return <div key={line.key} className="rounded-xl border border-stone-200 p-3 sm:p-4"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-end"><Field label={`ماده اولیه ${toFa(index + 1)}`}><Select disabled={!hasRecipes} value={line.itemId} onChange={(e) => changeIngredient(line.key, { itemId: e.target.value })}><option key="empty-material" value="">انتخاب ماده اولیه</option>{materials.items.filter((item) => item.isActive !== false || line.itemId === String(item.id)).map((item) => { const cost = currentRecipeMaterialCost(item.lastPurchaseCost, item.costPerUnit); return <option key={item.id} value={item.id} disabled={chosenIds.has(String(item.id)) && line.itemId !== String(item.id)}>{item.name} · {formatPrice(cost.costPerUnit)}/{item.unit}{item.isActive === false ? " · غیرفعال" : ""}</option>; })}</Select></Field><Field label={`مقدار مصرف (${material?.recipeUnit ?? "واحد"})`}><Input disabled={!hasRecipes} inputMode="decimal" value={line.quantity} onChange={(e) => changeIngredient(line.key, { quantity: e.target.value })} placeholder="۰" /></Field><button type="button" aria-label="حذف ماده اولیه" disabled={!hasRecipes} onClick={() => { setIngredients((list) => list.filter((item) => item.key !== line.key)); setPreview(null); }} className="min-h-10 rounded-lg px-3 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">حذف</button></div><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr]"><div className="rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600">واحد مصرف: <b>{material?.recipeUnit ?? "—"}</b><br/>واحد انبار: <b>{material?.unit ?? "—"}</b><br/>ضریب: <b>{toFa(material?.recipeToStockFactor ?? 1)}</b></div><Field label={`بهای مبنا (تومان / ${material?.unit ?? "—"})`}><div className="flex h-10 items-center rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm">{materialCost ? formatPrice(materialCost.costPerUnit) : "—"}</div>{materialCost && <small className="text-xs text-stone-500">{materialCost.costBasis === "last_purchase" ? "آخرین خرید ثبت‌شده" : "میانگین بهای موجودی"}</small>}</Field><Field label="ضایعات ٪"><Input disabled={!hasRecipes} type="number" min="0" max="99.9" step="0.1" value={line.wastePercent} onChange={(e) => changeIngredient(line.key, { wastePercent: e.target.value })} /></Field></div>{material && materialCost && <p className="mt-2 text-xs text-stone-500">هزینهٔ این خط {editingId ? "برای هر واحد" : "پیش از تقسیم بر تعداد خروجی"}: {formatPrice(Math.round(numberText(line.quantity) * (material.recipeToStockFactor ?? 1) * (1 + numberText(line.wastePercent) / 100) * materialCost.costPerUnit / (editingId ? 1 : numberText(outputUnits, 1))))}</p>}</div>;
          })}
          <Button variant="secondary" className="w-full" disabled={!hasRecipes || materials.loading || materials.items.filter((item) => item.isActive !== false && !chosenIds.has(String(item.id))).length === 0} onClick={() => setIngredients((list) => [...list, { key: optionId("recipe"), itemId: "", quantity: "", wastePercent: "5" }])}><Icon name="plus" className="size-4"/> افزودن ماده اولیه</Button>
          {hasRecipes && materials.items.some((item) => item.isActive !== false) && materials.items.filter((item) => item.isActive !== false && !chosenIds.has(String(item.id))).length === 0 && <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600">همهٔ مواد فعال انبار در این دستور تهیه استفاده شده‌اند. برای افزودن ردیف تازه، مادهٔ دیگری به انبار اضافه کنید.</p>}
          <p className="text-xs leading-6 text-stone-500">مقدار مصرف به واحد مصرف در دستور تهیه وارد می‌شود و سرور با ضریب تبدیل، مقدار را به واحد انبار تبدیل می‌کند. ضایعات نیز پیش از محاسبهٔ هزینه و کسر موجودی اعمال می‌شود.</p>
        </Card>

        <Card className="space-y-4 p-4 sm:p-6">
          <SectionTitle title="آنالیز قیمت از روی مواد اولیه" description="دستور تهیه، بهای روز مواد، ضایعات، بازده و حاشیهٔ سود هدف، قیمت فروش پیشنهادی را مشخص می‌کند." />
          {!hasCosting && <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">محاسبهٔ رسمی قیمت در پلن فعلی فعال نیست. برآورد محلی نمایش داده می‌شود؛ برای عدد سرور، پلن قیمت‌گذاری را فعال کنید.</p>}
          <div className="grid gap-3 rounded-xl bg-blue-50/70 p-4 sm:grid-cols-2">{!editingId ? <Field label="تعداد واحد خروجی" hint="مثلاً تعداد لیوان، بشقاب یا بسته‌ای که این دستور تهیه تولید می‌کند."><Input type="number" min="1" step="1" value={outputUnits} onChange={(e) => { setOutputUnits(e.target.value); setPreview(null); }} /></Field> : <p className="self-end rounded-lg bg-white/70 p-3 text-xs leading-5 text-stone-600">مقدارها به‌ازای یک واحد ثبت می‌شوند؛ بهای مواد و قیمت پیشنهادی نیز برای یک واحد نمایش داده می‌شود.</p>}<Field label="مبنای قیمت هدف"><Select value={targetType} onChange={(e) => { setTargetType(e.target.value as PriceTargetType); setPreview(null); }}><option key="gross-margin" value="gross_margin">حاشیه سود ناخالص</option><option key="food-cost" value="food_cost">سهم بهای مواد از قیمت فروش</option></Select></Field><Field label={targetType === "gross_margin" ? "حاشیه سود هدف ٪" : "سهم هدف مواد ٪"} hint={targetType === "gross_margin" ? `سهم مواد از قیمت هدف: ${toFa(100 - numberText(targetPercent, 30))}٪` : "درصد بالاتر، قیمت پیشنهادی پایین‌تری می‌دهد."}><Input type="number" min="1" max="99" step="1" value={targetPercent} onChange={(e) => { setTargetPercent(e.target.value); setPreview(null); }} /></Field>{sellingMode === "weight" && <Field label="بازده خام به پخته (۰ تا ۱)"><Input type="number" min="0.01" max="1" step="0.01" value={yieldRatio} onChange={(e) => { setYieldRatio(e.target.value); setPreview(null); }} /></Field>}</div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="overflow-hidden rounded-2xl border border-stone-200">
              <div className="border-b border-stone-200 bg-blue-50/70 px-4 py-3"><h3 className="font-bold">مواد اولیهٔ این محصول</h3><p className="mt-1 text-xs text-stone-500">مقدار، واحد، بهای واحد، ضایعات و هزینهٔ هر خط</p></div>
              {activePreview?.lines.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-stone-50 text-xs text-stone-500"><tr>{["ماده اولیه", "مقدار batch", "واحد مصرف / انبار", "بهای مبنا / واحد", "ضایعات", "هزینهٔ هر واحد"].map((label) => <th key={label} className="p-3 text-start">{label}</th>)}</tr></thead><tbody>{activePreview.lines.map((line) => <tr key={line.itemId} className="border-t border-stone-100"><td className="p-3 font-semibold">{line.name}</td><td className="p-3">{toFa(line.batchQuantity)}</td><td className="p-3">{line.unit} / {line.stockUnit}</td><td className="p-3">{formatPrice(line.costPerUnit)}<small className="mt-1 block text-stone-500">{line.costBasis === "last_purchase" ? "آخرین خرید" : "میانگین موجودی"}</small></td><td className="p-3">{toFa(line.wastePercent)}٪</td><td className="p-3">{formatPrice(line.extendedCost)}</td></tr>)}</tbody></table></div> : ingredients.length ? <div className="p-5 text-center text-sm leading-6 text-stone-500">ابتدا مواد و مقدار دستور تهیه را وارد کنید؛ سپس با محاسبهٔ سرور، بهای فعلی هر خط و قیمت پیشنهادی نمایش داده می‌شود.</div> : <div className="p-5 text-center text-sm leading-6 text-stone-500">برای تحلیل قیمت، ابتدا دست‌کم یک ماده اولیه و مقدار مصرف آن را در دستور تهیه اضافه کنید.</div>}
              <div className="grid gap-3 border-t border-stone-200 bg-stone-50/70 p-4 sm:grid-cols-2"><Metric label="هزینهٔ مواد کل" value={activePreview ? formatPrice(activePreview.batchCost) : localEstimate ? formatPrice(localEstimate.batchCost) : "—"} /><Metric label="هزینهٔ هر واحد" value={activePreview ? formatPrice(activePreview.unitCost) : localEstimate ? formatPrice(localEstimate.unitCost) : "—"} /></div>
            </div>
            <aside className="overflow-hidden rounded-2xl border border-stone-200">
              <div className="bg-brand-700 px-4 py-4 text-white"><p className="text-xs text-white/80">قیمت پیشنهادی فروش</p><p className="mt-1 text-2xl font-extrabold">{formatPrice(activePreview?.suggestedPrice ?? localEstimate?.suggestedPrice ?? 0)}</p><p className="mt-1 text-[11px] text-white/80">{activePreview ? "محاسبه‌شده با سرویس مواد اولیه" : localEstimate ? "برآورد محلی؛ برای عدد رسمی محاسبه را بزنید" : "پس از تکمیل دستور تهیه محاسبه می‌شود"}</p></div>
              <div className="divide-y divide-stone-100 text-sm">{[["سود هر واحد", activePreview ? formatPrice(activePreview.profitPerUnit) : localEstimate ? formatPrice(localEstimate.profitPerUnit) : "—"], ["ضریب قیمت", activePreview ? toFa(activePreview.priceFactor) : localEstimate ? toFa(localEstimate.priceFactor) : "—"], ["سهم مواد", activePreview ? `${toFa(activePreview.materialSharePercent)}٪` : localEstimate ? `${toFa(localEstimate.materialSharePercent)}٪` : "—"]].map(([label, value]) => <div key={label} className="flex justify-between gap-2 px-4 py-3"><span className="text-stone-500">{label}</span><b>{value}</b></div>)}</div>
              <div className="space-y-2 p-3"><Button className="w-full" variant="secondary" loading={busy} disabled={!ingredients.length || !hasCosting} onClick={calculate}><Icon name="calculator" className="size-4"/> محاسبه با سرویس</Button><Button className="w-full" variant="ghost" disabled={!canApplySuggestion} onClick={applySuggestedPrice}>ثبت قیمت پیشنهادی</Button></div>
            </aside>
          </div>
          <p className="rounded-xl bg-stone-50 p-3 text-xs leading-6 text-stone-600">فرمول: هزینهٔ هر واحد = مجموع مقدار ماده × بهای واحد × (۱ + درصد ضایعات) ÷ تعداد خروجی. در فروش وزنی، هزینه با بازده خام به پخته تعدیل می‌شود. قیمت هدف بر اساس سهم مواد یا حاشیهٔ سود ناخالص محاسبه و به نزدیک‌ترین تومان گرد می‌شود؛ قیمت فقط با ثبت صریح شما تغییر می‌کند.</p>
        </Card>
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5"><div><p className="font-bold">وضعیت محصول</p><p className="mt-1 text-xs text-stone-500">محصول ناموجود در منوی مشتری قابل سفارش نیست.</p></div><div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm"><Switch checked={available} onChange={setAvailable} label="موجود در منو"/> موجود در منو</label><label className="flex items-center gap-2 text-sm"><Switch checked={featured} onChange={setFeatured} label="پیشنهاد ویژه"/> پیشنهاد ویژه</label></div></Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4"><Card className="p-4 sm:p-5"><SectionTitle title="تصویر محصول" description="تصویر مربعی با حداقل اندازهٔ ۳۰۰ × ۳۰۰ پیکسل مناسب است."/><div data-tour="product-image" className="mt-4"><ImageUpload value={imageUrl} emoji={emoji} onChange={setImageUrl}/></div><p className="mt-3 text-xs leading-5 text-stone-500">فرمت‌های مجاز: JPG، PNG، WEBP یا HEIC. تصویر را اینجا رها کنید یا برای انتخاب کلیک کنید.</p></Card><Card className="space-y-3 p-4"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full bg-blue-50 text-brand-700"><Icon name="list" className="size-4"/></span><b className="text-sm">پیش از ثبت بررسی کنید</b></div><ChecklistItem done={!!name.trim()} label="نام محصول"/><ChecklistItem done={!!categoryId} label="دسته‌بندی"/><ChecklistItem done={variants.some((v) => v.active && v.name.trim() && Number.isFinite(numberText(v.price, NaN)))} label="تنوع قیمت (اختیاری)"/><ChecklistItem done={ingredients.length > 0} label="دستور تهیه (اختیاری)"/><ChecklistItem done={!!activePreview} label="آنالیز رسمی مواد (اختیاری)"/></Card></aside>
    </div>}

    <Modal
      open={categoryModal}
      onClose={() => setCategoryModal(false)}
      title="دسته‌بندی جدید"
      description="دسته را بسازید تا برای همین محصول انتخاب شود."
      size="sm"
      footer={<><Button variant="ghost" disabled={categoryBusy} onClick={() => setCategoryModal(false)}>انصراف</Button><Button loading={categoryBusy} onClick={createCategory}>ثبت دسته</Button></>}
    >
      <Field label="نام دسته‌بندی"><Input autoFocus value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void createCategory(); }} placeholder="مثلاً نوشیدنی گرم" /></Field>
    </Modal>
    <Modal
      open={recipeHelpOpen}
      onClose={() => setRecipeHelpOpen(false)}
      title="راهنمای ثبت دستور تهیه"
      description="با دستور تهیه، مصرف مواد و بهای تمام‌شدهٔ هر محصول را مشخص می‌کنید."
      size="md"
      footer={<Button variant="secondary" onClick={() => setRecipeHelpOpen(false)}>متوجه شدم</Button>}
    >
      <ol className="space-y-3 text-sm leading-7 text-stone-700">
        <li className="flex gap-2"><span className="font-extrabold text-brand-700">۱.</span><span>اگر ماده‌ای در فهرست نیست، ابتدا آن را در بخش انبار ثبت کنید؛ نام، واحد و بهای خرید همان‌جا نگه‌داری می‌شود.</span></li>
        <li className="flex gap-2"><span className="font-extrabold text-brand-700">۲.</span><span>به این فرم برگردید و «افزودن ماده اولیه» را بزنید، سپس مادهٔ مصرفی را انتخاب کنید.</span></li>
        <li className="flex gap-2"><span className="font-extrabold text-brand-700">۳.</span><span>مقدار مصرف، ضایعات و در محصول جدید تعداد خروجی دستور را وارد کنید. در ویرایش محصول، مقدار مصرف برای یک واحد محصول ثبت می‌شود.</span></li>
        <li className="flex gap-2"><span className="font-extrabold text-brand-700">۴.</span><span>پس از ذخیره، بخش آنالیز قیمت بهای مواد و قیمت پیشنهادی را با بهای ثبت‌شدهٔ انبار محاسبه می‌کند.</span></li>
      </ol>
      <Link href="/dashboard/inventory/add" onClick={() => setRecipeHelpOpen(false)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-800"><Icon name="box" className="size-4"/> رفتن به ثبت کالای انبار</Link>
    </Modal>
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 p-3 backdrop-blur lg:hidden"><div className="mx-auto flex max-w-screen-sm gap-2"><Button variant="ghost" className="flex-1" onClick={() => router.push("/dashboard/products")}>بازگشت</Button><Button className="flex-1" loading={busy} disabled={productLoading || invalidEditId} onClick={save}>{editingMode ? "ذخیره تغییرات" : "افزودن محصول"}</Button></div></div>
  </div>;
}

function SectionTitle({ title, description }: { title: string; description: string }) { return <div className="border-b border-stone-100 pb-3"><h2 className="text-lg font-extrabold">{title}</h2><p className="mt-1 text-xs leading-6 text-stone-500">{description}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-2 text-sm"><span className="text-stone-500">{label}</span><b>{value}</b></div>; }
function ChecklistItem({ done, label }: { done: boolean; label: string }) { return <div className="flex items-center gap-2 text-xs"><span className={`flex size-5 items-center justify-center rounded-full ${done ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-400"}`}><Icon name={done ? "check" : "minus"} className="size-3"/></span><span className={done ? "text-stone-700" : "text-stone-400"}>{label}</span></div>; }
