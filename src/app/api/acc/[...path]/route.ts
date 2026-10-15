/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accAccounts, accDocuments, accFiscalYears, accLines } from "@/db/schema";
import * as A from "@/lib/accounting";
import { HttpError, readJson, withAuth, type AuthContext } from "@/lib/auth";
import { jYearRange } from "@/lib/jalali";

export const dynamic = "force-dynamic";
type Ctx = { path: string[] };
const J = (d: unknown, s = 200) => Response.json(d, { status: s });
const dt = (v: string | null) => { if (!v) return undefined; const d = new Date(v); return isNaN(d.getTime()) ? undefined : d; };

async function yearOf(auth: AuthContext, id: string | null) {
  const years = await db.select().from(accFiscalYears).where(eq(accFiscalYears.businessId, auth.business.id)).orderBy(desc(accFiscalYears.startDate));
  const y = (id ? years.find((x) => x.id === Number(id)) : null) ?? years.find((x) => x.startDate <= new Date() && x.endDate >= new Date()) ?? years[0];
  if (!y) throw new HttpError(404, "سال مالی تعریف نشده است");
  return y;
}

async function docDetail(auth: AuthContext, id: number) {
  const [doc] = await db.select().from(accDocuments).where(and(eq(accDocuments.id, id), eq(accDocuments.businessId, auth.business.id)));
  if (!doc) throw new HttpError(404, "سند پیدا نشد");
  const accs = await A.loadAccounts(auth.business.id);
  const byId = new Map(accs.map((a) => [a.id, a]));
  const lines = await db.select().from(accLines).where(eq(accLines.documentId, doc.id)).orderBy(asc(accLines.id));
  const [year] = await db.select().from(accFiscalYears).where(eq(accFiscalYears.id, doc.fiscalYearId));
  return {
    ...doc, yearTitle: year?.title ?? "", yearClosed: !!year?.isClosed,
    lines: lines.map((l) => {
      const a = byId.get(l.accountId)!;
      const chain = A.chainOf(a, byId);
      return { ...l, code: a.code, name: a.name, level: a.level, kol: chain.find((x) => x.level === "kol")?.name ?? "", moein: chain.find((x) => x.level === "moein")?.name ?? "" };
    }),
  };
}

const parseLines = (b: any) => (Array.isArray(b.lines) ? b.lines : []).map((l: any) => ({ accountId: Number(l.accountId), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, description: String(l.description ?? "") }));

async function handle(req: Request, auth: AuthContext, { path }: Ctx) {
  const biz = auth.business;
  await A.ensureAccounting(biz);
  const [res, id, act] = path;
  const m = req.method;
  const url = new URL(req.url);
  const q = url.searchParams;

  if (res === "meta" && m === "GET") {
    const years = await db.select().from(accFiscalYears).where(eq(accFiscalYears.businessId, biz.id)).orderBy(desc(accFiscalYears.startDate));
    const cur = await yearOf(auth, null);
    return J({ years, currentYearId: cur.id });
  }

  if (res === "accounts") {
    if (m === "GET") return J({ items: await A.loadAccounts(biz.id) });
    if (m === "POST") {
      const b = await readJson(req);
      const level = String(b.level);
      const code = String(b.code ?? "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).trim();
      const name = String(b.name ?? "").trim().slice(0, 100);
      if (!/^\d{2,12}$/.test(code) || !name) throw new HttpError(400, "کد (عددی) و نام حساب را وارد کنید");
      if (!["kol", "moein", "tafsili"].includes(level)) throw new HttpError(400, "سطح حساب نامعتبر است");
      let parent = null as null | typeof accAccounts.$inferSelect;
      if (level !== "kol") {
        const [p] = await db.select().from(accAccounts).where(and(eq(accAccounts.id, Number(b.parentId)), eq(accAccounts.businessId, biz.id)));
        if (!p || (level === "moein" && p.level !== "kol") || (level === "tafsili" && p.level !== "moein")) throw new HttpError(400, level === "moein" ? "حساب معین باید زیرمجموعه‌ی یک حساب کل باشد" : "حساب تفصیلی باید زیرمجموعه‌ی یک حساب معین باشد");
        if (!code.startsWith(p.code)) throw new HttpError(400, `کد باید با کد حساب بالاتر (${p.code}) شروع شود`);
        parent = p;
      }
      const type = parent?.type ?? String(b.type);
      if (!["asset", "liability", "equity", "revenue", "expense"].includes(type)) throw new HttpError(400, "نوع حساب نامعتبر است");
      const nature = b.nature === "credit" || b.nature === "debit" ? b.nature : (parent?.nature ?? (["asset", "expense"].includes(type) ? "debit" : "credit"));
      const [row] = await db.insert(accAccounts).values({ businessId: biz.id, code, name, level, parentId: parent?.id ?? null, type, nature }).returning();
      return J({ item: row }, 201);
    }
    if (m === "PATCH" && id) {
      const b = await readJson(req);
      const set: Record<string, unknown> = {};
      if (typeof b.name === "string" && b.name.trim()) set.name = b.name.trim().slice(0, 100);
      if (typeof b.isActive === "boolean") set.isActive = b.isActive;
      if (!Object.keys(set).length) throw new HttpError(400, "تغییری ارسال نشد");
      const [row] = await db.update(accAccounts).set(set).where(and(eq(accAccounts.id, Number(id)), eq(accAccounts.businessId, biz.id))).returning();
      if (!row) throw new HttpError(404, "حساب پیدا نشد");
      return J({ item: row });
    }
    if (m === "DELETE" && id) {
      const [a] = await db.select().from(accAccounts).where(and(eq(accAccounts.id, Number(id)), eq(accAccounts.businessId, biz.id)));
      if (!a) throw new HttpError(404, "حساب پیدا نشد");
      if (a.isSystem) throw new HttpError(400, "حساب‌های سیستمی قابل حذف نیستند (می‌توانید غیرفعال کنید)");
      const [ch] = await db.select({ n: sql<number>`count(*)::int` }).from(accAccounts).where(eq(accAccounts.parentId, a.id));
      const [ln] = await db.select({ n: sql<number>`count(*)::int` }).from(accLines).where(eq(accLines.accountId, a.id));
      if (ch.n || ln.n) throw new HttpError(400, "این حساب زیرمجموعه یا گردش دارد و قابل حذف نیست؛ غیرفعالش کنید");
      await db.delete(accAccounts).where(eq(accAccounts.id, a.id));
      return J({ ok: true });
    }
  }

  if (res === "years") {
    if (m === "GET") return J({ items: await db.select().from(accFiscalYears).where(eq(accFiscalYears.businessId, biz.id)).orderBy(desc(accFiscalYears.startDate)) });
    if (m === "POST" && id && act === "close") return J(await A.closeFiscalYear(biz, Number(id), auth.user.name));
    if (m === "POST") {
      const b = await readJson(req);
      const jy = Math.round(Number(b.year));
      if (!(jy >= 1380 && jy <= 1500)) throw new HttpError(400, "سال شمسی نامعتبر است");
      const r = jYearRange(jy);
      const [ex] = await db.select().from(accFiscalYears).where(and(eq(accFiscalYears.businessId, biz.id), eq(accFiscalYears.startDate, r.start)));
      if (ex) throw new HttpError(400, "این سال مالی قبلاً تعریف شده است");
      const [row] = await db.insert(accFiscalYears).values({ businessId: biz.id, title: `سال مالی ${jy}`, startDate: r.start, endDate: r.end }).returning();
      return J({ item: row }, 201);
    }
  }

  if (res === "documents") {
    if (m === "GET" && !id) {
      const y = await yearOf(auth, q.get("year"));
      const conds = [eq(accDocuments.businessId, biz.id), eq(accDocuments.fiscalYearId, y.id)];
      if (q.get("kind")) conds.push(eq(accDocuments.kind, q.get("kind")!));
      if (q.get("source")) conds.push(eq(accDocuments.source, q.get("source")!));
      if (q.get("status")) conds.push(eq(accDocuments.status, q.get("status")!));
      const from = dt(q.get("from")), to = dt(q.get("to"));
      if (from) conds.push(gte(accDocuments.date, from));
      if (to) conds.push(lte(accDocuments.date, to));
      const term = (q.get("q") ?? "").trim();
      if (term) {
        const n = Number(term.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
        conds.push(Number.isInteger(n) ? or(eq(accDocuments.number, n), ilike(accDocuments.description, `%${term}%`))! : ilike(accDocuments.description, `%${term}%`));
      }
      const items = await db.select().from(accDocuments).where(and(...conds)).orderBy(desc(accDocuments.date), desc(accDocuments.number)).limit(Math.min(500, Number(q.get("limit")) || 200));
      return J({ items, year: y });
    }
    if (m === "GET" && id) return J({ item: await docDetail(auth, Number(id)) });
    if (m === "POST" && !id) {
      const b = await readJson(req);
      const date = dt(String(b.date ?? ""));
      if (!date) throw new HttpError(400, "تاریخ سند را وارد کنید");
      const kind = ["general", "opening", "closing"].includes(String(b.kind)) ? String(b.kind) : "general";
      const doc = await A.postDocument(biz, { date, kind, source: "manual", description: String(b.description ?? "").slice(0, 300), status: b.status === "draft" ? "draft" : "posted", lines: parseLines(b), createdBy: auth.user.name }, { enforce: b.status !== "draft" });
      return J({ item: doc }, 201);
    }
    if (m === "PATCH" && id && !act) {
      const b = await readJson(req);
      const date = dt(String(b.date ?? ""));
      if (!date) throw new HttpError(400, "تاریخ سند را وارد کنید");
      const kind = ["general", "opening", "closing"].includes(String(b.kind)) ? String(b.kind) : "general";
      return J({ item: await A.replaceDraftLines(biz, Number(id), { date, kind, description: String(b.description ?? "").slice(0, 300), status: b.status === "posted" ? "posted" : "draft", lines: parseLines(b) }) });
    }
    if (m === "DELETE" && id) {
      const [doc] = await db.select().from(accDocuments).where(and(eq(accDocuments.id, Number(id)), eq(accDocuments.businessId, biz.id)));
      if (!doc) throw new HttpError(404, "سند پیدا نشد");
      if (doc.status !== "draft") throw new HttpError(400, "سند قطعی قابل حذف نیست؛ برای اصلاح از «برگشت سند» استفاده کنید");
      await db.delete(accDocuments).where(eq(accDocuments.id, doc.id));
      return J({ ok: true });
    }
    if (m === "POST" && id && act === "post") {
      const d = await docDetail(auth, Number(id));
      if (d.status !== "draft") throw new HttpError(400, "این سند قبلاً قطعی شده است");
      const item = await A.replaceDraftLines(biz, d.id, { date: d.date, kind: d.kind, description: d.description, status: "posted", lines: d.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description })) });
      return J({ item });
    }
    if (m === "POST" && id && act === "reverse") {
      const b = await readJson(req).catch(() => ({}) as Record<string, unknown>);
      return J({ item: await A.reverseDocument(biz, Number(id), auth.user.name, dt(String(b.date ?? "")) ?? new Date()) }, 201);
    }
  }

  if (res === "reports" && m === "GET") {
    const y = await yearOf(auth, q.get("year"));
    const from = dt(q.get("from")), to = dt(q.get("to"));
    const includeClosing = q.get("closing") === "1";
    if (id === "trial") return J({ year: y, ...(await A.trial(biz, { yearId: y.id, from, to, level: ["kol", "moein", "tafsili"].includes(String(q.get("level"))) ? String(q.get("level")) : "moein", includeClosing, all: q.get("all") === "1" })) });
    if (id === "ledger") return J({ year: y, ...(await A.ledger(biz, { accountId: Number(q.get("account")), yearId: y.id, from, to, includeClosing })) });
    if (id === "journal") return J({ year: y, items: await A.journal(biz, { yearId: y.id, from, to, includeClosing }) });
    if (id === "statements") return J({ year: y, ...(await A.statements(biz, { yearId: y.id, from, to, closed: y.isClosed || includeClosing })) });
  }

  if (res === "depreciation" && m === "POST") return J({ item: await A.postDepreciation(biz, auth.user.name) }, 201);

  throw new HttpError(404, "پیدا نشد");
}

const reader = withAuth<Ctx>(handle, { feature: "accounting" });
const writer = withAuth<Ctx>(handle, { feature: "accounting", manager: true, roles: ["accountant"] });
export const GET = reader;
export const POST = writer;
export const PATCH = writer;
export const DELETE = writer;
