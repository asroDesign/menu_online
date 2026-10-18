"use client";

import { useRef, useState } from "react";
import { ProductThumb, Button, cn, useToast , EmojiIcon, IconText} from "@/components/ui";

const MAX_SIDE = 1200;

/** Resize + compress in the browser so phone photos (5–10 MB) upload in a second. */
async function prepare(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("فقط تصویر JPG، PNG، WebP یا GIF مجاز است");
  if (file.size > 25_000_000) throw new Error("حجم فایل بیش از حد بزرگ است (حداکثر ۲۵ مگابایت)");
  if (file.type === "image/gif" && file.size <= 2_400_000) return file; // keep animations small enough
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("این تصویر قابل خواندن نیست");
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.86, 0.72, 0.58]) {
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", q));
    if (blob && blob.size <= 2_400_000 && blob.type === "image/webp") return blob;
    const jpg = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));
    if (jpg && jpg.size <= 2_400_000) return jpg;
  }
  throw new Error("تصویر پس از فشرده‌سازی هم بزرگ است؛ تصویر کوچک‌تری انتخاب کنید");
}

export function ImageUpload({ value, emoji, onChange, uploadUrl = "/api/upload", label = "تصویر محصول", description = "تصویر را بکشید و رها کنید یا از دستگاه انتخاب کنید. تصویر خودکار کوچک و بهینه می‌شود (JPG، PNG، WebP، GIF).", disabled = false }: { value: string; emoji: string; onChange: (url: string) => void; uploadUrl?: string; label?: string; description?: string; disabled?: boolean }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  async function upload(file: File | undefined) {
    if (!file || disabled) return;
    setBusy(true);
    try {
      const blob = await prepare(file);
      const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "بارگذاری ناموفق بود");
      onChange(j.url);
      toast(`تصویر بارگذاری شد (${Math.max(1, Math.round(blob.size / 1024)).toLocaleString("fa-IR")} کیلوبایت)`);
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files?.[0]); }}
      className={cn("flex flex-wrap items-center gap-4 rounded-2xl border-2 border-dashed p-4 transition", disabled && "opacity-60", drag ? "border-brand-400 bg-brand-50" : "border-stone-300 bg-stone-50")}
    >
      <ProductThumb imageUrl={value} emoji={emoji} className="size-24 shrink-0 rounded-2xl text-4xl" />
      <div className="min-w-48 flex-1 space-y-2">
        <p className="text-sm font-semibold">{value ? `${label} ثبت شده` : `${label} انتخاب نشده`}</p>
        <p className="text-xs leading-6 text-stone-500">{description}</p>
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture={undefined} className="hidden" disabled={disabled || busy} onChange={(e) => void upload(e.target.files?.[0])} />
          <Button type="button" size="sm" loading={busy} disabled={disabled || busy} onClick={() => input.current?.click()}><IconText>{<EmojiIcon emoji="" />}</IconText> {value ? "تغییر تصویر" : "انتخاب فایل تصویر"}</Button>
          {value && <Button type="button" size="sm" variant="ghost" disabled={disabled} className="text-rose-600" onClick={() => onChange("")}>حذف تصویر</Button>}
        </div>
      </div>
    </div>
  );
}
