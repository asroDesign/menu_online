"use client";
import { TERM_LABELS, type BillingTerm, type PricedPlan } from "@/lib/plan-pricing";

import { notifySetupSaved } from "@/lib/onboarding-tour";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { api, useCollection } from "@/lib/api";
import { useFeatures } from "@/components/features";
import { ModelViewer } from "@/components/model-viewer";
import { SettingCard } from "@/components/setting-card";
import { formatDate, formatNumber, formatPrice, formatTime, timeAgo, toFa } from "@/lib/format";
import { TICKET_DEPTS } from "@/lib/admin-meta";
import { FEATURES, GROUPS, LANGS, PLANS, planName, type FeatureMap, type Level, type Settings } from "@/lib/plans";
import type { Category, Product } from "@/lib/types";
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Icon, Input, Modal, PageHeader, ProductThumb, Select, Skeleton, Switch, Textarea, cn, useToast, iconGlyph, EmojiIcon, IconText} from "@/components/ui";

type BizSettings = { item: { slug: string; settings: Settings; name: string } };
const useBiz = () => {
  const [biz, setBiz] = useState<BizSettings["item"] | null>(null);
  useEffect(() => { api<BizSettings>("/api/business").then((r) => setBiz(r.item)); }, []);
  return [biz, setBiz] as const;
};
async function saveSetting(key: string, value: unknown) {
  return api<{ item: BizSettings["item"] }>("/api/business", { method: "PATCH", body: { settings: { [key]: value } } });
}

/* ---------------- Cross sell ---------------- */
type Rule = { id: number; productId: number; suggestedId: number };
export function CrossSell() {
  const products = useCollection<Product>("/api/products");
  const rules = useCollection<Rule>("/api/r/crosssell");
  const [pairs, setPairs] = useState<{ id: number; a: { name: string; emoji: string }; b: { name: string; emoji: string }; count: number }[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [auto, setAuto] = useState(true);
  const toast = useToast();
  useEffect(() => {
    api<{ items: typeof pairs }>("/api/r/crosssellauto").then((r) => setPairs(r.items)).catch(() => {});
    api<{ item: { settings: Settings } }>("/api/business").then((r) => setAuto(r.item.settings.crossSellAuto !== false));
  }, []);
  const cur = sel ?? products.items[0]?.id ?? null;
  const selected = products.items.find((p) => p.id === cur);
  async function toggle(sid: number) {
    const ex = rules.items.find((r) => r.productId === cur && r.suggestedId === sid);
    try {
      if (ex) await rules.remove(ex.id);
      else await rules.create({ productId: cur, suggestedId: sid }, { productId: cur!, suggestedId: sid });
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function toggleAuto(v: boolean) {
    setAuto(v);
    try { await saveSetting("crossSellAuto", v); } catch (e) { setAuto(!v); toast((e as Error).message, "error"); }
  }
  return (
    <div className="animate-fade-in">
      <PageHeader title="پیشنهاد هوشمند غذا و نوشیدنی" subtitle="هنگام سفارش، نوشیدنی متناسب با غذای انتخاب‌شده یا غذای همراه نوشیدنی به مشتری پیشنهاد می‌شود." />
      <Card className="mb-5 flex items-center justify-between gap-4 p-4">
        <div><p className="text-sm font-bold">پیشنهاد خودکار و جفت‌سازی غذا/نوشیدنی</p><p className="mt-0.5 text-xs leading-6 text-stone-500">پیشنهادها از همراهی‌های پرتکرار سفارش و دسته‌بندی غذا و نوشیدنی ساخته می‌شوند. پیشنهاد دستی شما اولویت دارد؛ تشخیص دسته از نام محصول و دستهٔ منو انجام می‌شود.</p></div>
        <Switch checked={auto} onChange={toggleAuto} label="پیشنهاد خودکار" />
      </Card>
      <IconText>{products.loading ? <Skeleton className="h-80 rounded-2xl" /> : products.items.length < 2 ? <EmptyState emoji="" title="حداقل دو محصول لازم است" description="ابتدا چند محصول به منو اضافه کنید." /> : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <Card className="max-h-[560px] overflow-y-auto p-2">
            {products.items.map((p) => {
              const n = rules.items.filter((r) => r.productId === p.id).length;
              return (
                <button key={p.id} onClick={() => setSel(p.id)} className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-sm transition", cur === p.id ? "bg-brand-50 font-bold text-brand-700" : "hover:bg-stone-50")}>
                  <span className="text-lg">{<EmojiIcon emoji={p.emoji} /> }</span><span className="flex-1 truncate">{p.name}</span>{n > 0 && <Badge color="brand">{toFa(n)}</Badge>}
                </button>
              );
            })}
          </Card>
          <div>
            <p className="mb-3 text-sm font-bold">وقتی «{<EmojiIcon emoji={selected?.emoji} /> } {selected?.name}» در سبد بود، این‌ها پیشنهاد شوند:</p>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {products.items.filter((p) => p.id !== cur).map((p) => {
                const on = rules.items.some((r) => r.productId === cur && r.suggestedId === p.id);
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} className={cn("flex items-center gap-3 rounded-2xl p-3 text-start ring-1 transition", on ? "bg-brand-50 ring-brand-400" : "bg-white ring-stone-200 hover:ring-brand-300")}>
                    <ProductThumb imageUrl={p.imageUrl} emoji={iconGlyph(p.emoji)} className="size-12 shrink-0 rounded-xl" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="text-xs text-stone-500">{formatPrice(p.price)}</span></span>
                    <span className={cn("flex size-6 items-center justify-center rounded-full text-xs", on ? "bg-brand-500 text-white" : "bg-stone-100")}>{on ? "✓" : "+"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}</IconText>
      <Card className="mt-6 p-5">
        <h3 className="font-bold">پرتکرارترین ترکیب‌های سفارش (خودکار)</h3>
        {pairs.length === 0 ? <p className="mt-3 text-sm text-stone-400">هنوز داده‌ی کافی وجود ندارد.</p> : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">{pairs.slice(0, 8).map((p) => <li key={p.id} className="flex items-center justify-between rounded-xl bg-stone-50 px-3.5 py-2.5 text-sm"><span>{<EmojiIcon emoji={p.a.emoji} /> } {p.a.name} + {<EmojiIcon emoji={p.b.emoji} /> } {p.b.name}</span><Badge color="emerald">{toFa(p.count)} بار</Badge></li>)}</ul>
        )}
      </Card>
    </div>
  );
}

/* ---------------- SMS / Bale ---------------- */
type Campaign = { id: number; kind: string; audience: string; body: string; recipients: number; status: string; createdAt: string };
const AUDIENCE: Record<string, string> = { all: "همه مشتریان", vip: "مشتریان ویژه (امتیاز ۸۰۰+)", inactive: "کم‌سفارش (۱ سفارش یا کمتر)", manual: "شماره‌های دستی" };

function Messaging({ channel }: { channel: "sms" | "bale" }) {
  const toast = useToast();
  const [items, setItems] = useState<Campaign[] | null>(null);
  const [meta, setMeta] = useState({ sender: "", simulated: true });
  const [err, setErr] = useState("");
  const [kind, setKind] = useState("promo");
  const [audience, setAudience] = useState("all");
  const [numbers, setNumbers] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ items: Campaign[]; sender: string; simulated: boolean }>(`/api/r/${channel}`).then((r) => { setItems(r.items); setMeta({ sender: r.sender, simulated: r.simulated }); }).catch((e) => setErr(e.message)), [channel]);
  useEffect(() => { load(); }, [load]);
  async function send() {
    setBusy(true);
    try {
      const { item } = await api<{ item: Campaign }>(`/api/r/${channel}`, { method: "POST", body: { kind, audience, numbers, body } });
      setItems((x) => [item, ...(x ?? [])]);
      setBody("");
      toast(`پیام برای ${toFa(item.recipients)} نفر ارسال شد`);
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  const isSms = channel === "sms";
  const segs = Math.max(1, Math.ceil(body.length / 70));
  return (
    <div className="animate-fade-in">
      <PageHeader title={isSms ? "پنل پیامکی" : "تبلیغات در پیام‌رسان بله"} subtitle={isSms ? "ارسال پیامک خدماتی و تبلیغاتی با خط اختصاصی به مشتریان باشگاه" : "ارسال پیام تبلیغاتی و اطلاع‌رسانی به مشتریان از طریق بله"} />
      <SettingCard title={isSms ? "شماره خط ارسال" : "نام ربات / کانال بله"} desc={meta.simulated ? "حالت آزمایشی: پیام‌ها ثبت می‌شوند و برای ارسال واقعی باید API سرویس‌دهنده (متغیر SMS_API_KEY) متصل شود." : "اتصال به سرویس‌دهنده برقرار است."} k={isSms ? "smsSender" : "baleBot"} type="text" placeholder={isSms ? "30001234" : "@my_bot"} />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="p-5">
          <h3 className="mb-4 font-bold">پیام جدید</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نوع پیام"><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="promo">تبلیغاتی</option><option value="service">خدماتی / اطلاع‌رسانی</option></Select></Field>
            <Field label="گیرندگان"><Select value={audience} onChange={(e) => setAudience(e.target.value)}>{Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            {audience === "manual" && <Field label="شماره‌ها (با ویرگول یا خط جدید جدا کنید)" className="sm:col-span-2"><Textarea rows={2} dir="ltr" value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder="09121234567, 09351234567" /></Field>}
            <Field label="متن پیام" className="sm:col-span-2" hint={`${toFa(body.length)} کاراکتر${isSms ? ` · ${toFa(segs)} پیامک` : ""}`}><Textarea rows={4} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} placeholder="مثلاً: با کد WELCOME10 در سفارش بعدی ۱۰٪ تخفیف بگیرید." /></Field>
          </div>
          <div className="mt-4 flex justify-end"><Button onClick={send} loading={busy} disabled={body.trim().length < 3}>ارسال پیام</Button></div>
        </Card>
        <Card className="bg-gradient-to-b from-stone-100 to-white p-5">
          <p className="mb-3 text-xs font-bold text-stone-500">پیش‌نمایش</p>
          <div className="mx-auto max-w-[260px] rounded-3xl bg-stone-900 p-2.5"><div className="min-h-40 rounded-2xl bg-white p-3"><p className="mb-2 text-[10px] text-stone-400">{meta.sender || (isSms ? "خط خدماتی" : "بله")}</p><div className={cn("rounded-2xl rounded-ss-sm px-3 py-2 text-xs leading-6", isSms ? "bg-stone-100" : "bg-sky-100")}>{body || "متن پیام شما اینجا نمایش داده می‌شود…"}</div></div></div>
        </Card>
      </div>
      <h3 className="mb-3 mt-8 font-bold">تاریخچه ارسال</h3>
      <IconText>{err ? <ErrorState message={err} /> : !items ? <Skeleton className="h-32 rounded-2xl" /> : items.length === 0 ? <EmptyState emoji="" title="هنوز پیامی ارسال نشده" description="اولین کمپین خود را بفرستید." /> : (
        <div className="space-y-2.5">{items.map((c) => (
          <Card key={c.id} className="flex flex-wrap items-center gap-3 p-4 animate-pop">
            <Badge color={c.kind === "promo" ? "brand" : "blue"}>{c.kind === "promo" ? "تبلیغاتی" : "خدماتی"}</Badge>
            <p className="min-w-48 flex-1 text-sm">{c.body}</p>
            <span className="text-xs text-stone-500">{AUDIENCE[c.audience]} · {toFa(c.recipients)} نفر</span>
            <Badge color="emerald">ارسال شد</Badge>
            <span className="text-xs text-stone-400">{timeAgo(c.createdAt)}</span>
          </Card>
        ))}</div>
      )}</IconText>
    </div>
  );
}
export function Bale() {
  return (
    <div className="animate-fade-in max-w-3xl">
      <PageHeader title="تبلیغات در پیام‌رسان بله" subtitle="ارسال پیام به مشتریان از طریق ربات بله" />
      <Card className="space-y-3 p-6">
        <p className="text-sm leading-8 text-stone-700">ربات‌های بله فقط می‌توانند به کاربرانی پیام بدهند که قبلاً ربات را استارت کرده‌اند و برای هر کاربر باید <b>شناسه‌ی گفتگو (chat_id)</b> ذخیره شود؛ ارسال انبوه با «شماره موبایل» در بله ممکن نیست.</p>
        <p className="text-sm leading-8 text-stone-700">به همین دلیل در این نسخه، ارسال تبلیغ در بله به سرویس بله متصل <b>نیست</b> و هیچ پیام ساختگی‌ای ثبت نمی‌شود. برای اطلاع‌رسانی گروهی از <b>پنل پیامک</b> (کاوه‌نگار / sms.ir با روش پترن) استفاده کنید.</p>
        <Link href="/dashboard/sms" className="inline-block rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white">رفتن به پنل پیامک</Link>
      </Card>
    </div>
  );
}

/* ---------------- Translations ---------------- */
type Tr = { entityType: string; entityId: number; lang: string; name: string; description: string };
export function Translations() {
  const toast = useToast();
  const cats = useCollection<Category>("/api/categories");
  const prods = useCollection<Product>("/api/products");
  const [langs, setLangs] = useState<string[]>(["fa"]);
  const [lang, setLang] = useState("en");
  const [trs, setTrs] = useState<Record<string, Tr>>({});
  const [tab, setTab] = useState<"product" | "category">("product");
  useEffect(() => { api<{ item: { settings: Settings } }>("/api/business").then((r) => setLangs(r.item.settings.languages ?? ["fa"])); }, []);
  useEffect(() => {
    api<{ items: Tr[] }>(`/api/r/translations?lang=${lang}`).then((r) => setTrs(Object.fromEntries(r.items.map((t) => [`${t.entityType}:${t.entityId}`, t])))).catch(() => {});
  }, [lang]);
  const active = langs.filter((l) => l !== "fa");
  const useLang = active.includes(lang) ? lang : active[0];
  async function toggleLang(l: string) {
    const next = langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l];
    setLangs(next);
    try { await saveSetting("languages", next); if (!next.includes(lang)) setLang(next.find((x) => x !== "fa") ?? "en"); } catch (e) { setLangs(langs); toast((e as Error).message, "error"); }
  }
  async function saveRow(type: string, id: number, patch: { name?: string; description?: string }) {
    const k = `${type}:${id}`;
    const cur = trs[k] ?? { entityType: type, entityId: id, lang: useLang, name: "", description: "" };
    const next = { ...cur, ...patch };
    setTrs((t) => ({ ...t, [k]: next }));
    try { await api("/api/r/translations", { method: "POST", body: { entityType: type, entityId: id, lang: useLang, name: next.name, description: next.description } }); } catch (e) { toast((e as Error).message, "error"); }
  }
  const rows = tab === "product" ? prods.items.map((p) => ({ id: p.id, name: p.name, desc: p.description, emoji: p.emoji })) : cats.items.map((c) => ({ id: c.id, name: c.name, desc: "", emoji: c.emoji }));
  const done = rows.filter((r) => trs[`${tab}:${r.id}`]?.name).length;
  return (
    <div className="animate-fade-in">
      <PageHeader title="ترجمه منو" subtitle="منو را به هر زبانی ارائه دهید؛ مشتری در منو زبان مورد نظر را انتخاب می‌کند" />
      <Card className="mb-5 p-5">
        <p className="mb-3 text-sm font-bold">زبان‌های فعال منو</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(LANGS).map(([k, v]) => (
            <button key={k} disabled={k === "fa"} onClick={() => toggleLang(k)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition", langs.includes(k) ? "bg-brand-500 text-white ring-brand-500" : "bg-white ring-stone-200 hover:ring-brand-300", k === "fa" && "cursor-default opacity-90")}>{v.name}{k === "fa" && " (پیش‌فرض)"}</button>
          ))}
        </div>
      </Card>
      <IconText>{active.length === 0 ? <EmptyState emoji="" title="زبان دومی فعال نیست" description="یکی از زبان‌های بالا را فعال کنید تا بتوانید ترجمه را وارد کنید." /> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Select className="w-44" value={useLang} onChange={(e) => setLang(e.target.value)}>{active.map((l) => <option key={l} value={l}>{LANGS[l].name}</option>)}</Select>
            <div className="flex gap-2">{(["product", "category"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={cn("rounded-xl px-4 py-2 text-sm font-medium", tab === t ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200")}>{t === "product" ? "محصولات" : "دسته‌بندی‌ها"}</button>)}</div>
            <Badge color="emerald">{toFa(done)} از {toFa(rows.length)} ترجمه شده</Badge>
            <span className="text-xs text-stone-400">هر فیلد پس از خروج از آن ذخیره می‌شود</span>
          </div>
          {prods.loading || cats.loading ? <Skeleton className="h-64 rounded-2xl" /> : (
            <Card className="divide-y divide-stone-100">
              {rows.map((r) => {
                const t = trs[`${tab}:${r.id}`];
                return (
                  <div key={r.id} className="grid gap-3 p-4 md:grid-cols-[240px_1fr_1.4fr]">
                    <div><p className="font-semibold">{<EmojiIcon emoji={r.emoji} /> } {r.name}</p>{r.desc && <p className="mt-1 line-clamp-2 text-xs text-stone-400">{r.desc}</p>}</div>
                    <Input dir={LANGS[useLang].dir} key={`n-${useLang}-${r.id}-${t?.name ?? ""}`} defaultValue={t?.name ?? ""} placeholder="نام" onBlur={(e) => e.target.value !== (t?.name ?? "") && saveRow(tab, r.id, { name: e.target.value })} />
                    {tab === "product" && <Input dir={LANGS[useLang].dir} key={`d-${useLang}-${r.id}-${t?.description ?? ""}`} defaultValue={t?.description ?? ""} placeholder="توضیحات" onBlur={(e) => e.target.value !== (t?.description ?? "") && saveRow(tab, r.id, { description: e.target.value })} />}
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}</IconText>
    </div>
  );
}

/* ---------------- Mini site ---------------- */
export function MiniSiteEditor() {
  const toast = useToast();
  const f = useFeatures();
  const custom = f.level("mini_site") === "custom";
  const [biz, setBiz] = useBiz();
  const [msOverride, setMsOverride] = useState<NonNullable<Settings["miniSite"]> | null>(null);
  const [busy, setBusy] = useState(false);
  const ms = msOverride ?? (biz ? { showMenuButton: true, gallery: [], sections: [], ...(biz.settings.miniSite ?? {}) } : null);
  if (!biz || !ms) return <Skeleton className="h-96 rounded-2xl" />;
  const set = (p: Partial<typeof ms>) => setMsOverride({ ...ms, ...p });
  async function save() {
    setBusy(true);
    try { const r = await saveSetting("miniSite", ms); setBiz(r.item); toast("مینی وبسایت ذخیره شد"); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  return (
    <div className="animate-fade-in pb-6">
      <PageHeader title="مینی وبسایت" subtitle="صفحه‌ی معرفی کسب‌وکار شما با منو، گالری و اطلاعات تماس" actions={<><Badge color={custom ? "violet" : "brand"}><IconText>{custom ? " نسخه اختصاصی" : "نسخه استاندارد"}</IconText></Badge><a href={`/s/${biz.slug}`} target="_blank"><Button variant="secondary"><Icon name="external" className="size-4" /> مشاهده سایت</Button></a><Button onClick={save} loading={busy}>ذخیره</Button></>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <Field label="عنوان اصلی"><Input value={ms.heroTitle ?? ""} onChange={(e) => set({ heroTitle: e.target.value })} placeholder={biz.name} /></Field>
          <Field label="زیرعنوان"><Input value={ms.heroSubtitle ?? ""} onChange={(e) => set({ heroSubtitle: e.target.value })} /></Field>
          <Field label="درباره‌ی ما"><Textarea rows={5} value={ms.about ?? ""} onChange={(e) => set({ about: e.target.value })} /></Field>
          <Field label="ساعات کار"><Input value={ms.hours ?? ""} onChange={(e) => set({ hours: e.target.value })} placeholder="همه روزه ۸ تا ۲۴" /></Field>
          <div className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3"><span className="text-sm font-medium">دکمه‌ی «مشاهده منو»</span><Switch checked={ms.showMenuButton !== false} onChange={(v) => set({ showMenuButton: v })} label="دکمه منو" /></div>
        </Card>
        <Card className="space-y-4 p-5">
          <Field label="گالری تصاویر (هر آدرس در یک خط)" hint="حداکثر ۸ تصویر"><Textarea rows={5} dir="ltr" value={(ms.gallery ?? []).join("\n")} onChange={(e) => set({ gallery: e.target.value.split("\n") })} placeholder="/food/coffee.jpg" /></Field>
          <IconText>{custom ? (
            <>
              <Field label="تصویر سربرگ (اختصاصی)"><Input dir="ltr" className="text-left" value={ms.heroImage ?? ""} onChange={(e) => set({ heroImage: e.target.value })} placeholder="https://…" /></Field>
              <div>
                <p className="mb-2 text-xs font-semibold text-stone-600">بخش‌های سفارشی صفحه (اختصاصی)</p>
                <div className="space-y-2">
                  {(ms.sections ?? []).map((s, i) => (
                    <div key={i} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
                      <div className="flex gap-2"><Input value={s.title} placeholder="عنوان بخش" onChange={(e) => set({ sections: ms.sections!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /><Button variant="ghost" size="sm" onClick={() => set({ sections: ms.sections!.filter((_, j) => j !== i) })}>حذف</Button></div>
                      <Textarea className="mt-2" rows={2} value={s.text} placeholder="متن" onChange={(e) => set({ sections: ms.sections!.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                    </div>
                  ))}
                  {(ms.sections?.length ?? 0) < 6 && <Button variant="secondary" size="sm" onClick={() => set({ sections: [...(ms.sections ?? []), { title: "", text: "" }] })}><Icon name="plus" className="size-4" /> افزودن بخش</Button>}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl bg-violet-50 p-4 text-sm leading-7 text-violet-800">{<EmojiIcon emoji="" />} تصویر سربرگ اختصاصی و بخش‌های سفارشی صفحه فقط در پلن <b>پرمیوم پلاس</b> (وبسایت اختصاصی برند) فعال است.</div>
          )}</IconText>
        </Card>
      </div>
    </div>
  );
}

/* ---------------- Domain ---------------- */
export function Domain() {
  const toast = useToast();
  const [d, setD] = useState<{ domain: string | null; status: string; appHost: string } | null>(null);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api<{ domain: string | null; status: string; appHost: string }>("/api/domain").then((r) => { setD(r); setVal(r.domain ?? ""); }), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Skeleton className="h-72 rounded-2xl" />;
  async function save() {
    setBusy("save");
    try { await api("/api/domain", { method: "PUT", body: { domain: val } }); await load(); toast(val ? "دامنه ثبت شد؛ رکوردهای DNS را تنظیم کنید" : "دامنه حذف شد"); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(null); }
  }
  async function verify() {
    setBusy("verify");
    try { const r = await api<{ verified: boolean }>("/api/domain/verify", { method: "POST" }); await load(); toast(r.verified ? "دامنه تأیید شد " : "هنوز DNS به این سرویس اشاره نمی‌کند؛ چند دقیقه بعد دوباره تلاش کنید", r.verified ? "success" : "error"); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(null); }
  }
  return (
    <div className="animate-fade-in max-w-3xl">
      <PageHeader title="دامنه اختصاصی" subtitle="منوی خود را روی دامنه‌ی برند خودتان (مثلاً menu.mybrand.ir) منتشر کنید" />
      <Card className="space-y-4 p-5">
        <Field label="نام دامنه"><div className="flex gap-2"><Input dir="ltr" className="text-left" value={val} onChange={(e) => setVal(e.target.value)} placeholder="menu.example.com" /><Button onClick={save} loading={busy === "save"} disabled={val === (d.domain ?? "")}>ثبت</Button></div></Field>
        <IconText>{d.domain && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-stone-50 p-4">
            <span className="text-sm">وضعیت <b dir="ltr">{d.domain}</b>:</span>
            {d.status === "verified" ? <Badge color="emerald">{<EmojiIcon emoji="" />} تأیید شده</Badge> : <Badge color="amber">{<EmojiIcon emoji="" />} در انتظار تنظیم DNS</Badge>}
            <Button size="sm" variant="secondary" className="ms-auto" onClick={verify} loading={busy === "verify"}>بررسی DNS</Button>
          </div>
        )}</IconText>
      </Card>
      <Card className="mt-5 p-5">
        <h3 className="mb-3 font-bold">راهنمای اتصال</h3>
        <p className="mb-4 text-sm leading-7 text-stone-600">در پنل DNS دامنه‌ی خود یکی از رکوردهای زیر را اضافه کنید، سپس روی «بررسی DNS» بزنید:</p>
        <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200"><table className="w-full text-sm" dir="ltr"><thead className="bg-stone-50 text-xs text-stone-500"><tr><th className="p-3 text-left">Type</th><th className="p-3 text-left">Name</th><th className="p-3 text-left">Value</th></tr></thead><tbody><tr className="border-t"><td className="p-3 font-bold">CNAME</td><td className="p-3">{d.domain?.split(".")[0] ?? "menu"}</td><td className="p-3">{d.appHost}</td></tr></tbody></table></div>
        <p className="mt-3 text-xs text-stone-400">پس از تأیید، آدرس دامنه‌ی شما مستقیماً منوی/مینی‌وبسایت شما را نمایش می‌دهد. گواهی SSL باید در لایه‌ی میزبانی (پروکسی/CDN) فعال شود.</p>
      </Card>
    </div>
  );
}

/* ---------------- AR ---------------- */
export function ArPage() {
  const products = useCollection<Product>("/api/products");
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<Product | null>(null);
  async function save(p: Product) {
    try { await products.update(p.id, { arModelUrl: (drafts[p.id] ?? p.arModelUrl).trim() }); setDrafts((d) => { const n = { ...d }; delete n[p.id]; return n; }); toast("ذخیره شد"); } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <div className="animate-fade-in">
      <PageHeader title="واقعیت افزوده (AR)" subtitle="برای هر محصول یک مدل سه‌بعدی (فایل GLB/GLTF) تعریف کنید؛ مشتری می‌تواند آن را در منو ببیند و روی میز خودش قرار دهد" />
      <IconText>{products.loading ? <Skeleton className="h-64 rounded-2xl" /> : products.items.length === 0 ? <EmptyState emoji="" title="محصولی وجود ندارد" description="ابتدا محصولات منو را اضافه کنید." /> : (
        <Card className="divide-y divide-stone-100">
          {products.items.map((p) => {
            const v = drafts[p.id] ?? p.arModelUrl;
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <ProductThumb imageUrl={p.imageUrl} emoji={iconGlyph(p.emoji)} className="size-12 rounded-xl" />
                <p className="w-44 truncate font-semibold">{p.name}</p>
                <Input className="min-w-60 flex-1 text-left" dir="ltr" value={v} onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })} placeholder="https://…/model.glb" />
                {p.arModelUrl && <Badge color="emerald">AR فعال</Badge>}
                <Button size="sm" variant="secondary" disabled={!p.arModelUrl} onClick={() => setPreview(p)}>پیش‌نمایش</Button>
                <Button size="sm" disabled={v === p.arModelUrl} onClick={() => save(p)}>ذخیره</Button>
              </div>
            );
          })}
        </Card>
      )}</IconText>
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? `پیش‌نمایش سه‌بعدی: ${preview.name}` : ""}>{preview && <ModelViewer src={preview.arModelUrl} />}</Modal>
    </div>
  );
}

/* ---------------- AI ---------------- */
type Insights = { top: { name: string; qty: number }[]; slow: { id: number; name: string }[]; peakHour: number; hasOrders: boolean; avgTicket: number; lowStock: { name: string; stock: number; unit: string }[]; tips: string[]; engine: string };
export function AiPage() {
  const toast = useToast();
  const products = useCollection<Product>("/api/products");
  const [ins, setIns] = useState<Insights | null>(null);
  const [err, setErr] = useState("");
  const [pid, setPid] = useState("");
  const [tone, setTone] = useState("friendly");
  const [out, setOut] = useState<{ text: string; engine: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Insights>("/api/r/ai").then(setIns).catch((e) => setErr(e.message)); }, []);
  const productId = pid || String(products.items[0]?.id ?? "");
  async function gen() {
    setBusy(true);
    try { const r = await api<{ item: { text: string; engine: string } }>("/api/r/ai", { method: "POST", body: { productId: Number(productId), tone } }); setOut(r.item); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  async function apply() {
    if (!out) return;
    try { await products.update(Number(productId), { description: out.text }); toast("توضیح روی محصول اعمال شد"); } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <div className="animate-fade-in">
      <PageHeader title="هوش مصنوعی" subtitle="تحلیل فروش و پیشنهادهای هوشمند، به‌علاوه نویسنده‌ی خودکار توضیح محصولات" actions={ins && <Badge color={ins.engine === "openai" ? "violet" : "stone"}>{ins.engine === "openai" ? "موتور: OpenAI" : "موتور: تحلیل داخلی"}</Badge>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 font-bold"><IconText>{<EmojiIcon emoji="" />}</IconText> تحلیل کسب‌وکار (۱۴ روز اخیر)</h3>
          <IconText>{err ? <ErrorState message={err} /> : !ins ? <Skeleton className="h-60" /> : (
            <div className="space-y-4">
              <ul className="space-y-2.5">{ins.tips.map((t, i) => <li key={i} className="flex gap-2.5 rounded-xl bg-brand-50 p-3 text-sm leading-7 text-brand-900"><span>{<EmojiIcon emoji="" />}</span>{t}</li>)}</ul>
              {ins.top.length > 0 && <div><p className="mb-2 text-xs font-bold text-stone-500">پرفروش‌ها</p><div className="flex flex-wrap gap-2">{ins.top.map((t) => <Badge key={t.name} color="emerald">{t.name} · {toFa(t.qty)}</Badge>)}</div></div>}
              {ins.slow.length > 0 && <div><p className="mb-2 text-xs font-bold text-stone-500">بدون فروش</p><div className="flex flex-wrap gap-2">{ins.slow.map((t) => <Badge key={t.id} color="rose">{t.name}</Badge>)}</div></div>}
              {ins.lowStock.length > 0 && <div><p className="mb-2 text-xs font-bold text-stone-500">کمبود موجودی</p><div className="flex flex-wrap gap-2">{ins.lowStock.map((t) => <Badge key={t.name} color="amber">{t.name}: {toFa(t.stock)} {t.unit}</Badge>)}</div></div>}
              {ins.avgTicket > 0 && <p className="text-xs text-stone-500">میانگین سفارش: <b className="text-stone-800">{formatPrice(ins.avgTicket)}</b></p>}
            </div>
          )}</IconText>
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 font-bold"><IconText>{<EmojiIcon emoji="" />}</IconText> نویسنده‌ی توضیح محصول</h3>
          <div className="space-y-3">
            <Field label="محصول"><Select value={productId} onChange={(e) => setPid(e.target.value)}>{products.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="لحن"><Select value={tone} onChange={(e) => setTone(e.target.value)}><option value="friendly">صمیمی</option><option value="luxury">لوکس</option><option value="short">کوتاه</option></Select></Field>
            <Button onClick={gen} loading={busy} disabled={!productId}><IconText>{<EmojiIcon emoji="" />}</IconText> تولید توضیح</Button>
            {out && <div className="rounded-xl bg-stone-50 p-4 text-sm leading-8 animate-pop">{out.text}<div className="mt-3 flex items-center gap-2"><Button size="sm" onClick={apply}>اعمال روی محصول</Button><Badge>{out.engine === "openai" ? "OpenAI" : "قالب داخلی"}</Badge></div></div>}
            <p className="text-[11px] leading-6 text-stone-400">برای کیفیت بهتر، متغیر محیطی OPENAI_API_KEY را روی سرور تنظیم کنید.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------------- Payments ---------------- */
type Pay = { id: number; provider: string; amount: number; status: string; authority: string; settlementError: string; settlementAttempts: number; orderNumber: number; createdAt: string };
const PROV: Record<string, string> = { ipg: "زرین‌پال", snappay: "اسنپ‌پی", digipay: "دیجی‌پی" };
export function Payments() {
  const f = useFeatures();
  const toast = useToast();
  const [biz] = useBiz();
  const [ipgOverride, setIpgOverride] = useState<NonNullable<Settings["ipg"]> | null>(null);
  const [instOverride, setInstOverride] = useState<NonNullable<Settings["installment"]> | null>(null);
  const pays = useCollection<Pay>("/api/r/payments");
  const ipg = ipgOverride ?? (biz ? biz.settings.ipg ?? { provider: "zarinpal" as const, merchantId: "", sandbox: true } : null);
  const inst = instOverride ?? (biz ? biz.settings.installment ?? { snappay: false, digipay: false } : null);
  if (!ipg || !inst) return <Skeleton className="h-80 rounded-2xl" />;
  async function saveIpg() { try { await saveSetting("ipg", ipg); toast("تنظیمات درگاه ذخیره شد"); notifySetupSaved("online-payment"); } catch (e) { toast((e as Error).message, "error"); } }
  async function toggleInst(k: "snappay" | "digipay", v: boolean) {
    const current = inst ?? { snappay: false, digipay: false };
    const next: NonNullable<Settings["installment"]> = { snappay: current.snappay ?? false, digipay: current.digipay ?? false, [k]: v }; setInstOverride(next);
    try { await saveSetting("installment", next); } catch (e) { setInstOverride(current); toast((e as Error).message, "error"); }
  }
  return (
    <div className="animate-fade-in">
      <PageHeader title="درگاه‌های پرداخت" subtitle="دریافت آنلاین وجه سفارش مشتریان با درگاه بانکی یا پرداخت اقساطی" />
      <div className="grid gap-5 lg:grid-cols-2">
        <IconText>{f.has("ipg") && (
          <Card className="space-y-4 p-5">
            <h3 className="font-bold">{<EmojiIcon emoji="" />} درگاه پرداخت بانکی (IPG)</h3>
            <Field label="ارائه‌دهنده"><Select data-tour="ipg-provider" value={ipg.provider} onChange={(e) => setIpgOverride({ ...ipg, provider: e.target.value })}><option value="zarinpal">زرین‌پال (Zarinpal)</option></Select></Field>
            {!ipg.merchantId && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-800">تا «شناسه پذیرنده» وارد نشود، گزینه‌ی پرداخت آنلاین به مشتری نمایش داده نمی‌شود. پرداخت پس از بازگشت از درگاه با فراخوانی Verify زرین‌پال تأیید و سفارش پرداخت‌شده می‌شود.</p>}
            <Field label="شناسه پذیرنده (Merchant ID — ۳۶ کاراکتر)"><Input data-tour="ipg-merchant" dir="ltr" className="text-left" value={ipg.merchantId} onChange={(e) => setIpgOverride({ ...ipg, merchantId: e.target.value })} /></Field>
            <div className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3"><div><p className="text-sm font-semibold">حالت تست زرین‌پال (sandbox.zarinpal.com)</p><p className="text-xs text-stone-500">فقط برای تست قبل از راه‌اندازی؛ برای دریافت وجه واقعی خاموش کنید</p></div><span data-tour="ipg-sandbox"><Switch checked={ipg.sandbox} onChange={(v) => setIpgOverride({ ...ipg, sandbox: v })} label="sandbox" /></span></div>
            <Button data-tour="ipg-save" onClick={saveIpg}>ذخیره</Button>
          </Card>
        )}</IconText>
        <IconText>{f.has("installment") && (
          <Card className="space-y-2 p-5">
            <h3 className="font-bold">{<EmojiIcon emoji="" />} پرداخت اقساطی (اسنپ‌پی / دیجی‌پی)</h3>
            <p className="text-sm leading-7 text-stone-600">اتصال به این سرویس‌ها نیازمند قرارداد پذیرندگی و دریافت اعتبارنامه‌ی اختصاصی (توکن و آدرس‌های API) از خود شرکت‌هاست و بدون آن امکان‌پذیر نیست؛ به همین دلیل در این نسخه گزینه‌ی اقساطی به مشتری نمایش داده <b>نمی‌شود</b> تا هیچ پرداخت ساختگی‌ای ثبت نشود.</p>
            <p className="text-xs text-stone-400">پس از دریافت اعتبارنامه، کافی است آداپتور مربوطه به <code>startOnlinePayment</code> اضافه شود.</p>
          </Card>
        )}</IconText>
      </div>
      <h3 className="mb-3 mt-8 font-bold">تراکنش‌های آنلاین</h3>
      <IconText>{pays.loading ? <Skeleton className="h-32 rounded-2xl" /> : pays.items.length === 0 ? <EmptyState emoji="" title="هنوز تراکنش آنلاینی ثبت نشده" description="وقتی مشتری از منو با پرداخت آنلاین سفارش دهد، تراکنش اینجا نمایش داده می‌شود." /> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b bg-stone-50/70 text-xs text-stone-500"><th className="p-3 text-start">سفارش</th><th className="p-3 text-start">روش</th><th className="p-3 text-start">مبلغ</th><th className="p-3 text-start">وضعیت</th><th className="p-3 text-start">زمان</th></tr></thead><tbody className="divide-y divide-stone-100">{pays.items.map((p) => <tr key={p.id}><td className="p-3 font-bold">#{toFa(p.orderNumber)}</td><td className="p-3">{PROV[p.provider]}</td><td className="p-3">{formatPrice(p.amount)}</td><td className="p-3"><Badge color={p.status === "paid" ? "emerald" : p.status === "failed" ? "rose" : "amber"}>{p.status === "paid" ? "موفق" : p.status === "failed" ? "ناموفق" : "در انتظار"}</Badge>{p.settlementError && <p className="mt-1 max-w-64 text-[11px] leading-5 text-rose-700">{p.settlementError} · تلاش {toFa(p.settlementAttempts)}</p>}</td><td className="p-3 text-xs text-stone-500">{timeAgo(p.createdAt)}</td></tr>)}</tbody></table></Card>
      )}</IconText>
    </div>
  );
}

/* ---------------- Tickets ---------------- */
type Ticket = { id: number; subject: string; status: string; priority: string; department: string; updatedAt: string; messageCount: number; lastMessage: string };
type Msg = { id: number; authorRole: string; authorName: string; body: string; createdAt: string };
const tStatus: Record<string, [string, string]> = { open: ["باز", "amber"], answered: ["پاسخ داده شد", "emerald"], closed: ["بسته", "stone"] };
export function Tickets() {
  const tk = useCollection<Ticket>("/api/r/tickets", { poll: 15000 });
  const toast = useToast();
  const [open, setOpen] = useState<number | null>(null);
  const [thread, setThread] = useState<{ ticket: Ticket; messages: Msg[] } | null>(null);
  const [reply, setReply] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: "", body: "", priority: "normal", department: "support" });
  const [sup, setSup] = useState<{ phone: string; email: string; hours: string } | null>(null);
  useEffect(() => { api<{ support: { phone: string; email: string; hours: string } }>("/api/announcements").then((r) => setSup(r.support)).catch(() => {}); }, []);
  const [busy, setBusy] = useState(false);
  const loadThread = useCallback((id: number) => api<{ ticket: Ticket; messages: Msg[] }>(`/api/r/tickets/${id}`).then(setThread).catch((e) => toast(e.message, "error")), [toast]);
  useEffect(() => { if (open) loadThread(open); }, [open, loadThread]);
  async function create() {
    setBusy(true);
    try { const { item } = await api<{ item: Ticket }>("/api/r/tickets", { method: "POST", body: form }); tk.setItems((x) => [item, ...x]); setCreating(false); setForm({ subject: "", body: "", priority: "normal", department: "support" }); setOpen(item.id); toast("تیکت ثبت شد"); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  async function send(status?: string) {
    if (!open) return;
    setBusy(true);
    try { await api(`/api/r/tickets/${open}`, { method: "PATCH", body: { reply, status } }); setReply(""); await loadThread(open); tk.reload(true); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  return (
    <div className="animate-fade-in">
      <PageHeader title="پشتیبانی و تیکت" subtitle="پشتیبانی ۲۴ ساعته؛ تیکت ثبت کنید یا از خط موبایل پشتیبانی تماس بگیرید" actions={<Button onClick={() => setCreating(true)}><Icon name="plus" className="size-4" /> تیکت جدید</Button>} />
      <Card className="mb-5 flex flex-wrap items-center gap-4 p-4 text-sm"><IconText>{sup?.phone && <><span>{<EmojiIcon emoji="" />} خط پشتیبانی: <b dir="ltr">{sup.phone}</b></span><span className="text-stone-400">·</span></>}</IconText><IconText>{sup?.email && <><span>{<EmojiIcon emoji="" />} <b dir="ltr">{sup.email}</b></span><span className="text-stone-400">·</span></>}</IconText><span><IconText>{<EmojiIcon emoji="" />}</IconText> ساعت پاسخگویی: {sup?.hours || "۲۴ ساعته"}</span></Card>
      <IconText>{tk.loading ? <Skeleton className="h-48 rounded-2xl" /> : tk.items.length === 0 ? <EmptyState emoji="" title="تیکتی ثبت نشده" description="هر سوال یا مشکلی داشتید برای ما بنویسید." action={<Button onClick={() => setCreating(true)}>ثبت تیکت</Button>} /> : (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <div className="space-y-2">{tk.items.map((t) => (
            <button key={t.id} onClick={() => setOpen(t.id)} className={cn("w-full rounded-2xl bg-white p-4 text-start ring-1 transition", open === t.id ? "ring-2 ring-brand-400" : "ring-stone-200 hover:ring-brand-300")}>
              <div className="flex items-start justify-between gap-2"><p className="font-bold">{t.subject}</p><Badge color={tStatus[t.status]?.[1]}>{tStatus[t.status]?.[0]}</Badge></div><Badge color="blue" className="mt-1.5">{<EmojiIcon emoji={TICKET_DEPTS[t.department]?.emoji} /> } {TICKET_DEPTS[t.department]?.label ?? t.department}</Badge>
              <p className="mt-1.5 line-clamp-1 text-xs text-stone-500">{t.lastMessage}</p>
              <p className="mt-2 text-[11px] text-stone-400">{toFa(t.messageCount)} پیام · {timeAgo(t.updatedAt)}</p>
            </button>
          ))}</div>
          <Card className="flex min-h-96 flex-col">
            {!open || !thread ? <div className="flex flex-1 items-center justify-center text-sm text-stone-400">یک تیکت را انتخاب کنید</div> : (
              <>
                <div className="flex items-center justify-between border-b border-stone-100 p-4"><h3 className="font-bold">{thread.ticket.subject}</h3><Badge color={tStatus[thread.ticket.status]?.[1]}>{tStatus[thread.ticket.status]?.[0]}</Badge></div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">{thread.messages.map((m) => m.authorRole === "system" ? <div key={m.id} className="mx-auto max-w-[90%] rounded-full bg-sky-50 px-4 py-1.5 text-center text-xs text-sky-800">{<EmojiIcon emoji="" />} {m.body} · {formatTime(m.createdAt)}</div> : <div key={m.id} className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7", m.authorRole === "user" ? "me-auto bg-brand-50" : "ms-auto bg-stone-100")}><p className="mb-1 text-[11px] font-bold text-stone-500">{m.authorName} · {formatTime(m.createdAt)}</p>{m.body}</div>)}</div>
                {thread.ticket.status !== "closed" ? (
                  <div className="space-y-2 border-t border-stone-100 p-4"><Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="پاسخ شما…" /><div className="flex justify-between"><Button variant="ghost" size="sm" onClick={() => send("closed")} disabled={busy}>بستن تیکت</Button><Button size="sm" onClick={() => send()} loading={busy} disabled={!reply.trim()}>ارسال</Button></div></div>
                ) : <p className="border-t border-stone-100 p-4 text-center text-xs text-stone-400">این تیکت بسته شده است.</p>}
              </>
            )}
          </Card>
        </div>
      )}</IconText>
      <Modal open={creating} onClose={() => setCreating(false)} title="تیکت جدید" footer={<><Button variant="ghost" onClick={() => setCreating(false)}>انصراف</Button><Button onClick={create} loading={busy} disabled={!form.subject.trim() || !form.body.trim()}>ثبت تیکت</Button></>}>
        <div className="space-y-4"><Field label="موضوع"><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field><Field label="بخش مربوط"><Select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>{Object.entries(TICKET_DEPTS).filter(([k]) => k !== "management").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field><Field label="اولویت"><Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">کم</option><option value="normal">عادی</option><option value="high">بالا</option></Select></Field><Field label="شرح مشکل"><Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field></div>
      </Modal>
    </div>
  );
}

/* ---------------- Plan ---------------- */
export function PlanPage() {
  const sp = useSearchParams();
  const locked = sp.get("locked");
  const [d, setD] = useState<{ plan: string; features: FeatureMap; matrix: Record<string, FeatureMap>; upgradeRequest: string | null; plans: PricedPlan[]; endsAt: string | null } | null>(null);
  const [term, setTerm] = useState<BillingTerm>(12);
  const [openInvoices, setOpenInvoices] = useState<any[]>([]);
  useEffect(() => { api<NonNullable<typeof d>>("/api/plan").then(setD); api<{ items: any[] }>("/api/subscription/invoices").then((r) => setOpenInvoices(r.items)).catch(() => {}); }, []);
  const lockedDef = useMemo(() => FEATURES.find((x) => x.key === locked), [locked]);
  if (!d) return <Skeleton className="h-96 rounded-2xl" />;
  const cell = (l: Level) => (l === "yes" ? <span className="text-emerald-600"><IconText>{<EmojiIcon emoji="" />}</IconText></span> : l === "custom" ? <Badge color="violet">اختصاصی</Badge> : <span className="text-stone-300">✕</span>);
  return (
    <div className="animate-fade-in">
      <PageHeader title="پلن و امکانات" subtitle="امکانات هر پلن و وضعیت دسترسی حساب شما" />
      {sp.get("payment") === "success" && <div className="mb-5 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">پرداخت با موفقیت تأیید شد و پلن شما فعال یا تمدید شد.</div>}
      {sp.get("payment") === "failed" && <div className="mb-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-800 ring-1 ring-rose-200">پرداخت تأیید نشد. می‌توانید دوباره تلاش کنید یا روش پرداخت دیگری را انتخاب کنید.</div>}
      <IconText>{lockedDef && <div className="mb-5 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm leading-7 text-amber-900 ring-1 ring-amber-200"><span className="text-xl">{<EmojiIcon emoji="" />}</span><p>امکان «<b>{lockedDef.label}</b>» در پلن فعلی شما (<b>{planName(d.plan)}</b>) فعال نیست. برای استفاده، پلن خود را ارتقا دهید.</p></div>}</IconText>
      <IconText>{d.upgradeRequest && <div className="mb-5 rounded-2xl bg-sky-50 p-4 text-sm text-sky-900 ring-1 ring-sky-200">{<EmojiIcon emoji="" />} درخواست ارتقا به پلن <b>{planName(d.upgradeRequest)}</b> در انتظار تأیید است.</div>}</IconText>
      <div className="mb-5 flex gap-2" role="group" aria-label="دوره تعرفه">{([6,12] as const).map(t=><Button key={t} variant={term===t ? "primary" : "secondary"} aria-pressed={term===t} onClick={()=>setTerm(t)}>{TERM_LABELS[t]}</Button>)}</div>
      <div className="grid gap-4 md:grid-cols-3">
        {d.plans.map((p) => {
          const cur = p.key === d.plan;
          return (
            <Card key={p.key} className={cn("p-5", cur && "ring-2 ring-brand-500")}>
              <div className="flex items-center justify-between"><h3 className="text-lg font-extrabold">{p.name}</h3>{cur && <Badge color="brand">پلن شما</Badge>}</div>
              <p className="mt-1 text-xs text-stone-500">{p.tag}</p>
              {p.terms[term].base > p.terms[term].total && <p className="mt-4 text-xs text-stone-400 line-through">{formatNumber(p.terms[term].base)} تومان</p>}
              <p className="text-2xl font-black">{formatNumber(p.terms[term].total)} <span className="text-xs font-medium text-stone-500">تومان / {TERM_LABELS[term]}</span></p>
              <p className="mt-3 text-xs text-stone-500">{toFa(FEATURES.filter((f) => d.matrix[p.key][f.key] !== "no").length)} از {toFa(FEATURES.length)} امکان</p>
              <Button className="mt-4 w-full" variant={cur ? "secondary" : "primary"} onClick={() => { window.location.assign(`/checkout?plan=${encodeURIComponent(p.key)}&months=${term}`); }}>{cur ? "تمدید این پلن" : "خرید این پلن"}</Button>
            </Card>
          );
        })}
      </div>
      {!!openInvoices.length && <Card className="mt-5 space-y-3 p-5"><div><h3 className="font-extrabold">فاکتورهای در انتظار پرداخت</h3><p className="mt-1 text-xs text-stone-500">فاکتورهای صادرشده توسط مدیریت را از اینجا پرداخت کنید.</p></div>{openInvoices.map((i) => <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-base-300 p-3"><span className="font-bold">فاکتور #{toFa(i.number)}</span><span className="text-sm text-base-content/60">{planName(i.plan)} · {toFa(i.months)} ماه</span><b className="ms-auto">{formatPrice(i.amount)}</b><Button size="sm" onClick={() => window.location.assign(`/checkout?invoiceId=${i.id}`)}>پرداخت فاکتور</Button></div>)}</Card>}
      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b bg-stone-50 text-xs text-stone-500"><th className="p-3 text-start">امکان</th>{PLANS.map((p) => <th key={p.key} className={cn("w-28 p-3 text-center", p.key === d.plan && "text-brand-600")}>{p.name}</th>)}<th className="w-28 p-3 text-center">حساب شما</th></tr></thead>
          <tbody>
            <IconText>{Object.entries(GROUPS).map(([g, meta]) => (
              <Fragment key={g}>
                <tr className="bg-stone-50/60"><td colSpan={5} className="p-3 text-xs font-extrabold text-stone-600">{<EmojiIcon emoji={meta.emoji} /> } {meta.title}</td></tr>
                {FEATURES.filter((f) => f.group === g).map((f) => (
                  <tr key={f.key} className={cn("border-t border-stone-100", f.key === locked && "bg-amber-50")}>
                    <td className="p-3"><p className="font-medium">{f.label}</p>{f.desc && <p className="mt-0.5 text-[11px] text-stone-400">{f.desc}</p>}</td>
                    {PLANS.map((p) => <td key={p.key} className="p-3 text-center">{cell(d.matrix[p.key][f.key])}</td>)}
                    <td className="p-3 text-center">{d.features[f.key] === "no" ? <Badge color="rose">{<EmojiIcon emoji="" />} قفل</Badge> : <Badge color="emerald">فعال</Badge>}</td>
                  </tr>
                ))}
              </Fragment>
            ))}</IconText>
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-stone-400">آخرین تغییر پلن: {formatDate(new Date())}</p>
    </div>
  );
}
