"use client";

import type { PublicPlatformFunnelEvent } from "@/lib/platform-events";

export function trackPlatformEvent(name: PublicPlatformFunnelEvent) {
  if (typeof window === "undefined" || !window.crypto?.randomUUID) return;
  const sessionKey = `menupeak.funnel.seen.${name}`;
  try {
    if (window.sessionStorage.getItem(sessionKey)) return;
    window.sessionStorage.setItem(sessionKey, "1");
  } catch {}
  void fetch("/api/public/funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: window.crypto.randomUUID(), name }),
    keepalive: true,
  }).then((response) => {
    if (!response.ok) window.sessionStorage.removeItem(sessionKey);
  }).catch(() => {
    try { window.sessionStorage.removeItem(sessionKey); } catch {}
  });
}
