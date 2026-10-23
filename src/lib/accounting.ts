import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accAccounts, accDocuments, accFiscalYears, accLines, assets, bankAccounts, businesses, devices, inventoryItems, orders, transactions,
} from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { fmtJ, jMonthRange, jYearRange, toJ, fromJ } from "@/lib/jalali";
import * as jl from "jalaali-js";

type Biz = typeof businesses.$inferSelect;
type Acc = typeof accAccounts.$inferSelect;
type Q = typeof db;

/* ------------------------------------------------------------------ chart */
export const C = {
  CASH: "1101", BANK: "1102", AR: "1201", CHEQUE_RECEIVABLE: "1202", INV: "1301", FA_EQ: "1401", FA_FUR: "1402", ACC_DEP: "1409",
  AP: "2101", VAT: "2102", CB_LIAB: "2103", PAYROLL: "2104", CHEQUE_PAYABLE: "2105",
  CAPITAL: "3101", RETAINED: "3102", DRAW: "3103",
  SALES: "4101", DELIVERY: "4102", SERVICE: "4103", DISCOUNT: "4104", OTHER_INC: "4201", STOCK_GAIN: "4202",
  COGS: "5101", WASTE: "5102",
  RENT: "6101", PAY_EXP: "6102", UTIL: "6103", MKT: "6104", REPAIR: "6105", DEP_EXP: "6106", CB_EXP: "6107", SOFT: "6108", OTHER_EXP: "6109",
  SUMMARY: "7101",
} as const;

type Def = [code: string, name: string, level: "kol" | "moein", parent: string | null, type: string, nature: "debit" | "credit"];
const D = "debit", K = "credit";
const CHART: Def[] = [
  ["11", "موجودی نقد و بانک", "kol", null, "asset", D],
  ["1101", "صندوق", "moein", "11", "asset", D],
  ["1102", "بانک‌ها", "moein", "11", "asset", D],
  ["12", "حساب‌ها و اسناد دریافتنی", "kol", null, "asset", D],
  ["1201", "مشتریان (دریافتنی)", "moein", "12", "asset", D],
  [C.CHEQUE_RECEIVABLE, "اسناد دریافتنی (چک)", "moein", "12", "asset", D],
  ["13", "موجودی مواد و کالا", "kol", null, "asset", D],
  ["1301", "موجودی مواد اولیه", "moein", "13", "asset", D],
  ["14", "دارایی‌های ثابت", "kol", null, "asset", D],
  ["1401", "تجهیزات و ماشین‌آلات", "moein", "14", "asset", D],
  ["1402", "اثاثیه و منصوبات", "moein", "14", "asset", D],
  ["1409", "استهلاک انباشته", "moein", "14", "asset", K],
  ["21", "بدهی‌های جاری", "kol", null, "liability", K],
  ["2101", "حساب‌های پرداختنی (تأمین‌کنندگان)", "moein", "21", "liability", K],
  ["2102", "مالیات بر ارزش افزوده", "moein", "21", "liability", K],
  ["2103", "اعتبار کش‌بک مشتریان", "moein", "21", "liability", K],
  ["2104", "حقوق و دستمزد پرداختنی", "moein", "21", "liability", K],
  [C.CHEQUE_PAYABLE, "اسناد پرداختنی (چک)", "moein", "21", "liability", K],
  ["31", "حقوق صاحبان سرمایه", "kol", null, "equity", K],
  ["3101", "سرمایه", "moein", "31", "equity", K],
  ["3102", "سود (زیان) انباشته", "moein", "31", "equity", K],
  ["3103", "برداشت‌ها", "moein", "31", "equity", D],
  ["41", "درآمدهای عملیاتی", "kol", null, "revenue", K],
  ["4101", "فروش", "moein", "41", "revenue", K],
  ["4102", "درآمد ارسال (پیک)", "moein", "41", "revenue", K],
  ["4103", "درآمد خدمات", "moein", "41", "revenue", K],
  ["4104", "تخفیفات فروش", "moein", "41", "revenue", D],
  ["42", "سایر درآمدها", "kol", null, "revenue", K],
  ["4201", "درآمد متفرقه", "moein", "42", "revenue", K],
  ["4202", "مازاد انبار", "moein", "42", "revenue", K],
  ["51", "بهای تمام‌شده", "kol", null, "expense", D],
  ["5101", "بهای تمام‌شده کالای فروش‌رفته", "moein", "51", "expense", D],
  ["5102", "ضایعات و کسری انبار", "moein", "51", "expense", D],
  ["61", "هزینه‌های عملیاتی", "kol", null, "expense", D],
  ["6101", "اجاره", "moein", "61", "expense", D],
  ["6102", "حقوق و دستمزد", "moein", "61", "expense", D],
  ["6103", "قبوض (آب، برق، گاز، تلفن)", "moein", "61", "expense", D],
  ["6104", "بازاریابی و تبلیغات", "moein", "61", "expense", D],
  ["6105", "تعمیرات و نگهداری", "moein", "61", "expense", D],
  ["6106", "هزینه استهلاک", "moein", "61", "expense", D],
  ["6107", "هزینه کش‌بک مشتریان", "moein", "61", "expense", D],
  ["6108", "اینترنت و نرم‌افزار", "moein", "61", "expense", D],
  ["6109", "سایر هزینه‌ها", "moein", "61", "expense", D],
  ["71", "حساب‌های انتظامی و بستن", "kol", null, "equity", K],
  ["7101", "خلاصه سود و زیان", "moein", "71", "equity", K],
];

const initializing = new Map<number, Promise<void>>();
const readyBiz = new Set<number>();

export function ensureAccounting(biz: Biz) {
  if (readyBiz.has(biz.id)) return Promise.resolve();
  let p = initializing.get(biz.id);
  if (!p) {
    p = (async () => {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(accAccounts).where(eq(accAccounts.businessId, biz.id));
      if (n === 0) {
        await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(${biz.id + 777000})`);
          const [{ n: n2 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(accAccounts).where(eq(accAccounts.businessId, biz.id));
          if (n2 > 0) return;
          const ids = new Map<string, number>();
          for (const [code, name, level, parent, type, nature] of CHART) {
            const [r] = await tx.insert(accAccounts).values({ businessId: biz.id, code, name, level, parentId: parent ? ids.get(parent)! : null, type, nature, isSystem: true }).returning({ id: accAccounts.id });
            ids.set(code, r.id);
          }
        });
        await yearFor(biz.id, new Date());
        try { await backfill(biz); } catch (e) { console.error("accounting backfill failed", e); }
      }
      readyBiz.add(biz.id);
    })().finally(() => initializing.delete(biz.id));
    initializing.set(biz.id, p);
  }
  return p;
}

export async function loadAccounts(bizId: number) {
  return db.select().from(accAccounts).where(eq(accAccounts.businessId, bizId)).orderBy(asc(accAccounts.code));
}

/** Add the two cheque control accounts to existing charts without changing tenant-created accounts. */
export async function ensureChequeAccountingAccounts(biz: Biz) {
  await ensureAccounting(biz);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${biz.id + 779001})`);
    const all = await tx.select().from(accAccounts).where(eq(accAccounts.businessId, biz.id));
    const byCode = new Map(all.map((account) => [account.code, account]));
    const definitions = [
      { code: C.CHEQUE_RECEIVABLE, name: "اسناد دریافتنی (چک)", parentCode: "12", type: "asset", nature: "debit" },
      { code: C.CHEQUE_PAYABLE, name: "اسناد پرداختنی (چک)", parentCode: "21", type: "liability", nature: "credit" },
    ] as const;
    for (const definition of definitions) {
      const parent = byCode.get(definition.parentCode);
      if (!parent || parent.level !== "kol" || parent.type !== definition.type) {
        throw new HttpError(409, `سرفصل کل ${definition.parentCode} برای ثبت اسناد چک آماده نیست.`);
      }
      const existing = byCode.get(definition.code);
      if (existing) {
        if (existing.level !== "moein" || existing.parentId !== parent.id || existing.type !== definition.type || existing.nature !== definition.nature || !existing.isActive) {
          throw new HttpError(409, `کد حساب ${definition.code} با ساختار موردنیاز دفتر چک سازگار نیست.`);
        }
        continue;
      }
      const [created] = await tx.insert(accAccounts).values({
        businessId: biz.id, code: definition.code, name: definition.name, level: "moein", parentId: parent.id,
        type: definition.type, nature: definition.nature, isSystem: true,
      }).returning();
      byCode.set(created.code, created);
    }
  });
}
async function codeMap(bizId: number) {
  const all = await loadAccounts(bizId);
  return { all, byCode: new Map(all.map((a) => [a.code, a])), byId: new Map(all.map((a) => [a.id, a])) };
}

export async function bankDetailId(biz: Biz, bankId: number | null | undefined) {
  const { byCode, all } = await codeMap(biz.id);
  const moein = byCode.get(C.BANK)!;
  let bid = bankId ?? null;
  if (!bid) {
    const [b] = await db.select({ id: bankAccounts.id }).from(bankAccounts).where(eq(bankAccounts.businessId, biz.id)).orderBy(asc(bankAccounts.id)).limit(1);
    bid = b?.id ?? null;
  }
  if (!bid) return moein.id;
  const ex = all.find((a) => a.refType === "bank" && a.refId === bid);
  if (ex) return ex.id;
  const [b] = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, bid), eq(bankAccounts.businessId, biz.id)));
  if (!b) return moein.id;
  const seq = all.filter((a) => a.parentId === moein.id).length + 1;
  const [r] = await db.insert(accAccounts).values({ businessId: biz.id, code: `${C.BANK}${String(seq).padStart(2, "0")}`, name: `بانک — ${b.name}`, level: "tafsili", parentId: moein.id, type: "asset", nature: "debit", refType: "bank", refId: bid, isSystem: true }).returning({ id: accAccounts.id });
  return r.id;
}

/* ------------------------------------------------------------- fiscal year */
export async function yearFor(bizId: number, date: Date, create = true) {
  const [y] = await db.select().from(accFiscalYears).where(and(eq(accFiscalYears.businessId, bizId), lte(accFiscalYears.startDate, date), gte(accFiscalYears.endDate, date)));
  if (y || !create) return y;
  const { jy } = toJ(date);
  const { start, end } = jYearRange(jy);
  const [row] = await db.insert(accFiscalYears).values({ businessId: bizId, title: `سال مالی ${jy}`, startDate: start, endDate: end }).returning();
  return row;
}

/* --------------------------------------------------------------- documents */
export type LineIn = { accountId?: number; code?: string; debit?: number; credit?: number; description?: string };
export type DocIn = {
  date: Date; kind?: string; source?: string; sourceRef?: string | null; description?: string; status?: "draft" | "posted";
  lines: LineIn[]; createdBy?: string; reversedOf?: number | null;
};

async function prepare(bizId: number, d: DocIn, maps: Awaited<ReturnType<typeof codeMap>>, enforce = true) {
  const lines = d.lines
    .map((l) => {
      const acc = l.accountId ? maps.byId.get(l.accountId) : l.code ? maps.byCode.get(l.code) : undefined;
      if (!acc) throw new HttpError(400, "حساب انتخاب‌شده نامعتبر است");
      if (acc.level === "kol") throw new HttpError(400, `روی حساب کل («${acc.name}») سند نمی‌خورد؛ حساب معین یا تفصیلی انتخاب کنید`);
      const debit = Math.round(Number(l.debit) || 0), credit = Math.round(Number(l.credit) || 0);
      if (debit < 0 || credit < 0) throw new HttpError(400, "مبلغ منفی مجاز نیست");
      if (debit > 0 && credit > 0) throw new HttpError(400, "هر ردیف فقط یکی از بدهکار یا بستانکار را می‌پذیرد");
      return { accountId: acc.id, debit, credit, description: (l.description ?? "").slice(0, 200) };
    })
    .filter((l) => l.debit > 0 || l.credit > 0);
  const td = lines.reduce((s, l) => s + l.debit, 0), tc = lines.reduce((s, l) => s + l.credit, 0);
  if (enforce) {
    if (lines.length < 2) throw new HttpError(400, "سند باید حداقل دو ردیف دارای مبلغ داشته باشد");
    if (td !== tc) throw new HttpError(400, `سند تراز نیست؛ جمع بدهکار ${td.toLocaleString("fa-IR")} و جمع بستانکار ${tc.toLocaleString("fa-IR")}`);
    if (td === 0) throw new HttpError(400, "مبلغ سند صفر است");
  }
  return { ...d, lines, total: td };
}

async function insertDocs(tx: Q, bizId: number, docs: Awaited<ReturnType<typeof prepare>>[], opts: { allowClosed?: boolean } = {}) {
  const out: (typeof accDocuments.$inferSelect)[] = [];
  const yearCache = new Map<number, typeof accFiscalYears.$inferSelect>();
  const nextNo = new Map<number, number>();
  for (const d of docs) {
    const [y0] = await tx.select().from(accFiscalYears).where(and(eq(accFiscalYears.businessId, bizId), lte(accFiscalYears.startDate, d.date), gte(accFiscalYears.endDate, d.date)));
    let y = y0;
    if (!y) {
      const { jy } = toJ(d.date);
      const r = jYearRange(jy);
      [y] = await tx.insert(accFiscalYears).values({ businessId: bizId, title: `سال مالی ${jy}`, startDate: r.start, endDate: r.end }).returning();
    }
    yearCache.set(y.id, y);
    if (y.isClosed && !opts.allowClosed) throw new HttpError(400, `${y.title} بسته شده است و امکان ثبت سند در آن نیست`);
    if (!nextNo.has(y.id)) {
      const [m] = await tx.select({ n: sql<number>`coalesce(max(${accDocuments.number}),0)::int` }).from(accDocuments).where(and(eq(accDocuments.businessId, bizId), eq(accDocuments.fiscalYearId, y.id)));
      nextNo.set(y.id, m.n);
    }
    const number = nextNo.get(y.id)! + 1;
    nextNo.set(y.id, number);
    const [doc] = await tx.insert(accDocuments).values({
      businessId: bizId, fiscalYearId: y.id, number, date: d.date, kind: d.kind ?? "general", source: d.source ?? "manual",
      sourceRef: d.sourceRef ?? null, description: d.description ?? "", status: d.status ?? "posted", reversedOf: d.reversedOf ?? null,
      totalAmount: d.total, createdBy: d.createdBy ?? "",
    }).returning();
    if (d.lines.length) await tx.insert(accLines).values(d.lines.map((l) => ({ ...l, documentId: doc.id, businessId: bizId })));
    out.push(doc);
  }
  return out;
}

export async function postDocument(biz: Biz, d: DocIn, opts: { allowClosed?: boolean; enforce?: boolean } = {}) {
  await ensureAccounting(biz);
  if (d.sourceRef) {
    const [ex] = await db.select().from(accDocuments).where(and(eq(accDocuments.businessId, biz.id), eq(accDocuments.sourceRef, d.sourceRef)));
    if (ex) return ex;
  }
  const maps = await codeMap(biz.id);
  const prepared = await prepare(biz.id, d, maps, opts.enforce !== false);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${biz.id})`);
    const [doc] = await insertDocs(tx as unknown as Q, biz.id, [prepared], opts);
    return doc;
  });
}

/** Participate in the caller's stock transaction so posting failures roll everything back. */
export async function postDocumentInTransaction(tx: Q, biz: Biz, d: DocIn) {
  await tx.execute(sql`select pg_advisory_xact_lock(${biz.id})`);
  const all = await tx.select().from(accAccounts).where(eq(accAccounts.businessId, biz.id));
  const maps = { all, byCode: new Map(all.map((a) => [a.code, a])), byId: new Map(all.map((a) => [a.id, a])) };
  const prepared = await prepare(biz.id, d, maps);
  const [doc] = await insertDocs(tx, biz.id, [prepared]);
  return doc;
}

export async function replaceDraftLines(biz: Biz, docId: number, d: Omit<DocIn, "date"> & { date: Date }) {
  const maps = await codeMap(biz.id);
  const prepared = await prepare(biz.id, { ...d, status: d.status }, maps, d.status === "posted");
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(accDocuments).where(and(eq(accDocuments.id, docId), eq(accDocuments.businessId, biz.id)));
    if (!cur) throw new HttpError(404, "سند پیدا نشد");
    if (cur.status !== "draft") throw new HttpError(400, "سند قطعی قابل ویرایش نیست؛ از «برگشت سند» استفاده کنید");
    const y = await yearFor(biz.id, d.date);
    if (y!.isClosed) throw new HttpError(400, `${y!.title} بسته شده است`);
    let number = cur.number;
    if (y!.id !== cur.fiscalYearId) {
      const [m] = await tx.select({ n: sql<number>`coalesce(max(${accDocuments.number}),0)::int` }).from(accDocuments).where(and(eq(accDocuments.businessId, biz.id), eq(accDocuments.fiscalYearId, y!.id)));
      number = m.n + 1;
    }
    await tx.delete(accLines).where(eq(accLines.documentId, docId));
    await tx.insert(accLines).values(prepared.lines.map((l) => ({ ...l, documentId: docId, businessId: biz.id })));
    const [row] = await tx.update(accDocuments).set({ date: d.date, kind: d.kind ?? "general", description: d.description ?? "", status: d.status ?? "draft", fiscalYearId: y!.id, number, totalAmount: prepared.total }).where(eq(accDocuments.id, docId)).returning();
    return row;
  });
}

export async function reverseDocument(biz: Biz, docId: number, by: string, date = new Date()) {
  const [doc] = await db.select().from(accDocuments).where(and(eq(accDocuments.id, docId), eq(accDocuments.businessId, biz.id)));
  if (!doc) throw new HttpError(404, "سند پیدا نشد");
  if (doc.status !== "posted") throw new HttpError(400, "فقط سند قطعی قابل برگشت است");
  if (doc.reversed) throw new HttpError(400, "این سند قبلاً برگشت خورده است");
  if (doc.reversedOf) throw new HttpError(400, "سند برگشتی را نمی‌توان دوباره برگشت زد");
  if (doc.kind === "closing") throw new HttpError(400, "سند اختتامیه قابل برگشت نیست");
  const lines = await db.select().from(accLines).where(eq(accLines.documentId, doc.id));
  const created = await postDocument(biz, {
    date, kind: "general", source: "reversal", reversedOf: doc.id, createdBy: by,
    description: `برگشت سند شماره ${doc.number} (${fmtJ(doc.date)}) — ${doc.description}`,
    lines: lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit, description: l.description })),
  });
  await db.update(accDocuments).set({ reversed: true }).where(eq(accDocuments.id, doc.id));
  return created;
}

/* --------------------------------------------------------- balances & rollup */
export type Bal = Map<number, { d: number; c: number }>;
export async function balances(bizId: number, o: { yearId?: number; from?: Date; to?: Date; before?: Date; kinds?: string[]; excludeKinds?: string[]; status?: string }): Promise<Bal> {
  const conds = [eq(accDocuments.businessId, bizId), eq(accDocuments.status, o.status ?? "posted")];
  if (o.yearId) conds.push(eq(accDocuments.fiscalYearId, o.yearId));
  if (o.from) conds.push(gte(accDocuments.date, o.from));
  if (o.to) conds.push(lte(accDocuments.date, o.to));
  if (o.before) conds.push(sql`${accDocuments.date} < ${o.before}`);
  if (o.kinds?.length) conds.push(inArray(accDocuments.kind, o.kinds));
  if (o.excludeKinds?.length) conds.push(sql`${accDocuments.kind} not in (${sql.join(o.excludeKinds.map((k) => sql`${k}`), sql`, `)})`);
  const rows = await db
    .select({ id: accLines.accountId, d: sql<number>`sum(${accLines.debit})::float8`, c: sql<number>`sum(${accLines.credit})::float8` })
    .from(accLines).innerJoin(accDocuments, eq(accDocuments.id, accLines.documentId)).where(and(...conds)).groupBy(accLines.accountId);
  return new Map(rows.map((r) => [r.id, { d: Number(r.d), c: Number(r.c) }]));
}

export const chainOf = (a: Acc, byId: Map<number, Acc>) => {
  const out: Acc[] = [];
  let cur: Acc | undefined = a;
  while (cur) { out.push(cur); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
  return out;
};

export async function trial(biz: Biz, o: { yearId: number; from?: Date; to?: Date; level: string; includeClosing: boolean; all?: boolean }) {
  const { all, byId } = await codeMap(biz.id);
  const bal = await balances(biz.id, { yearId: o.yearId, from: o.from, to: o.to, excludeKinds: o.includeClosing ? [] : ["closing"] });
  const sums = new Map<number, { d: number; c: number }>();
  for (const [id, v] of bal) {
    const a = byId.get(id);
    if (!a) continue;
    for (const anc of chainOf(a, byId)) {
      if (anc.level !== o.level) continue;
      const s = sums.get(anc.id) ?? { d: 0, c: 0 };
      s.d += v.d; s.c += v.c; sums.set(anc.id, s);
    }
  }
  const rows = all
    .filter((a) => a.level === o.level && (o.all || sums.has(a.id)))
    .map((a) => {
      const s = sums.get(a.id) ?? { d: 0, c: 0 };
      const net = s.d - s.c;
      const parent = a.parentId ? byId.get(a.parentId) : null;
      return { id: a.id, code: a.code, name: a.name, parent: parent ? `${parent.code} ${parent.name}` : "", debit: s.d, credit: s.c, balDebit: net > 0 ? net : 0, balCredit: net < 0 ? -net : 0 };
    });
  const tot = rows.reduce((t, r) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit, balDebit: t.balDebit + r.balDebit, balCredit: t.balCredit + r.balCredit }), { debit: 0, credit: 0, balDebit: 0, balCredit: 0 });
  return { rows, totals: tot };
}

export async function ledger(biz: Biz, o: { accountId: number; yearId: number; from?: Date; to?: Date; includeClosing: boolean }) {
  const { all, byId } = await codeMap(biz.id);
  const acc = byId.get(o.accountId);
  if (!acc) throw new HttpError(404, "حساب پیدا نشد");
  const ids = all.filter((a) => chainOf(a, byId).some((x) => x.id === acc.id)).map((a) => a.id);
  const excl = o.includeClosing ? [] : ["closing"];
  let opening = 0;
  if (o.from) {
    const b = await balances(biz.id, { yearId: o.yearId, before: o.from, excludeKinds: excl });
    for (const id of ids) { const v = b.get(id); if (v) opening += v.d - v.c; }
  }
  const conds = [eq(accDocuments.businessId, biz.id), eq(accDocuments.status, "posted"), eq(accDocuments.fiscalYearId, o.yearId), inArray(accLines.accountId, ids)];
  if (o.from) conds.push(gte(accDocuments.date, o.from));
  if (o.to) conds.push(lte(accDocuments.date, o.to));
  if (excl.length) conds.push(ne(accDocuments.kind, "closing"));
  const rows = await db
    .select({ l: accLines, doc: accDocuments })
    .from(accLines).innerJoin(accDocuments, eq(accDocuments.id, accLines.documentId)).where(and(...conds)).orderBy(asc(accDocuments.date), asc(accDocuments.number), asc(accLines.id)).limit(3000);
  let run = opening;
  const lines = rows.map((r) => {
    run += r.l.debit - r.l.credit;
    const a = byId.get(r.l.accountId)!;
    return { id: r.l.id, docId: r.doc.id, docNumber: r.doc.number, date: r.doc.date, kind: r.doc.kind, description: r.l.description || r.doc.description, accountCode: a.code, accountName: a.name, debit: r.l.debit, credit: r.l.credit, balance: run };
  });
  return { account: { id: acc.id, code: acc.code, name: acc.name, level: acc.level }, opening, lines, closing: run, totals: { debit: lines.reduce((s, l) => s + l.debit, 0), credit: lines.reduce((s, l) => s + l.credit, 0) } };
}

export async function journal(biz: Biz, o: { yearId: number; from?: Date; to?: Date; includeClosing: boolean }) {
  const { byId } = await codeMap(biz.id);
  const conds = [eq(accDocuments.businessId, biz.id), eq(accDocuments.status, "posted"), eq(accDocuments.fiscalYearId, o.yearId)];
  if (o.from) conds.push(gte(accDocuments.date, o.from));
  if (o.to) conds.push(lte(accDocuments.date, o.to));
  if (!o.includeClosing) conds.push(ne(accDocuments.kind, "closing"));
  const docs = await db.select().from(accDocuments).where(and(...conds)).orderBy(asc(accDocuments.date), asc(accDocuments.number)).limit(400);
  const lines = docs.length ? await db.select().from(accLines).where(inArray(accLines.documentId, docs.map((d) => d.id))).orderBy(asc(accLines.id)) : [];
  return docs.map((d) => ({
    ...d,
    lines: lines.filter((l) => l.documentId === d.id).map((l) => {
      const a = byId.get(l.accountId)!;
      const chain = chainOf(a, byId);
      return { ...l, code: a.code, name: a.name, kol: chain.find((x) => x.level === "kol")?.name ?? "", moein: chain.find((x) => x.level === "moein")?.name ?? "" };
    }),
  }));
}

export async function statements(biz: Biz, o: { yearId: number; from?: Date; to?: Date; closed: boolean }) {
  const { all, byId } = await codeMap(biz.id);
  const excl = o.closed ? [] : ["closing"];
  const bal = await balances(biz.id, { yearId: o.yearId, from: o.from, to: o.to, excludeKinds: excl });
  const moeins = all.filter((a) => a.level === "moein");
  const sums = new Map<number, { d: number; c: number }>();
  for (const [id, v] of bal) {
    const a = byId.get(id);
    if (!a) continue;
    const m = chainOf(a, byId).find((x) => x.level === "moein");
    if (!m) continue;
    const s = sums.get(m.id) ?? { d: 0, c: 0 };
    s.d += v.d; s.c += v.c; sums.set(m.id, s);
  }
  // signed by group so contra accounts (accumulated depreciation, discounts, draws) reduce their group
  const val = (a: Acc) => { const s = sums.get(a.id) ?? { d: 0, c: 0 }; return a.type === "asset" || a.type === "expense" ? s.d - s.c : s.c - s.d; };
  const pick = (pred: (a: Acc) => boolean) => moeins.filter(pred).map((a) => ({ code: a.code, name: a.name, amount: val(a) })).filter((r) => r.amount !== 0);
  const rev = pick((a) => a.code.startsWith("41"));
  const cogs = pick((a) => a.code.startsWith("51"));
  const opex = pick((a) => a.code.startsWith("61"));
  const other = pick((a) => a.code.startsWith("42"));
  const sum = (r: { amount: number }[]) => r.reduce((s, x) => s + x.amount, 0);
  const gross = sum(rev) - sum(cogs);
  const operating = gross - sum(opex);
  const net = operating + sum(other);
  const assetsR = pick((a) => a.type === "asset");
  const liab = pick((a) => a.type === "liability");
  const equity = pick((a) => a.type === "equity" && a.code !== C.SUMMARY);
  const summary = moeins.find((a) => a.code === C.SUMMARY);
  const currentProfit = o.closed ? 0 : net;
  const equityRows = [...equity, ...(currentProfit !== 0 ? [{ code: "—", name: "سود (زیان) دوره جاری", amount: currentProfit }] : []), ...(summary && val(summary) ? [{ code: summary.code, name: summary.name, amount: val(summary) }] : [])];
  return {
    income: { revenue: rev, cogs, expenses: opex, other, totals: { revenue: sum(rev), cogs: sum(cogs), gross, expenses: sum(opex), operating, other: sum(other), net } },
    balance: { assets: assetsR, liabilities: liab, equity: equityRows, totals: { assets: sum(assetsR), liabilities: sum(liab), equity: sum(equityRows) } },
  };
}

/* -------------------------------------------------------------- close year */
export async function closeFiscalYear(biz: Biz, yearId: number, by: string) {
  await ensureAccounting(biz);
  const [y] = await db.select().from(accFiscalYears).where(and(eq(accFiscalYears.id, yearId), eq(accFiscalYears.businessId, biz.id)));
  if (!y) throw new HttpError(404, "سال مالی پیدا نشد");
  if (y.isClosed) throw new HttpError(400, "این سال مالی قبلاً بسته شده است");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(accDocuments).where(and(eq(accDocuments.fiscalYearId, y.id), eq(accDocuments.status, "draft")));
  if (n > 0) throw new HttpError(400, `${n} سند پیش‌نویس در این سال وجود دارد؛ ابتدا آن‌ها را قطعی یا حذف کنید`);
  const maps = await codeMap(biz.id);
  const bal = await balances(biz.id, { yearId: y.id });
  const net = (id: number) => { const v = bal.get(id); return v ? v.d - v.c : 0; };
  const temp = maps.all.filter((a) => a.level !== "kol" && ["revenue", "expense"].includes(a.type) && net(a.id) !== 0);
  const summary = maps.byCode.get(C.SUMMARY)!, retained = maps.byCode.get(C.RETAINED)!;
  const endDate = new Date(y.endDate);
  const tempLines: LineIn[] = [];
  let tempNet = 0;
  for (const a of temp) {
    const v = net(a.id);
    tempNet += v;
    tempLines.push(v > 0 ? { accountId: a.id, credit: v, description: "بستن حساب موقت" } : { accountId: a.id, debit: -v, description: "بستن حساب موقت" });
  }
  // after closing, P&L summary holds the net (credit if profit)
  if (tempNet !== 0) tempLines.push(tempNet > 0 ? { accountId: summary.id, debit: tempNet, description: "انتقال زیان به خلاصه سود و زیان" } : { accountId: summary.id, credit: -tempNet, description: "انتقال سود به خلاصه سود و زیان" });
  const toRetained: LineIn[] = tempNet === 0 ? [] : tempNet > 0
    ? [{ accountId: retained.id, debit: tempNet, description: "انتقال زیان به سود (زیان) انباشته" }, { accountId: summary.id, credit: tempNet, description: "بستن خلاصه سود و زیان" }]
    : [{ accountId: summary.id, debit: -tempNet, description: "بستن خلاصه سود و زیان" }, { accountId: retained.id, credit: -tempNet, description: "انتقال سود به سود (زیان) انباشته" }];

  // permanent balances after the temporary close
  const perm = new Map<number, number>();
  for (const a of maps.all) if (a.level !== "kol" && !["revenue", "expense"].includes(a.type)) perm.set(a.id, net(a.id));
  if (tempNet !== 0) perm.set(retained.id, (perm.get(retained.id) ?? 0) + (tempNet > 0 ? tempNet : tempNet));
  const closeLines: LineIn[] = [];
  const openLines: LineIn[] = [];
  for (const [id, v] of perm) {
    if (v === 0) continue;
    closeLines.push(v > 0 ? { accountId: id, credit: v, description: "بستن حساب دائم" } : { accountId: id, debit: -v, description: "بستن حساب دائم" });
    openLines.push(v > 0 ? { accountId: id, debit: v, description: "مانده ابتدای دوره" } : { accountId: id, credit: -v, description: "مانده ابتدای دوره" });
  }
  const docs: DocIn[] = [];
  if (tempLines.length) docs.push({ date: endDate, kind: "closing", source: "system", description: `بستن حساب‌های موقت و انتقال سود و زیان — ${y.title}`, lines: [...tempLines, ...toRetained], createdBy: by });
  if (closeLines.length) docs.push({ date: endDate, kind: "closing", source: "system", description: `سند اختتامیه — ${y.title}`, lines: closeLines, createdBy: by });
  const jy = toJ(endDate).jy + 1;
  const range = jYearRange(jy);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${biz.id})`);
    const prepared: Awaited<ReturnType<typeof prepare>>[] = [];
    for (const d of docs) prepared.push(await prepare(biz.id, d, maps));
    await insertDocs(tx as unknown as Q, biz.id, prepared, { allowClosed: true });
    let next = (await tx.select().from(accFiscalYears).where(and(eq(accFiscalYears.businessId, biz.id), eq(accFiscalYears.startDate, range.start))))[0];
    if (!next) [next] = await tx.insert(accFiscalYears).values({ businessId: biz.id, title: `سال مالی ${jy}`, startDate: range.start, endDate: range.end }).returning();
    if (openLines.length) await insertDocs(tx as unknown as Q, biz.id, [await prepare(biz.id, { date: range.start, kind: "opening", source: "system", description: `سند افتتاحیه — ${next.title}`, lines: openLines, createdBy: by }, maps)]);
    await tx.update(accFiscalYears).set({ isClosed: true }).where(eq(accFiscalYears.id, y.id));
    return { closedYear: y.title, nextYear: next.title, profit: -tempNet };
  });
}

/* --------------------------------------------------------- automatic posting */
type OrderRow = typeof orders.$inferSelect;
async function payAccount(biz: Biz, method: string | null) {
  const { byCode } = await codeMap(biz.id);
  if (!method || method === "cash") return byCode.get(C.CASH)!.id;
  if (method === "cashback") return byCode.get(C.CB_LIAB)!.id;
  return bankDetailId(biz, null);
}

export type OrderTenderLine = { accountId: number; amount: number; description: string };

export function orderDocLines(o: OrderRow, payId: number, ids: Map<string, number>, cogs: number, earned: number, tenderLines?: OrderTenderLine[]): LineIn[] {
  const L: LineIn[] = [];
  const dr = (code: string, v: number, d = "") => v > 0 && L.push({ accountId: ids.get(code), debit: v, description: d });
  const cr = (code: string, v: number, d = "") => v > 0 && L.push({ accountId: ids.get(code), credit: v, description: d });
  if (tenderLines) {
    for (const line of tenderLines) if (line.amount > 0) L.push({ accountId: line.accountId, debit: line.amount, description: line.description });
  } else if (o.total > 0) L.push({ accountId: payId, debit: o.total, description: `دریافت وجه سفارش #${o.number}` });
  dr(C.CB_LIAB, o.cashbackUsed, "استفاده مشتری از اعتبار کش‌بک");
  dr(C.DISCOUNT, o.discountAmount, o.discountCode ? `کد تخفیف ${o.discountCode}` : "تخفیف");
  cr(C.SALES, o.subtotal, "فروش");
  cr(C.DELIVERY, o.deliveryFee, "هزینه ارسال");
  cr(C.SERVICE, o.service, "هزینه خدمات");
  cr(C.VAT, o.tax, "مالیات بر ارزش افزوده");
  const td = L.reduce((s, l) => s + (l.debit ?? 0), 0), tc = L.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (td !== tc) { // rounding safety: put the difference on sales
    if (td > tc) L.push({ accountId: ids.get(C.SALES), credit: td - tc, description: "گرد کردن" });
    else L.push({ accountId: ids.get(C.DISCOUNT), debit: tc - td, description: "گرد کردن" });
  }
  dr(C.COGS, cogs, "بهای تمام‌شده مواد مصرفی");
  cr(C.INV, cogs, "کسر از موجودی انبار");
  dr(C.CB_EXP, earned, "هزینه کش‌بک");
  cr(C.CB_LIAB, earned, "اعتبار کش‌بک مشتری");
  return L;
}

export async function postOrderSale(biz: Biz, o: OrderRow, cogs: number, earned: number) {
  await ensureAccounting(biz);
  const { byCode } = await codeMap(biz.id);
  const ids = new Map([...byCode].map(([k, v]) => [k, v.id]));
  return postDocument(biz, {
    date: new Date(), source: "order", sourceRef: `order:${o.id}`, description: `فروش سفارش #${o.number}${o.customerName ? ` — ${o.customerName}` : ""}`,
    lines: orderDocLines(o, await payAccount(biz, o.paymentMethod), ids, cogs, earned),
  });
}

/** Post an order sale using the caller's transaction so a failed journal rolls back settlement. */
export async function postOrderSaleInTransaction(txInput: Q, biz: Biz, o: OrderRow, cogs: number, earned: number, receivable = false, settlement?: {
  cashAmount: number; bankAmount: number; bankAccountId: number | null;
  posAmount: number; posDeviceId: number | null; posBankAccountId: number | null; posRefNo?: string; creditAmount: number;
}) {
  const tx = txInput as Q;
  await tx.execute(sql`select pg_advisory_xact_lock(${biz.id})`);
  const all = await tx.select().from(accAccounts).where(eq(accAccounts.businessId, biz.id));
  const byCode = new Map(all.map((a) => [a.code, a]));
  const ids = new Map(all.map((a) => [a.code, a.id]));
  let payId = byCode.get(receivable ? C.AR : C.CASH)!.id;
  if (!receivable && o.paymentMethod === "cashback") payId = byCode.get(C.CB_LIAB)!.id;
  else if (!receivable && o.paymentMethod && o.paymentMethod !== "cash") {
    const [bank] = await tx.select({ id: bankAccounts.id }).from(bankAccounts)
      .where(eq(bankAccounts.businessId, biz.id)).orderBy(asc(bankAccounts.id)).limit(1);
    if (bank) {
      let detail = all.find((a) => a.refType === "bank" && a.refId === bank.id);
      if (!detail) {
        const parent = byCode.get(C.BANK)!;
        const seq = all.filter((a) => a.parentId === parent.id).length + 1;
        [detail] = await tx.insert(accAccounts).values({
          businessId: biz.id, code: `${C.BANK}${String(seq).padStart(2, "0")}`, name: `بانک — ${(await tx.select({ name: bankAccounts.name }).from(bankAccounts).where(eq(bankAccounts.id, bank.id)))[0]?.name ?? "حساب"}`,
          level: "tafsili", parentId: parent.id, type: "asset", nature: "debit", refType: "bank", refId: bank.id, isSystem: true,
        }).returning();
      }
      payId = detail.id;
    }
  }
  let tenderLines: OrderTenderLine[] | undefined;
  if (settlement) {
    tenderLines = [];
    const cashId = byCode.get(C.CASH)!.id;
    if (settlement.cashAmount > 0) tenderLines.push({ accountId: cashId, amount: settlement.cashAmount, description: `دریافت نقدی سفارش #${o.number}` });
    if (settlement.bankAmount > 0) {
      const [bank] = await tx.select().from(bankAccounts).where(and(eq(bankAccounts.id, settlement.bankAccountId ?? 0), eq(bankAccounts.businessId, biz.id)));
      if (!bank) throw new HttpError(400, "حساب بانکی دریافت معتبر نیست");
      let detail = all.find((a) => a.refType === "bank" && a.refId === bank.id);
      if (!detail) {
        const parent = byCode.get(C.BANK)!;
        const seq = all.filter((a) => a.parentId === parent.id).length + 1;
        [detail] = await tx.insert(accAccounts).values({
          businessId: biz.id, code: `${C.BANK}${String(seq).padStart(2, "0")}`, name: `بانک — ${bank.name}`,
          level: "tafsili", parentId: parent.id, type: "asset", nature: "debit", refType: "bank", refId: bank.id, isSystem: true,
        }).returning();
        all.push(detail);
      }
      tenderLines.push({ accountId: detail.id, amount: settlement.bankAmount, description: `دریافت بانکی سفارش #${o.number} — ${bank.name}` });
    }
    if (settlement.posAmount > 0) {
      const [device] = await tx.select().from(devices).where(and(eq(devices.id, settlement.posDeviceId ?? 0), eq(devices.businessId, biz.id), eq(devices.kind, "pos")));
      if (!device) throw new HttpError(400, "دستگاه کارتخوان انتخاب‌شده معتبر نیست");
      const [posBank] = await tx.select().from(bankAccounts).where(and(eq(bankAccounts.id, settlement.posBankAccountId ?? 0), eq(bankAccounts.businessId, biz.id)));
      if (!posBank) throw new HttpError(400, "حساب بانکی متصل به کارتخوان معتبر نیست");
      let detail = all.find((a) => a.refType === "pos" && a.refId === device.id);
      if (!detail) {
        const parent = byCode.get(C.BANK)!;
        const seq = all.filter((a) => a.parentId === parent.id).length + 1;
        [detail] = await tx.insert(accAccounts).values({
          businessId: biz.id, code: `${C.BANK}${String(seq).padStart(2, "0")}`, name: `کارتخوان — ${device.name}${device.terminalNumber ? ` (شماره ${device.terminalNumber})` : ""} · ${posBank.name}`,
          level: "tafsili", parentId: parent.id, type: "asset", nature: "debit", refType: "pos", refId: device.id, isSystem: true,
        }).returning();
        all.push(detail);
      }
      tenderLines.push({ accountId: detail.id, amount: settlement.posAmount, description: `دریافت کارتخوان سفارش #${o.number} — ${device.name}${device.terminalNumber ? ` (شماره ${device.terminalNumber})` : ""} · ${posBank.name}${settlement.posRefNo ? ` · پیگیری ${settlement.posRefNo}` : ""}` });
    }
    if (settlement.creditAmount > 0) tenderLines.push({ accountId: byCode.get(C.AR)!.id, amount: settlement.creditAmount, description: `مانده در دفتر بدهکاران سفارش #${o.number}` });
  }
  return postDocumentInTransaction(tx, biz, {
    date: new Date(), source: "order", sourceRef: `order:${o.id}`,
    description: `فروش سفارش #${o.number}${o.customerName ? ` — ${o.customerName}` : ""}`,
    lines: orderDocLines(o, payId, ids, cogs, earned, tenderLines),
  });
}

export async function postInventoryMovement(biz: Biz, m: { id: number; type: string; delta: number; amount: number; note: string; payFrom?: string; supplierAccountId?: number }) {
  if (m.amount <= 0) return;
  await ensureAccounting(biz);
  const label = { in: "خرید مواد اولیه", out: "مصرف انبار", waste: "ضایعات انبار", adjust: "تعدیل موجودی" }[m.type] ?? "گردش انبار";
  let lines: LineIn[];
  if (m.type === "in") {
    const cr = m.payFrom === "bank" ? await bankDetailId(biz, null) : null;
    const payable = m.payFrom === "payable";
    lines = [{ code: C.INV, debit: m.amount }, cr ? { accountId: cr, credit: m.amount } : payable ? (m.supplierAccountId ? { accountId: m.supplierAccountId, credit: m.amount } : { code: C.AP, credit: m.amount }) : { code: C.CASH, credit: m.amount }];
  } else if (m.type === "adjust" && m.delta > 0) lines = [{ code: C.INV, debit: m.amount }, { code: C.STOCK_GAIN, credit: m.amount }];
  else lines = [{ code: C.WASTE, debit: m.amount }, { code: C.INV, credit: m.amount }];
  await postDocument(biz, { date: new Date(), source: "inventory", sourceRef: `mv:${m.id}`, description: `${label} — ${m.note}`.slice(0, 200), lines });
}

const EXPENSE_MAP: [RegExp, string][] = [
  [/اجاره/, C.RENT], [/حقوق|دستمزد|پرسنل/, C.PAY_EXP], [/قبض|برق|آب|گاز|تلفن/, C.UTIL], [/بازاریابی|تبلیغ/, C.MKT],
  [/تعمیر|نگهداری/, C.REPAIR], [/اینترنت|نرم‌افزار|نرم افزار|سامانه/, C.SOFT], [/مواد|خرید/, C.INV],
];
export async function postManualTx(biz: Biz, t: { id: number; kind: string; category: string; amount: number; description: string; bankAccountId: number | null; accountMoeinId?: number | null; accountTafsiliId?: number | null; date: Date }) {
  await ensureAccounting(biz);
  const maps = await codeMap(biz.id);
  const moneyId = t.bankAccountId ? await bankDetailId(biz, t.bankAccountId) : maps.byCode.get(C.CASH)!.id;
  const code = t.kind === "income" ? C.OTHER_INC : (EXPENSE_MAP.find(([re]) => re.test(t.category))?.[1] ?? C.OTHER_EXP);
  const selectedMoein = t.accountMoeinId ? maps.byId.get(t.accountMoeinId) : undefined;
  const selectedTafsili = t.accountTafsiliId ? maps.byId.get(t.accountTafsiliId) : undefined;
  let categoryAccountId: number;
  if (selectedMoein) {
    const accountType = t.kind === "income" ? "revenue" : "expense";
    const nature = t.kind === "income" ? "credit" : "debit";
    if (selectedMoein.level !== "moein" || selectedMoein.type !== accountType || selectedMoein.nature !== nature) throw new HttpError(400, "حساب معین با ماهیت این درآمد یا هزینه سازگار نیست");
    if (selectedTafsili && (selectedTafsili.level !== "tafsili" || selectedTafsili.parentId !== selectedMoein.id || selectedTafsili.type !== accountType || selectedTafsili.nature !== nature)) throw new HttpError(400, "حساب تفصیلی با حساب معین و ماهیت این ردیف سازگار نیست");
    categoryAccountId = selectedTafsili?.id ?? selectedMoein.id;
  } else {
    categoryAccountId = maps.byCode.get(code)!.id;
  }
  const desc = `${t.kind === "income" ? "درآمد" : "هزینه"}: ${t.category || t.description}`.slice(0, 200);
  await postDocument(biz, {
    date: t.date, source: "expense", sourceRef: `tx:${t.id}`, description: desc,
    lines: t.kind === "income" ? [{ accountId: moneyId, debit: t.amount }, { accountId: categoryAccountId, credit: t.amount }] : [{ accountId: categoryAccountId, debit: t.amount }, { accountId: moneyId, credit: t.amount }],
  });
}
export async function unpostManualTx(biz: Biz, txId: number) {
  const [d] = await db.select().from(accDocuments).where(and(eq(accDocuments.businessId, biz.id), eq(accDocuments.sourceRef, `tx:${txId}`)));
  if (!d) return;
  const y = await db.select().from(accFiscalYears).where(eq(accFiscalYears.id, d.fiscalYearId));
  if (y[0]?.isClosed) return;
  await db.delete(accDocuments).where(eq(accDocuments.id, d.id));
}

export const assetDep = (a: { purchaseDate: Date | string; cost: number; salvage: number; lifeMonths: number }, at = new Date()) => {
  const months = Math.max(0, Math.floor((at.getTime() - new Date(a.purchaseDate).getTime()) / (30.44 * 86400_000)));
  const base = Math.max(0, a.cost - a.salvage);
  const monthly = base / Math.max(1, a.lifeMonths);
  return { monthly: Math.round(monthly), accumulated: Math.min(base, Math.round(monthly * months)) };
};

export async function postDepreciation(biz: Biz, by: string, at = new Date()) {
  await ensureAccounting(biz);
  const list = await db.select().from(assets).where(eq(assets.businessId, biz.id));
  const total = list.reduce((s, a) => s + (assetDep(a, at).accumulated < Math.max(0, a.cost - a.salvage) ? assetDep(a).monthly : 0), 0);
  if (total <= 0) throw new HttpError(400, "دارایی مشمول استهلاک وجود ندارد");
  const { jy, jm } = toJ(at);
  const r = jMonthRange(jy, jm);
  const ref = `dep:${jy}-${jm}`;
  const [ex] = await db.select().from(accDocuments).where(and(eq(accDocuments.businessId, biz.id), eq(accDocuments.sourceRef, ref)));
  if (ex) throw new HttpError(400, "استهلاک این ماه قبلاً ثبت شده است");
  return postDocument(biz, { date: r.end > at ? at : r.end, source: "system", sourceRef: ref, createdBy: by, description: `ثبت استهلاک ماهانه دارایی‌ها (${jy}/${jm})`, lines: [{ code: C.DEP_EXP, debit: total }, { code: C.ACC_DEP, credit: total }] });
}

/* ------------------------------------------------------------------ backfill */
export async function cogsForOrders(bizId: number, ids: number[]) {
  if (!ids.length) return new Map<number, number>();
  const res: any = await db.execute(sql`
    select oi.order_id as oid, sum(oi.quantity * (case when oi.weight_grams is null then 1 else oi.weight_grams::float8 / 1000 / oi.yield_ratio_snapshot end) * r.quantity * ii.recipe_to_stock_factor * (1 + r.waste_percent / 100.0) * ii.cost_per_unit)::float8 as cogs
    from order_items oi join recipes r on r.product_id = oi.product_id join inventory_items ii on ii.id = r.item_id
    where oi.order_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) and ii.track_stock = true group by oi.order_id`);
  return new Map<number, number>(res.rows.map((r: any) => [Number(r.oid), Math.round(Number(r.cogs))]));
}

/** Build documents from data that existed before accounting was initialised (orders, manual transactions, opening balances). */
export async function backfill(biz: Biz) {
  const paid = await db.select().from(orders).where(and(eq(orders.businessId, biz.id), eq(orders.paymentStatus, "paid")));
  const txs = await db.select().from(transactions).where(and(eq(transactions.businessId, biz.id), ne(transactions.source, "sale")));
  const banks = await db.select().from(bankAccounts).where(eq(bankAccounts.businessId, biz.id)).orderBy(asc(bankAccounts.id));
  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.businessId, biz.id));
  const fixed = await db.select().from(assets).where(eq(assets.businessId, biz.id));
  if (!paid.length && !txs.length && !banks.length && !items.length && !fixed.length) return;

  const bankIds = new Map<number, number>();
  for (const b of banks) bankIds.set(b.id, await bankDetailId(biz, b.id));
  const maps = await codeMap(biz.id); // reload: bank detail accounts were just created
  const ids = new Map([...maps.byCode].map(([k, v]) => [k, v.id]));
  const primaryBank = banks[0] ? bankIds.get(banks[0].id)! : ids.get(C.BANK)!;
  const cogsMap = await cogsForOrders(biz.id, paid.map((o) => o.id));
  const docs: DocIn[] = [];
  for (const o of paid) {
    const cg = cogsMap.get(o.id) ?? 0;
    const pay = !o.paymentMethod || o.paymentMethod === "cash" ? ids.get(C.CASH)! : o.paymentMethod === "cashback" ? ids.get(C.CB_LIAB)! : primaryBank;
    docs.push({ date: o.createdAt, source: "order", sourceRef: `order:${o.id}`, description: `فروش سفارش #${o.number}${o.customerName ? ` — ${o.customerName}` : ""}`, lines: orderDocLines(o, pay, ids, cg, o.cashbackEarned), createdBy: "سیستم" });
    if (cg && o.cogs === 0) await db.update(orders).set({ cogs: cg }).where(eq(orders.id, o.id));
  }
  for (const t of txs) {
    const money = t.bankAccountId ? (bankIds.get(t.bankAccountId) ?? ids.get(C.CASH)!) : ids.get(C.CASH)!;
    const code = t.kind === "income" ? C.OTHER_INC : (EXPENSE_MAP.find(([re]) => re.test(t.category))?.[1] ?? C.OTHER_EXP);
    docs.push({ date: t.date, source: "expense", sourceRef: `tx:${t.id}`, description: `${t.kind === "income" ? "درآمد" : "هزینه"}: ${t.category || t.description}`.slice(0, 200), createdBy: "سیستم", lines: t.kind === "income" ? [{ accountId: money, debit: t.amount }, { code, credit: t.amount }] : [{ code, debit: t.amount }, { accountId: money, credit: t.amount }] });
  }
  docs.sort((a, b) => a.date.getTime() - b.date.getTime());

  // opening document so that books start from today's real balances
  const flow = new Map<number, number>();
  for (const d of docs) for (const l of d.lines) { const id = l.accountId ?? ids.get(l.code!)!; flow.set(id, (flow.get(id) ?? 0) + (l.debit ?? 0) - (l.credit ?? 0)); }
  const f = (code: string) => flow.get(ids.get(code)!) ?? 0;
  const stockValue = items.reduce((s, i) => s + Math.max(0, i.stock) * i.costPerUnit, 0);
  const open: LineIn[] = [];
  const dr = (accountId: number, v: number, d: string) => v > 0 && open.push({ accountId, debit: Math.round(v), description: d });
  dr(ids.get(C.CASH)!, Math.max(0, -f(C.CASH)) + 10_000_000, "موجودی نقد ابتدای دوره");
  for (const [i, b] of banks.entries()) dr(bankIds.get(b.id)!, i === 0 ? Math.max(b.openingBalance, -(flow.get(bankIds.get(b.id)!) ?? 0) + 20_000_000) : Math.max(0, b.openingBalance), `موجودی ${b.name}`);
  dr(ids.get(C.INV)!, Math.max(0, stockValue - f(C.INV)), "موجودی انبار");
  let fixedEq = 0, fixedFur = 0, accDep = 0;
  for (const a of fixed) { if (a.category.includes("اثاثیه")) fixedFur += a.cost; else fixedEq += a.cost; accDep += assetDep(a).accumulated; }
  dr(ids.get(C.FA_EQ)!, fixedEq, "تجهیزات"); dr(ids.get(C.FA_FUR)!, fixedFur, "اثاثیه");
  if (accDep > 0) open.push({ accountId: ids.get(C.ACC_DEP)!, credit: Math.round(accDep), description: "استهلاک انباشته" });
  const td = open.reduce((s, l) => s + (l.debit ?? 0), 0), tc = open.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (td > tc) open.push({ accountId: ids.get(C.CAPITAL)!, credit: td - tc, description: "سرمایه اولیه" });
  const first = docs[0]?.date ?? new Date();
  const jy = toJ(first).jy;
  const start = jYearRange(jy).start;
  if (open.length > 1) docs.unshift({ date: start, kind: "opening", source: "system", description: "سند افتتاحیه — مانده‌های ابتدای دوره", lines: open, createdBy: "سیستم" });
  if (!docs.length) return;

  const prepared: Awaited<ReturnType<typeof prepare>>[] = [];
  for (const d of docs) prepared.push(await prepare(biz.id, d, maps));
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${biz.id})`);
    const [ex] = await tx.select({ n: sql<number>`count(*)::int` }).from(accDocuments).where(eq(accDocuments.businessId, biz.id));
    if (ex.n > 0) return; // someone already posted
    await insertDocs(tx as unknown as Q, biz.id, prepared);
  });
}
void desc; void fromJ; void jl;


/* ------------------------------------------------------------------ suppliers */
/** One tafsili account (under «حساب‌های پرداختنی» 2101) per supplier: its balance is what we owe that supplier. */
export async function ensureSupplierAccount(biz: Biz, name: string) {
  await ensureAccounting(biz);
  const { all, byCode } = await codeMap(biz.id);
  const parent = byCode.get(C.AP)!;
  const kids = all.filter((a) => a.parentId === parent.id).map((a) => Number(a.code)).filter(Number.isFinite);
  const code = String(kids.length ? Math.max(...kids) + 1 : Number(`${C.AP}01`));
  const [row] = await db.insert(accAccounts).values({ businessId: biz.id, code, name: `تأمین‌کننده — ${name}`.slice(0, 100), level: "tafsili", parentId: parent.id, type: "liability", nature: "credit", refType: "supplier" }).returning();
  return row;
}

/** debit = payments made, credit = purchases on credit; balance (credit − debit) = amount still owed */
export async function accountTotals(bizId: number, accountIds: number[]) {
  if (!accountIds.length) return new Map<number, { d: number; c: number }>();
  const res: any = await db.execute(sql`
    select l.account_id as id, coalesce(sum(l.debit),0)::float8 as d, coalesce(sum(l.credit),0)::float8 as c
    from acc_lines l join acc_documents d on d.id = l.document_id
    where d.business_id = ${bizId} and d.status = 'posted' and d.kind <> 'closing' and not (d.kind = 'opening' and d.source = 'system')
      and l.account_id in (${sql.join(accountIds.map((i) => sql`${i}`), sql`, `)})
    group by l.account_id`);
  return new Map<number, { d: number; c: number }>(res.rows.map((r: any) => [Number(r.id), { d: Number(r.d), c: Number(r.c) }]));
}

export async function accountStatement(bizId: number, accountId: number) {
  const rows = await db
    .select({ l: accLines, d: accDocuments })
    .from(accLines).innerJoin(accDocuments, eq(accDocuments.id, accLines.documentId))
    .where(and(eq(accLines.accountId, accountId), eq(accDocuments.businessId, bizId), eq(accDocuments.status, "posted"), ne(accDocuments.kind, "closing"), sql`not (${accDocuments.kind} = 'opening' and ${accDocuments.source} = 'system')`))
    .orderBy(asc(accDocuments.date), asc(accDocuments.id), asc(accLines.id));
  let run = 0;
  return rows.map((r) => { run += r.l.credit - r.l.debit; return { id: r.l.id, docId: r.d.id, number: r.d.number, date: r.d.date, description: r.l.description || r.d.description, debit: r.l.debit, credit: r.l.credit, balance: run }; });
}

export async function payFromAccountId(biz: Biz, from: string) {
  const { byCode } = await codeMap(biz.id);
  return from === "bank" ? bankDetailId(biz, null) : byCode.get(C.CASH)!.id;
}
