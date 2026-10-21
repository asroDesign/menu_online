"use client";

import { useSyncExternalStore } from "react";

const storageKey = "menupeak.order-tracking";
function subscribe() { return () => {}; }
function getTrackingUrl() {
  return typeof window === "undefined" ? "" : window.sessionStorage.getItem(storageKey) ?? "";
}

export function PaymentTrackingLink() {
  const url = useSyncExternalStore(subscribe, getTrackingUrl, () => "");
  if (!url) return null;
  return <a href={url} onClick={() => window.sessionStorage.removeItem(storageKey)} className="mt-4 inline-block rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">پیگیری امن وضعیت سفارش</a>;
}
