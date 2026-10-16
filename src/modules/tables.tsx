"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { api, useCollection } from "@/lib/api";
import { formatPrice, toFa } from "@/lib/format";
import type { DiningTable } from "@/lib/types";
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, PageHeader, Skeleton, cn, useToast,
 EmojiIcon, IconText} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";

export default function TablesPage() {
  const tables = useCollection<DiningTable>("/api/tables", { poll: 10000 });
  const toast = useToast();
  const [slug, setSlug] = useState("");
  const [origin, setOrigin] = useState("");
  const [editing, setEditing] = useState<DiningTable | "new" | null>(null);
  const [form, setForm] = useState({ name: "", zone: "سالن اصلی", capacity: "4" });
  const [deleting, setDeleting] = useState<DiningTable | null>(null);
  const [qr, setQr] = useState<DiningTable | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOrigin(location.origin); // eslint-disable-line react-hooks/set-state-in-effect
    api<{ item: { slug: string } }>("/api/business").then((r) => setSlug(r.item.slug));
  }, []);

  const link = (t: DiningTable) => `${origin}/m/${slug}?table=${t.id}`;

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
        await tables.create(payload, { ...payload, openOrder: null });
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

  function printQr() {
    const svg = qrRef.current?.querySelector("svg")?.outerHTML;
    if (!svg || !qr) return;
    const w = window.open("", "_blank", "width=500,height=700");
    if (!w) return toast("پنجره چاپ مسدود شد", "error");
    w.document.write(`<html dir="rtl"><head><title>QR ${qr.name}</title><style>body{font-family:Tahoma,sans-serif;text-align:center;padding:40px}svg{width:300px;height:300px}h1{margin:0 0 4px}p{color:#555}.b{border:3px dashed #f97316;border-radius:24px;padding:32px;display:inline-block}</style></head><body><div class="b"><h1>${qr.name}</h1><p>برای مشاهده منو و ثبت سفارش اسکن کنید</p>${svg}<p dir="ltr" style="font-size:11px">${link(qr)}</p></div><script>window.onload=()=>{window.print()}<\/script></body></html>`);
    w.document.close();
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
                  <Card key={t.id} className={cn("p-4 animate-pop", t.id < 0 && "opacity-60", t.openOrder && "ring-2 ring-amber-300")}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-lg font-extrabold">{t.name}</p>
                        <p className="mt-0.5 text-xs text-stone-500">ظرفیت {toFa(t.capacity)} نفر</p>
                      </div>
                      <span className={cn("flex size-11 items-center justify-center rounded-xl text-xl", t.openOrder ? "bg-amber-100" : "bg-emerald-50")}>{<EmojiIcon emoji="" />}</span>
                    </div>
                    <div className="mt-3 min-h-14">
                      {t.openOrder ? (
                        <div className="rounded-xl bg-amber-50 p-2.5 text-xs">
                          <div className="flex items-center justify-between"><b>سفارش #{toFa(t.openOrder.number)}</b><StatusBadge status={t.openOrder.status} /></div>
                          <p className="mt-1.5 text-stone-600">{formatPrice(t.openOrder.total)}</p>
                        </div>
                      ) : (
                        <Badge color="emerald">آزاد</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
                      <Button size="sm" variant="secondary" onClick={() => setQr(t)} disabled={!slug || t.id < 0}>
                        <Icon name="qr" className="size-4" /> QR کد
                      </Button>
                      <div className="flex">
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
        size="sm"
        footer={
          qr && (
            <>
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(link(qr)).then(() => toast("لینک کپی شد"))}><Icon name="copy" className="size-4" /> کپی لینک</Button>
              <Button onClick={printQr}><Icon name="print" className="size-4" /> چاپ</Button>
            </>
          )
        }
      >
        {qr && (
          <div className="text-center">
            <div ref={qrRef} className="mx-auto inline-block rounded-3xl border-2 border-dashed border-brand-300 bg-white p-5">
              <QRCodeSVG value={link(qr)} size={220} level="M" marginSize={0} fgColor="#1c1917" />
            </div>
            <p className="mt-4 text-sm text-stone-600">مشتری با اسکن این کد، منوی <b>{qr.name}</b> را باز می‌کند.</p>
            <a href={link(qr)} target="_blank" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline" dir="ltr">
              {link(qr)} <Icon name="external" className="size-3.5" />
            </a>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleting} title="حذف میز" message={deleting ? `«${deleting.name}» حذف می‌شود. QR چاپ‌شده این میز دیگر کار نمی‌کند.` : ""} onConfirm={() => deleting && del(deleting)} onClose={() => setDeleting(null)} />
    </div>
  );
}
