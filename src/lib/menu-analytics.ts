"use client";

type MenuEventName = "menu_view" | "category_view" | "product_view" | "add_to_cart" | "checkout_start";

export function trackMenuEvent(slug: string, name: MenuEventName, ids: { categoryId?: number; productId?: number } = {}) {
  if (typeof window === "undefined" || !window.crypto?.randomUUID) return;
  const event = { eventId: window.crypto.randomUUID(), name, ...ids };
  void fetch(`/api/public/${encodeURIComponent(slug)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: [event] }),
    keepalive: true,
  }).catch(() => {});
}
