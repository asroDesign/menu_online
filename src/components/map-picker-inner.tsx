"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";

export type LatLng = { lat: number; lng: number };
type Props = {
  value: LatLng | null;
  onChange?: (lat: number, lng: number) => void;
  onAddress?: (address: string) => void;
  readOnly?: boolean;
  height?: number;
  origin?: LatLng | null;
  radii?: number[];
};

const TEHRAN: [number, number] = [35.6892, 51.389];
const pin = (emoji: string, size = 34) => L.divIcon({ className: "", html: `<div style="font-size:${size}px;line-height:1;transform:translate(-50%,-100%);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">${emoji}</div>`, iconSize: [0, 0] });

export default function MapInner({ value, onChange, onAddress, readOnly, height = 280, origin, radii }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const layers = useRef<L.Layer[]>([]);
  const cb = useRef({ onChange, onAddress });
  cb.current = { onChange, onAddress };
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  async function reverse(lat: number, lng: number) {
    if (!cb.current.onAddress) return;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=fa&lat=${lat}&lon=${lng}`);
      const j = await r.json();
      if (j?.display_name) cb.current.onAddress(String(j.display_name));
    } catch { /* offline geocoder is optional */ }
  }
  const pick = (lat: number, lng: number) => { cb.current.onChange?.(lat, lng); void reverse(lat, lng); };

  useEffect(() => {
    if (!el.current) return;
    const start = value ?? origin ?? null;
    const m = L.map(el.current, { center: start ? [start.lat, start.lng] : TEHRAN, zoom: start ? 15 : 12, scrollWheelZoom: !readOnly });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    if (!readOnly) m.on("click", (e: L.LeafletMouseEvent) => pick(e.latlng.lat, e.latlng.lng));
    map.current = m;
    return () => { m.remove(); map.current = null; marker.current = null; layers.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      marker.current = L.marker([value.lat, value.lng], { icon: pin("📍"), draggable: !readOnly }).addTo(m);
      if (!readOnly) marker.current.on("dragend", () => { const p = marker.current!.getLatLng(); pick(p.lat, p.lng); });
    } else marker.current.setLatLng([value.lat, value.lng]);
    m.panTo([value.lat, value.lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.forEach((l) => l.remove());
    layers.current = [];
    if (origin) {
      layers.current.push(L.marker([origin.lat, origin.lng], { icon: pin("🍽️", 30), interactive: false }).addTo(m));
      for (const r of radii ?? []) layers.current.push(L.circle([origin.lat, origin.lng], { radius: r * 1000, color: "#f97316", weight: 1.5, fillOpacity: 0.04, interactive: false }).addTo(m));
    }
  }, [origin?.lat, origin?.lng, (radii ?? []).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  async function search() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ir&accept-language=fa&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (j?.[0]) { const lat = Number(j[0].lat), lng = Number(j[0].lon); map.current?.setView([lat, lng], 16); pick(lat, lng); }
    } catch { /* ignore */ } finally { setBusy(false); }
  }
  function locate() {
    navigator.geolocation?.getCurrentPosition((p) => { map.current?.setView([p.coords.latitude, p.coords.longitude], 16); pick(p.coords.latitude, p.coords.longitude); }, () => {}, { enableHighAccuracy: true, timeout: 8000 });
  }

  return (
    <div className="relative overflow-hidden rounded-2xl ring-1 ring-stone-200" style={{ isolation: "isolate" }}>
      <div ref={el} style={{ height, width: "100%" }} />
      {!readOnly && (
        <div className="absolute inset-x-2 top-2 z-[500] flex gap-1.5" dir="rtl">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} placeholder="جستجوی آدرس…" className="h-9 min-w-0 flex-1 rounded-lg border-0 bg-white/95 px-3 text-xs shadow ring-1 ring-stone-200 focus:ring-2 focus:ring-orange-400 focus:outline-none" />
          <button type="button" onClick={search} disabled={busy} className="h-9 rounded-lg bg-white/95 px-3 text-xs font-bold shadow ring-1 ring-stone-200">{busy ? "…" : "جستجو"}</button>
          <button type="button" onClick={locate} title="موقعیت من" className="h-9 rounded-lg bg-orange-500 px-3 text-xs font-bold text-white shadow">📍 من</button>
        </div>
      )}
      {!readOnly && !value && <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[500] text-center"><span className="rounded-full bg-stone-900/80 px-3 py-1 text-[11px] text-white">روی نقشه بزنید تا محل تحویل مشخص شود</span></div>}
    </div>
  );
}
