export type TrackedMenuOrder = { number: number; trackingUrl: string; createdAt: string };

const storageKey = (slug: string) => `menupeak:tracked-orders:${slug}`;
const updateEvent = "menupeak:tracked-orders:update";

function validOrder(value: unknown, slug: string): value is TrackedMenuOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Partial<TrackedMenuOrder>;
  const prefix = `/m/${encodeURIComponent(slug)}/track#`;
  return Number.isSafeInteger(order.number) && Number(order.number) > 0 && typeof order.trackingUrl === "string" && order.trackingUrl.startsWith(prefix) && /^[A-Za-z0-9_-]{43}$/.test(order.trackingUrl.slice(prefix.length)) && typeof order.createdAt === "string";
}

export function readTrackedMenuOrders(slug: string): TrackedMenuOrder[] {
  try {
    const raw = window.sessionStorage.getItem(storageKey(slug));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is TrackedMenuOrder => validOrder(item, slug)).slice(0, 10) : [];
  } catch { return []; }
}

export function rememberTrackedMenuOrder(slug: string, number: number, trackingUrl: string | null) {
  if (!trackingUrl) return;
  const record = { number, trackingUrl, createdAt: new Date().toISOString() };
  if (!validOrder(record, slug)) return;
  const orders = [record, ...readTrackedMenuOrders(slug).filter((order) => order.trackingUrl !== trackingUrl)].slice(0, 10);
  try {
    window.sessionStorage.setItem(storageKey(slug), JSON.stringify(orders));
    window.dispatchEvent(new CustomEvent(updateEvent, { detail: { slug } }));
  } catch { /* Storage can be disabled; the confirmation screen still has the tracking link. */ }
}

export function trackedMenuOrdersUpdateEvent() { return updateEvent; }
