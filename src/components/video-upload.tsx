"use client";

import { useRef, useState } from "react";
import { Button, Icon, useToast } from "@/components/ui";

const MAX_VIDEO_BYTES = 20_000_000;

export function VideoUpload({ value, onChange, disabled = false }: { value: string; onChange: (url: string) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function upload(file?: File) {
    if (!file || disabled) return;
    if (!new Set(["video/mp4", "video/webm"]).has(file.type)) return toast("فقط ویدیوی MP4 یا WebM مجاز است", "error");
    if (file.size > MAX_VIDEO_BYTES) return toast("حجم ویدیو باید حداکثر ۲۰ مگابایت باشد", "error");
    setBusy(true);
    try {
      const response = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "بارگذاری ویدیو ناموفق بود");
      onChange(result.url);
      toast("ویدیوی محصول بارگذاری شد");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return <div className="space-y-3 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-3 sm:p-4">
    {value ? <video key={value} src={value} controls preload="metadata" className="max-h-64 w-full rounded-xl bg-black" aria-label="پیش‌نمایش ویدیوی محصول" /> : <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl bg-white text-center text-stone-500 ring-1 ring-stone-200"><Icon name="play" className="size-6 text-brand-600"/><span className="text-xs">ویدیویی برای این محصول ثبت نشده</span></div>}
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} type="file" accept="video/mp4,video/webm" className="hidden" disabled={disabled || busy} onChange={(event) => void upload(event.target.files?.[0])}/>
      <Button type="button" size="sm" variant="secondary" loading={busy} disabled={disabled || busy} onClick={() => input.current?.click()}><Icon name="play" className="size-4"/>{value ? "جایگزینی ویدیو" : "انتخاب ویدیو"}</Button>
      {value && <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} className="text-rose-600" onClick={() => onChange("")}>حذف ویدیو</Button>}
      <span className="text-[11px] leading-5 text-stone-500">MP4 یا WebM · حداکثر ۲۰ مگابایت</span>
    </div>
  </div>;
}
