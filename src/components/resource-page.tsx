"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, useCollection } from "@/lib/api";
import {
  Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, PageHeader, PersianDateInput, Select, Skeleton, Switch, Textarea, useToast, IconText,
} from "@/components/ui";

export type Opt = { value: string; label: string };
export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "money" | "select" | "bool" | "date" | "textarea" | "datetime";
  options?: Opt[];
  remote?: { url: string; label: (r: any) => string; none?: string };
  required?: boolean;
  hint?: string;
  initial?: unknown;
  span?: 2;
  placeholder?: string;
  ltr?: boolean;
  secret?: boolean;
};
export type ColDef<T> = { label: string; render: (r: T) => ReactNode; className?: string };
export type RowCtx = { update: (id: number, patch: Record<string, unknown>) => Promise<unknown>; reload: () => void; toast: (m: string, t?: "success" | "error") => void };

const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "");

export function ResourcePage<T extends { id: number }>(props: {
  title: string;
  subtitle?: string;
  endpoint: string;
  fields: FieldDef[];
  columns: ColDef<T>[];
  emoji: string;
  emptyTitle: string;
  emptyDesc: string;
  addLabel?: string;
  actions?: ReactNode;
  poll?: number;
  rowActions?: (row: T, ctx: RowCtx) => ReactNode;
  header?: (ctx: { items: T[]; reload: () => void }) => ReactNode;
  footer?: ReactNode;
  search?: (row: T, term: string) => boolean;
  extraCreate?: Record<string, unknown>;
  optimisticExtra?: Record<string, unknown>;
  canDelete?: boolean;
  rowFilter?: (row: T) => boolean;
  selectable?: boolean;
  renderBar?: (ctx: { items: T[]; filtered: T[]; selected: T[]; clear: () => void }) => ReactNode;
}) {
  const { endpoint, fields } = props;
  const col = useCollection<T>(endpoint, { poll: props.poll });
  const toast = useToast();
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [deleting, setDeleting] = useState<T | null>(null);
  const [q, setQ] = useState("");
  const [remotes, setRemotes] = useState<Record<string, any[]>>({});
  const [sel, setSel] = useState<Set<number>>(new Set());

  const remoteKey = fields.filter((f) => f.remote).map((f) => `${f.key}|${f.remote!.url}`).join(",");
  useEffect(() => {
    remoteKey.split(",").filter(Boolean).forEach((e) => {
      const [key, url] = e.split("|");
      api<{ items: any[] }>(url).then((r) => setRemotes((x) => ({ ...x, [key]: r.items }))).catch(() => {});
    });
  }, [remoteKey]);

  const filtered = useMemo(() => {
    const t = q.trim();
    const base = props.rowFilter ? col.items.filter(props.rowFilter) : col.items;
    return !t || !props.search ? base : base.filter((r) => props.search!(r, t));
  }, [col.items, q, props]);

  function openNew() {
    const f: Record<string, any> = {};
    for (const x of fields) f[x.key] = x.initial ?? (x.type === "bool" ? true : x.type === "select" && x.options ? x.options[0].value : "");
    setForm(f);
    setEditing("new");
  }
  function openEdit(r: T) {
    const f: Record<string, any> = {};
    for (const x of fields) {
      const v = (r as any)[x.key];
      if (x.type === "bool") f[x.key] = !!v;
      else if (x.type === "date") f[x.key] = v ? new Date(v).toISOString().slice(0, 10) : "";
      else if (x.type === "datetime") f[x.key] = v ? new Date(v).toISOString().slice(0, 16) : "";
      else f[x.key] = v === null || v === undefined ? "" : String(v);
    }
    setForm(f);
    setEditing(r);
  }

  async function save() {
    const payload: Record<string, unknown> = {};
    for (const x of fields) {
      const v = form[x.key];
      if (x.required && (v === "" || v === undefined) && x.type !== "bool") return toast(`«${x.label}» را وارد کنید`, "error");
      if (x.type === "bool") payload[x.key] = !!v;
      else if (x.type === "number" || x.type === "money") {
        const n = Number(faToEn(String(v)));
        if (String(v) !== "" && !Number.isFinite(n)) return toast(`«${x.label}» عدد معتبر نیست`, "error");
        payload[x.key] = String(v) === "" ? 0 : n;
      } else if (x.type === "date" || x.type === "datetime") payload[x.key] = v ? new Date(v).toISOString() : null;
      else if (x.remote) payload[x.key] = v ? Number(v) : null;
      else payload[x.key] = typeof v === "string" ? v.trim() : v;
    }
    const target = editing;
    setEditing(null);
    try {
      if (target === "new") {
        await col.create({ ...payload, ...props.extraCreate }, { ...payload, ...props.optimisticExtra } as any);
        toast("با موفقیت اضافه شد");
      } else if (target) {
        await col.update(target.id, payload);
        toast("تغییرات ذخیره شد");
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function del(r: T) {
    try {
      await col.remove(r.id);
      toast("حذف شد");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const ctx: RowCtx = { update: col.update, reload: () => col.reload(true), toast };

  return (
    <div className="animate-fade-in">
      <PageHeader title={props.title} subtitle={props.subtitle} actions={<>{props.actions}{props.addLabel && <Button variant={props.actions ? "secondary" : "primary"} onClick={openNew}><Icon name="plus" className="size-4" /> {props.addLabel}</Button>}</>} />
      {props.header?.({ items: col.items, reload: () => col.reload(true) })}
      {props.renderBar?.({ items: col.items, filtered, selected: filtered.filter((r) => sel.has(r.id)), clear: () => setSel(new Set()) })}
      {props.search && col.items.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <Input className="ps-9" placeholder="جستجو…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      <IconText>{col.loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : col.error ? (
        <ErrorState message={col.error} onRetry={() => col.reload()} />
      ) : filtered.length === 0 ? (
        <EmptyState emoji={col.items.length ? "" : props.emoji} title={col.items.length ? "موردی پیدا نشد" : props.emptyTitle} description={col.items.length ? "عبارت جستجو را تغییر دهید." : props.emptyDesc} action={!col.items.length && props.addLabel && <Button onClick={openNew}>{props.addLabel}</Button>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50/70 text-xs text-stone-500">
                  {props.selectable && <th className="w-10 px-4 py-3"><input type="checkbox" className="accent-brand-500" checked={filtered.length > 0 && filtered.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(filtered.map((r) => r.id)) : new Set())} aria-label="انتخاب همه" /></th>}
                  {props.columns.map((c) => <th key={c.label} className="px-4 py-3 text-start font-semibold">{c.label}</th>)}
                  <th className="w-40 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((r) => (
                  <tr key={r.id} className={`animate-fade-in transition hover:bg-stone-50/60 ${r.id < 0 ? "opacity-60" : ""}`}>
                    {props.selectable && <td className="px-4 py-3"><input type="checkbox" className="accent-brand-500" checked={sel.has(r.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} aria-label="انتخاب" /></td>}
                    {props.columns.map((c) => <td key={c.label} className={`px-4 py-3 ${c.className ?? ""}`}>{c.render(r)}</td>)}
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {props.rowActions?.(r, ctx)}
                        {fields.length > 0 && <IconButton icon="edit" label="ویرایش" onClick={() => openEdit(r)} />}
                        {props.canDelete !== false && <IconButton icon="trash" label="حذف" className="hover:bg-rose-50 hover:text-rose-600" onClick={() => setDeleting(r)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}</IconText>
      {props.footer}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? props.addLabel ?? "افزودن" : "ویرایش"}
        size="md"
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>انصراف</Button><Button onClick={save}>ذخیره</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => {
            const v = form[f.key] ?? "";
            const set = (x: any) => setForm((s) => ({ ...s, [f.key]: x }));
            let ctl: ReactNode;
            if (f.type === "bool") ctl = <div className="flex h-10 items-center"><Switch checked={!!form[f.key]} onChange={set} label={f.label} /></div>;
            else if (f.type === "textarea") ctl = <Textarea rows={3} value={v} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} />;
            else if (f.type === "select" || f.remote)
              ctl = (
                <Select value={v} onChange={(e) => set(e.target.value)}>
                  {f.remote && <option value="">{f.remote.none ?? "—"}</option>}
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  {f.remote && (remotes[f.key] ?? []).map((r) => <option key={r.id} value={r.id}>{f.remote!.label(r)}</option>)}
                </Select>
              );
            else if (f.type === "date") ctl = <PersianDateInput value={v} onChange={set} />;
            else if (f.type === "datetime") ctl = <PersianDateInput value={v} onChange={set} withTime />;
            else ctl = <Input type={f.secret ? "password" : "text"} autoComplete={f.secret ? "new-password" : undefined} inputMode={f.type === "number" || f.type === "money" ? "decimal" : undefined} dir={f.ltr ? "ltr" : undefined} className={f.ltr ? "text-left" : ""} value={v} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} />;
            return <Field key={f.key} label={f.label + (f.required ? " *" : "")} hint={f.hint} className={f.span === 2 || f.type === "textarea" ? "sm:col-span-2" : ""}>{ctl}</Field>;
          })}
        </div>
      </Modal>
      <ConfirmDialog open={!!deleting} title="حذف" message="این مورد برای همیشه حذف می‌شود. ادامه می‌دهید؟" onConfirm={() => deleting && del(deleting)} onClose={() => setDeleting(null)} />
    </div>
  );
}
