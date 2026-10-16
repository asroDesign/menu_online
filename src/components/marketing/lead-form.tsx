"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Button, Field, Input, PersianDateInput, Textarea } from "@/components/ui";

type LeadKind = "contact" | "consultation" | "demo";
export function LeadForm({ kind, title = "", compact = false, initialSubject = "" }: { kind: LeadKind; title?: string; compact?: boolean; initialSubject?: string }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", businessName: "", subject: initialSubject, message: "", preferredAt: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { const preferredAt = form.preferredAt ? new Date(form.preferredAt).toISOString() : undefined; await api("/api/public/lead", { method: "POST", body: { ...form, preferredAt, kind, subject: form.subject || title } }); setDone(true); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  if (done) return <div role="status" className="rounded-2xl bg-emerald-50 p-5 text-sm font-semibold leading-7 text-emerald-800">درخواست شما ثبت شد. تیم ما برای پیگیری با شما تماس می‌گیرد.</div>;
  return <form onSubmit={submit} className={`space-y-4 ${compact ? "" : "rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-7"}`}>
    {title && <h2 className="text-lg font-extrabold">{title}</h2>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="نام و نام خانوادگی *"><Input required minLength={2} maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoComplete="name" /></Field>
      <Field label="شماره تماس *"><Input required inputMode="tel" dir="ltr" className="text-left" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} autoComplete="tel" /></Field>
      <Field label="ایمیل (اختیاری)"><Input type="email" dir="ltr" className="text-left" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" /></Field>
      <Field label="نام کسب‌وکار (اختیاری)"><Input value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} /></Field>
    </div>
    {kind === "contact" && <Field label="موضوع"><Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></Field>}
    {(kind === "consultation" || kind === "demo") && <Field label="زمان پیشنهادی برای تماس (شمسی، اختیاری)"><PersianDateInput value={form.preferredAt} withTime onChange={(preferredAt) => setForm({ ...form, preferredAt })} placeholder="انتخاب روز و ساعت" /></Field>}
    <Field label={kind === "demo" ? "چه زمانی برای نمایش مناسب است؟" : "توضیحات"}><Textarea rows={compact ? 3 : 5} maxLength={3000} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder={kind === "demo" ? "ساعت مناسب تماس یا جلسه را بنویسید…" : "پیام شما…"} /></Field>
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    <Button type="submit" loading={busy} className="w-full sm:w-auto">{kind === "demo" ? "درخواست دموی رایگان" : kind === "consultation" ? "درخواست مشاوره" : "ارسال پیام"}</Button>
  </form>;
}
