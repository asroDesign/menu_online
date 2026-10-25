/* MenuPeak waiter push notifications. Keep this worker small and version the cache separately. */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (!payload || payload.type !== "waiter-call" || !Number.isSafeInteger(payload.requestId)) return;

  const title = typeof payload.title === "string" ? payload.title.slice(0, 100) : "درخواست تازهٔ مشتری";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 180) : "یک میز درخواست حضور گارسون دارد.";
  const data = { url: "/dashboard/waiter", requestId: payload.requestId, type: "waiter-call" };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: `waiter-call-${payload.requestId}`,
      renotify: true,
      requireInteraction: true,
      data,
      dir: "rtl",
      lang: "fa",
    }),
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // Tabs can belong to another signed-in tenant on the same origin; send no tenant details here.
        client.postMessage({ type: "menupeak:waiter-call", requestId: payload.requestId });
      }
    }),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = event.notification.data && event.notification.data.url;
  let target;
  try {
    const candidate = new URL(typeof requested === "string" ? requested : "/dashboard/waiter", self.location.origin);
    target = candidate.origin === self.location.origin ? candidate : new URL("/dashboard/waiter", self.location.origin);
  } catch {
    target = new URL("/dashboard/waiter", self.location.origin);
  }
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if ("focus" in client) {
        return client.focus().then((focused) => focused.navigate(target.href));
      }
    }
    return self.clients.openWindow(target.href);
  }));
});
