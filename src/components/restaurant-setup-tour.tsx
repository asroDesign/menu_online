"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { buildSetupTourSteps, completesSetupStep, setupTarget, setupFields, inlineSetupSteps, settingsTourAction, TOUR_EVENT } from "@/lib/onboarding-tour";
import { planName, type FeatureMap } from "@/lib/plans";
import { Button, Icon } from "@/components/ui";

type Position = { top: number; left: number; width: number; height: number; cardTop: number; cardLeft: number; cardWidth: number; availableHeight: number };

/** A non-modal guide: all editing and validation stays in the real page. */
export function RestaurantSetupTour({ features, plan, autoStart = false }: {
  features: FeatureMap; plan: string; autoStart?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const steps = useMemo(() => buildSetupTourSteps(features), [features]);
  const [open, setOpen] = useState(autoStart);
  const [index, setIndex] = useState(0);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [settingsAction, setSettingsAction] = useState<"wait" | "save" | "continue">("wait");
  const [inForm, setInForm] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const formRoot = useRef<Element | null>(null);
  const current = steps[index];
  const fields = setupFields[current.id];
  const field = fields?.[fieldIndex];

  const close = useCallback(async (action: "complete" | "dismiss") => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await api("/api/business/onboarding-tour", { method: "POST", body: { action } });
      setOpen(false);
      const target = window.sessionStorage.getItem("menudigital:post-setup-next");
      if (target && target.startsWith("/") && !target.startsWith("//") && !target.includes("\\") && !/[\r\n]/.test(target)) {
        window.sessionStorage.removeItem("menudigital:post-setup-next");
        router.push(target);
        router.refresh();
      }
    } catch (cause) { setError((cause as Error).message); }
    finally { busy.current = false; setSaving(false); }
  }, [router]);

  const next = useCallback(() => {
    if (busy.current) return;
    if (index === steps.length - 1) void close("complete");
    else { setPosition(null); setSettingsAction("wait"); setFieldIndex(0); setInForm(false); setIndex((value) => value + 1); }
  }, [index, steps.length, close]);

  useEffect(() => {
    if (!open || !current) return;
    router.push(current.href, { scroll: false });
  }, [open, current, router]);

  useEffect(() => {
    if (!open || !current || pathname !== current.href.split("#")[0]) return;
    let target: HTMLElement | null = null;
    let frame = 0;

    let lastPosition = "";
    const measure = () => {
      const settings = document.querySelector<HTMLElement>('[data-tour-settings="ready"]');
      setSettingsAction(settingsTourAction(Boolean(settings), settings?.dataset.tourDirty === "true", settings?.dataset.tourSaving === "true"));
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      const formInput = fields ? `[data-tour="${fields[0].target}"]` : null;
      const inline = inlineSetupSteps.has(current.id) || (current.id === "printers" && fieldIndex >= 2);
      const editing = inline || Boolean(formInput && dialog?.querySelector(formInput));
      setInForm(editing);
      if (!inline && dialog !== formRoot.current) {
        formRoot.current = dialog;
        if (editing && fieldIndex !== 0) { setFieldIndex(0); return; }
      }
      const scope = inline ? document : dialog;
      const wrapper = editing && field ? scope?.querySelector<HTMLElement>(`[data-tour="${field.target}"]`) : document.querySelector<HTMLElement>(setupTarget(current));
      const candidate = wrapper?.matches("input, select, textarea, button") ? wrapper : wrapper?.querySelector<HTMLElement>("input, select, textarea, button") ?? wrapper;
      if (!candidate && field?.optional) { setFieldIndex(value => value + 1); return; }
      if (!candidate || !candidate.getClientRects().length) {
        if (lastPosition !== "missing") { lastPosition = "missing"; setPosition(null); }
        return;
      }
      if (candidate !== target) {
        target?.removeAttribute("data-tour-active");
        target = candidate;
        target.setAttribute("data-tour-active", "true");
        target.scrollIntoView({ block: "center", behavior: "instant" });
        // Focus desktop inputs; on mobile let a user tap to open the keyboard.
        if (window.matchMedia("(min-width: 768px)").matches && target.matches("input, select, textarea")) target.focus({ preventScroll: true });
      }
      const rect = target.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const height = viewport?.height ?? window.innerHeight;
      const width = viewport?.width ?? window.innerWidth;
      const cardWidth = Math.min(360, width - 24);
      const cardHeight = Math.min(card.current?.offsetHeight ?? 220, height * 0.45);
      const below = rect.bottom + 14;
      const above = rect.top - cardHeight - 14;
      const sideLeft = rect.left - cardWidth - 16;
      const sideRight = rect.right + 16;
      const side = sideLeft >= 12 ? sideLeft : sideRight + cardWidth <= width - 12 ? sideRight : null;
      const cardTop = side !== null ? Math.max(top + 12, Math.min(rect.top, top + height - cardHeight - 12)) : below + cardHeight < top + height - 12 ? below : above > top + 12 ? above : top + height - cardHeight - 12;
      const value = { top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10, cardTop, cardLeft: side ?? Math.max(12, Math.min(rect.right - cardWidth, width - cardWidth - 12)), cardWidth, availableHeight: height * 0.45 };
      const key = JSON.stringify(value);
      if (lastPosition !== key) { lastPosition = key; setPosition(value); }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tour-dirty", "data-tour-saving"] });
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    if (card.current) resize.observe(card.current);
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect();
      target?.removeAttribute("data-tour-active");
      window.removeEventListener("resize", schedule); document.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [open, current, pathname, field, fields, fieldIndex]);

  useEffect(() => {
    if (!open || !current) return;
    let advanced = false;
    const saved = (event: Event) => {
      if (!advanced && (!inlineSetupSteps.has(current.id) || field?.save) && pathname === current.href.split("#")[0] && completesSetupStep(current, (event as CustomEvent).detail)) {
        advanced = true; if (current.id === "printers" && fieldIndex < 2) setFieldIndex(2); else next();
      }
    };
    window.addEventListener(TOUR_EVENT, saved);
    return () => window.removeEventListener(TOUR_EVENT, saved);
  }, [open, current, pathname, next, field, fieldIndex]);

  return <>
    <button type="button" aria-label="راهنمای راه‌اندازی" onClick={() => { setPosition(null); setSettingsAction("wait"); setIndex(0); setFieldIndex(0); setInForm(false); setError(""); setOpen(true); }} className="btn btn-ghost btn-sm h-9 rounded-xl px-3 text-xs font-bold text-primary">
      <Icon name="sparkles" className="size-4" /><span className="hidden sm:inline">راهنمای راه‌اندازی</span>
    </button>
    {open && current && typeof document !== "undefined" && createPortal(<>
      <style>{`[data-tour-active="true"] { outline: 3px solid var(--color-primary, #2563eb) !important; outline-offset: 3px; }`}</style>
      <div ref={card} role="region" aria-label="راهنمای راه‌اندازی فروشگاه" dir="rtl" className="fixed z-[120] overflow-y-auto rounded-2xl border border-primary/25 bg-base-100 p-4 text-base-content shadow-xl" style={position ? { top: position.cardTop, left: position.cardLeft, width: position.cardWidth, maxHeight: position.availableHeight } : { bottom: 12, right: 12, width: "min(360px, calc(100vw - 24px))", maxHeight: "45dvh" }}>
        <div className="flex items-center justify-between gap-2 text-xs text-base-content/60"><span>پلن {planName(plan)} · گام {(index + 1).toLocaleString("fa-IR")} از {steps.length.toLocaleString("fa-IR")}</span><button type="button" aria-label="بستن راهنما" disabled={saving} onClick={() => void close("dismiss")} className="btn btn-ghost btn-xs min-h-8"><Icon name="x" className="size-4" /></button></div>
        {inForm && fields && <p className="mt-2 text-xs text-primary">بخش {(fieldIndex + 1).toLocaleString("fa-IR")} از {fields.length.toLocaleString("fa-IR")}</p>}
        <h2 className="mt-2 text-sm font-bold" aria-live="polite">{inForm && field ? field.title : current.title}</h2>
        {!inForm && <p className="mt-2 text-xs leading-6">{current.description}</p>}
        <p className="mt-1 text-xs leading-5 text-primary">{position ? "در همین صفحه اطلاعات را وارد و با دکمهٔ ذخیرهٔ صفحه ثبت کنید." : "در انتظار نمایش بخش مربوط…"}</p>
        {error && <p role="alert" className="mt-2 text-xs text-error">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {inForm && field ? <>
            {fieldIndex > 0 && <Button size="sm" variant="ghost" onClick={() => setFieldIndex(value => value - 1)}>فیلد قبلی</Button>}
            {!field.save && !field.finish && <Button size="sm" disabled={!position} onClick={() => setFieldIndex(value => value + 1)}>ادامه به فیلد بعد</Button>}
            {!field.save && !field.finish && <Button size="sm" variant="ghost" disabled={!position} onClick={() => setFieldIndex(value => value + 1)}>رد کردن این فیلد</Button>}
            {inlineSetupSteps.has(current.id) && field.save && <Button size="sm" variant="ghost" onClick={next}>رد کردن این بخش بدون ذخیره</Button>}
            {field.finish && <Button size="sm" onClick={next}>پایان راهنما</Button>}
            {field.save && <span className="text-xs leading-6">پس از ذخیرهٔ موفق، تور خودکار ادامه می‌یابد.</span>}
          </> : <Button size="sm" variant="ghost" disabled={saving} onClick={next}>رد کردن این بخش</Button>}
          {current.href.startsWith("/dashboard/settings") && (!inForm || field?.save) && <Button size="sm" disabled={saving || settingsAction === "wait" || !position || pathname !== current.href.split("#")[0]} onClick={() => {
            const page = document.querySelector<HTMLElement>('[data-tour-settings="ready"]');
            const action = settingsTourAction(Boolean(page), page?.dataset.tourDirty === "true", page?.dataset.tourSaving === "true");
            if (action === "continue") next();
            if (action === "save") document.querySelector<HTMLButtonElement>('[data-tour="settings-save"]')?.click();
          }}>{settingsAction === "save" ? "ذخیره و ادامه" : settingsAction === "wait" ? "در حال آماده‌سازی…" : "تأیید تنظیمات فعلی و ادامه"}</Button>}
          {!current.href.startsWith("/dashboard/settings") && !fields && <Button size="sm" disabled={saving || !position || pathname !== current.href.split("#")[0]} onClick={next}>انجام دادم؛ ادامه</Button>}
        </div>
      </div>
    </>, document.body)}
  </>;
}
