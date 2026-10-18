"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import { ArrowUpLeft, Check, Minus, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { FEATURES, GROUPS, type FeatureMap } from "@/lib/plans";
import { TERM_LABELS, type BillingTerm, type PricedPlan } from "@/lib/plan-pricing";
import { formatNumber } from "@/lib/format";

export function Pricing({ plans, matrix, compare = false }: { plans: PricedPlan[]; matrix: Record<string, FeatureMap>; compare?: boolean }) {
  const [term,setTerm] = useState<BillingTerm>(12);
  const [query,setQuery] = useState("");
  const [differences,setDifferences] = useState(false);
  const rows = FEATURES.filter(f => `${f.label} ${f.desc ?? ""}`.includes(query.trim()) && (!differences || new Set(plans.map(p=>matrix[p.key][f.key])).size > 1));
  return <div>
    <div className="term-switch" role="group" aria-label="دوره پرداخت اشتراک">{([6,12] as const).map(t=><button type="button" key={t} aria-pressed={term===t} onClick={()=>setTerm(t)} className={term===t ? "selected" : ""}>{TERM_LABELS[t]} <span>{t===6 ? "۶ ماه همراهی" : "۱۲ ماه همراهی"}</span></button>)}</div>
    <div className="pricing-grid">{plans.map((p,i)=>{
      const price=p.terms[term];
      const included=FEATURES.filter(f=>matrix[p.key][f.key]!=="no");
      const highlights=["mini_site","cashier_pos","reservations","accounting","inventory","cloud_printer","loyalty","operating_hours"].map(key=>included.find(f=>f.key===key)).filter(f=>!!f).slice(0,5);
      return <article key={p.key} className={`price-card ${i===1 ? "featured-plan" : ""}`}>
        <div className="price-card-top"><span className="plan-index">{formatNumber(i+1).padStart(2,"۰")}</span>{i===1 && <span className="badge"><Sparkles size={13}/> پیشنهاد برای مدیریت یکپارچه</span>}</div>
        <h3>{p.name}</h3><p className="plan-tag">{p.tag}</p>
        <div className="price-amount" aria-live="polite"><div className="price-savings">{price.base > price.total ? <><del>{formatNumber(price.base)}</del><span>{new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(price.discount)}٪ تخفیف</span></> : <span>قیمت دوره بدون تخفیف</span>}</div><strong>{formatNumber(price.total)}</strong><span> تومان / {TERM_LABELS[term]}</span><small>معادل ماهانه {formatNumber(Math.round(price.total/term))} تومان · پرداخت یکجای دوره</small></div>
        <Link className="btn price-cta" href={`/checkout?plan=${p.key}&months=${term}`}>خرید آنلاین پلن {p.name}<ArrowUpLeft size={17}/></Link>
        <p className="included-count">{formatNumber(included.length)} امکان فعال در این پلن</p>
        <ul>{highlights.map(f=><li key={f.key}><Check size={16}/><span>{f.label}{matrix[p.key][f.key]==="custom" && " (اختصاصی)"}</span></li>)}</ul>
        <Link className="all-features-link" href={compare ? "#comparison" : "/plans#comparison"}>مشاهده همه امکانات <ArrowUpLeft size={15}/></Link>
      </article>;
    })}</div>
    {!compare && <div className="pricing-footnote"><p>انتخاب راحت‌تر، با دیدن تمام جزئیات.</p><Link href="/plans#comparison" className="btn btn-outline">مقایسه همه امکانات پلن‌ها <SlidersHorizontal size={17}/></Link></div>}
    {compare && <section id="comparison" className="comparison-section"><div className="section-heading"><span className="eyebrow">شفاف، تا آخرین امکان</span><h2>کنار هم ببینید. بهتر انتخاب کنید.</h2><p>این جدول از تنظیمات جاری امکانات پلن‌ها خوانده می‌شود. «اختصاصی» یعنی نسخهٔ ویژهٔ آن امکان.</p></div><div className="comparison-controls"><label className="input input-bordered"><Search size={18}/><input aria-label="جستجوی امکانات" placeholder="دنبال چه امکانی هستید؟" value={query} onChange={e=>setQuery(e.target.value)}/></label><label className="difference-toggle"><input type="checkbox" className="checkbox checkbox-sm" checked={differences} onChange={e=>setDifferences(e.target.checked)}/> فقط تفاوت‌ها</label><span>{formatNumber(rows.length)} امکان</span></div><p className="comparison-mobile-hint">برای مشاهدهٔ همهٔ پلن‌ها، جدول را افقی جابه‌جا کنید.</p><div className="comparison-scroll" tabIndex={0} role="region" aria-label="جدول مقایسه امکانات"><table className="table comparison-table"><caption className="sr-only">مقایسه تمام امکانات پلن‌های منوی دیجیتال</caption><thead><tr><th scope="col">امکانات سامانه</th>{plans.map(p=><th key={p.key} scope="col">{p.name}<small>{formatNumber(p.terms[term].total)} تومان / {TERM_LABELS[term]}</small></th>)}</tr></thead><tbody>{Object.entries(GROUPS).map(([key,group])=>{const groupRows=rows.filter(f=>f.group===key);return groupRows.length>0 && <Fragment key={key}><tr className="feature-group"><th colSpan={plans.length+1} scope="colgroup">{group.title}</th></tr>{groupRows.map(f=><tr key={f.key}><th scope="row"><span>{f.label}</span>{f.desc && <small>{f.desc}</small>}</th>{plans.map(p=><td key={p.key}>{matrix[p.key][f.key]==="yes" ? <span className="feature-yes"><Check size={18}/><span className="sr-only">دارد</span></span> : matrix[p.key][f.key]==="custom" ? <span className="badge badge-outline">اختصاصی</span> : <span className="feature-no"><Minus size={18}/><span className="sr-only">ندارد</span></span>}</td>)}</tr>)}</Fragment>})}{!rows.length && <tr><td colSpan={plans.length+1} className="empty-features">امکانی با این جستجو و فیلتر پیدا نشد.</td></tr>}</tbody></table></div></section>}
  </div>;
}
