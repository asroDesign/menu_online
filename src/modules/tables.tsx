"use client";

import { useEffect, useState } from "react";
import { api, useCollection } from "@/lib/api";
import { formatPrice, toFa } from "@/lib/format";
import type { DiningTable } from "@/lib/types";
import { TableQrDesigner } from "@/components/table-qr-designer";
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, PageHeader, Skeleton, cn, useToast,
 EmojiIcon, IconText} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { DEFAULT_BRAND_COLOR, normalizeBrandColor } from "@/lib/brand-color";
import { DEFAULT_TABLE_QR_DESIGN, normalizeTableQrDesign, type TableQrDesign } from "@/lib/table-qr-design";

export default function TablesPage() {
  const tables = useCollection<DiningTable>("/api/tables", { poll: 10000 });
  const toast = useToast();
  const [slug, setSlug] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [accentColor, setAccentColor] = useState(DEFAULT_BRAND_COLOR);
  const [qrDesign, setQrDesign] = useState<TableQrDesign>(DEFAULT_TABLE_QR_DESIGN);
  const [origin, setOrigin] = useState("");
  const [editing, setEditing] = useState<DiningTable | "new" | null>(null);
  const [form, setForm] = useState({ name: "", zone: "سالن اصلی", capacity: "4" });
  const [deleting, setDeleting] = useState<DiningTable | null>(null);
  const [qr, setQr] = useState<DiningTable | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ table: DiningTable; status: "available" | "cleaning" | "out_of_service" } | null>(null);
  const [statusReason, setStatusReason] = useState("");

  useEffect(() => {
    setOrigin(location.origin); // eslint-disable-line react-hooks/set-state-in-effect
    api<{ item: { name: string; slug: string; accentColor: string; settings?: Record<string, unknown> } }>("/api/business").then((r) => {
      setBusinessName(r.item.name);
      setSlug(r.item.slug);
      const color = normalizeBrandColor(r.item.accentColor) ?? DEFAULT_BRAND_COLOR;
      setAccentColor(color);
      setQrDesign(r.item.settings?.tableQr ? normalizeTableQrDesign(r.item.settings.tableQr) : { ...DEFAULT_TABLE_QR_DESIGN, frameColor: color });
    });
  }, []);

  const link = (t: DiningTable) => `${origin}/m/${slug}?table=${t.id}`;

  async function saveTableStatus() {
    if (!statusTarget) return;
    if (statusTarget.status === "out_of_service" && !statusReason.trim()) return toast("علت خارج‌کردن میز از سرویس را وارد کنید", "error");
    try {
      await api(`/api/tables/${statusTarget.table.id}/status`, { method: "POST", body: { status: statusTarget.status, reason: statusReason } });
      setStatusTarget(null); setStatusReason(""); await tables.reload();
      toast("وضعیت میز به‌روز شد");
    } catch (e) { toast((e as Error).message, "error"); }
  }

  const zones = [...new Set(tables.items.map((t) => t.zone))];

  function openNew() {
    setForm({ name: `میز ${toFa(tables.items.length + 1)}`, zone: zones[0] ?? "سالن اصلی", capacity: "4" });
    setEditing("new");
  }
  function openEdit(t: DiningTable) {
    setForm({ name: t.name, zone: t.zone, capacity: String(t.capacity) });
    setEditing(t);
  }

  async function save() {
    if (!form.name.trim()) return toast("نام میز را وارد کنید", "error");
    const payload = { name: form.name.trim(), zone: form.zone.trim() || "سالن اصلی", capacity: Number(form.capacity.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))) || 1 };
    const target = editing;
    setEditing(null);
    try {
      if (target === "new") {
        await tables.create(payload, { ...payload, operationalStatus: "available", status: "available", openOrder: null });
        toast("میز اضافه شد");
      } else if (target) {
        await tables.update(target.id, payload);
        toast("تغییرات ذخیره شد");
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function del(t: DiningTable) {
    try {
      await tables.remove(t.id);
      toast("میز حذف شد");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function saveQrDesign(design: TableQrDesign) {
    await api("/api/business", { method: "PATCH", body: { settings: { tableQr: design } } });
    setQrDesign(design);
    toast("طرح QR برای همهٔ میزها ذخیره شد");
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="میزها و QR کد"
        subtitle="برای هر میز یک QR اختصاصی بسازید؛ مشتری با اسکن آن مستقیماً سفارش می‌دهد"
        actions={<Button onClick={openNew}><Icon name="plus" className="size-4" /> میز جدید</Button>}
      />

      <IconText>{tables.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
      ) : tables.error ? (
        <ErrorState message={tables.error} onRetry={() => tables.reload()} />
      ) : tables.items.length === 0 ? (
        <EmptyState emoji="" title="هنوز میزی تعریف نکرده‌اید" description="میزهای سالن، تراس یا VIP را اضافه کنید و برای هرکدام QR کد چاپ کنید." action={<Button onClick={openNew}>افزودن اولین میز</Button>} />
      ) : (
        <div className="space-y-8">
          {[...new Set(tables.items.map((t) => t.zone))].map((zone) => (
            <section key={zone}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-stone-700">
                {zone}
                <Badge>{toFa(tables.items.filter((t) => t.zone === zone).length)} میز</Badge>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {tables.items.filter((t) => t.zone === zone).map((t) => (
                  <Card key={t.id} className={cn("p-4 animate-pop", t.id < 0 && "opacity-60", t.openOrder && "ring-2 ring-amber-300", t.status === "out_of_service" && "opacity-80")}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-lg font-extrabold">{t.name}</p>
                        <p className="mt-0.5 text-xs text-stone-500">ظرفیت {toFa(t.capacity)} نفر</p>
                      </div>
                      <span className={cn("flex size-11 items-center justify-center rounded-xl", t.status === "available" ? "bg-emerald-50 text-emerald-700" : t.status === "occupied" ? "bg-amber-100 text-amber-700" : t.status === "reserved" ? "bg-blue-50 text-blue-700" : "bg-rose-50 text-rose-700")}><Icon name={t.status === "cleaning" ? "refresh" : t.status === "out_of_service" ? "warning" : t.status === "occupied" ? "users" : t.status === "reserved" ? "calendar" : "table"} className="size-5" /></span>
                    </div>
                    <div className="mt-3 min-h-14">
                      {t.openOrder ? (
                        <div className="rounded-xl bg-amber-50 p-2.5 text-xs">
                          <div className="flex items-center justify-between"><b>سفارش #{toFa(t.openOrder.number)}</b><StatusBadge status={t.openOrder.status} /></div>
                          <p className="mt-1.5 text-stone-600">{formatPrice(t.openOrder.total)}</p>
                        </div>
                      ) : (
                        <Badge color={t.status === "available" ? "emerald" : t.status === "reserved" ? "blue" : t.status === "cleaning" || t.status === "out_of_service" ? "rose" : "amber"}>{({ available: "آزاد", occupied: "اشغال", reserved: "رزرو", cleaning: "در حال نظافت", out_of_service: "خارج از سرویس" } as Record<string, string>)[t.status]}</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
                      <Button size="sm" variant="secondary" onClick={() => setQr(t)} disabled={!slug || t.id < 0}>
                        <Icon name="qr" className="size-4" /> QR کد
                      </Button>
                      <div className="flex">
                        {t.operationalStatus === "cleaning" || t.operationalStatus === "out_of_service" ? <Button size="sm" variant="secondary" disabled={t.status === "occupied" || t.status === "reserved"} onClick={() => setStatusTarget({ table: t, status: "available" })}>بازگشت به سرویس</Button> : <Button size="sm" variant="ghost" disabled={t.status === "occupied" || t.status === "reserved"} onClick={() => setStatusTarget({ table: t, status: "cleaning" })}>نظافت</Button>}
                        {t.operationalStatus !== "out_of_service" && <IconButton icon="warning" label="خارج از سرویس" disabled={t.status === "occupied" || t.status === "reserved"} onClick={() => setStatusTarget({ table: t, status: "out_of_service" })} />}
                        <IconButton icon="edit" label="ویرایش" onClick={() => openEdit(t)} />
                        <IconButton icon="trash" label="حذف" className="hover:bg-rose-50 hover:text-rose-600" onClick={() => setDeleting(t)} />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}</IconText>

      <Modal open={!!statusTarget} onClose={() => { setStatusTarget(null); setStatusReason(""); }} title={statusTarget?.status === "out_of_service" ? "خارج‌کردن میز از سرویس" : statusTarget?.status === "cleaning" ? "شروع نظافت میز" : "بازگشت میز به سرویس"} size="sm" footer={<><Button variant="ghost" onClick={() => setStatusTarget(null)}>انصراف</Button><Button onClick={saveTableStatus}>ثبت وضعیت</Button></>}>
        {statusTarget?.status === "out_of_service" ? <Field label="علت (الزامی)"><Input autoFocus value={statusReason} onChange={(e) => setStatusReason(e.target.value)} maxLength={240} placeholder="مثلاً خرابی یا تعمیرات" /></Field> : <p className="text-sm leading-7 text-stone-600">وضعیت «{statusTarget?.status === "cleaning" ? "در حال نظافت" : "آزاد"}» برای میز {statusTarget?.table.name} ثبت می‌شود. میز دارای سفارش باز یا رزرو فعال را نمی‌توان از سرویس خارج کرد.</p>}
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "میز جدید" : "ویرایش میز"}
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>انصراف</Button><Button onClick={save}>ذخیره</Button></>}
      >
        <div className="space-y-4">
          <Field label="نام میز *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <Field label="محدوده" hint="مثلاً سالن اصلی، تراس، VIP">
            <Input list="zones" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
            <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
          </Field>
          <Field label="ظرفیت (نفر)"><Input inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal
        open={!!qr}
        onClose={() => setQr(null)}
        title={qr ? `QR کد ${qr.name}` : ""}
        size="xl"
        footer={<Button variant="ghost" onClick={() => setQr(null)}>بستن ادیتور</Button>}
      >
        {qr && <TableQrDesigner key={qr.id} tableName={qr.name} businessName={businessName} url={link(qr)} accentColor={accentColor} initialDesign={qrDesign} onSave={saveQrDesign} />}
      </Modal>

      <ConfirmDialog open={!!deleting} title="حذف میز" message={deleting ? `«${deleting.name}» حذف می‌شود. QR چاپ‌شده این میز دیگر کار نمی‌کند.` : ""} onConfirm={() => deleting && del(deleting)} onClose={() => setDeleting(null)} />
    </div>
  );
}
