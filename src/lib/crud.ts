/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { HttpError, readJson, withAuth, type AuthContext, type Business } from "@/lib/auth";

type Field =
  | { type: "string"; required?: boolean; max?: number }
  | { type: "int"; required?: boolean; min?: number; max?: number }
  | { type: "float"; required?: boolean; min?: number; max?: number }
  | { type: "nullableInt"; min?: number; required?: boolean }
  | { type: "bool" }
  | { type: "date"; required?: boolean }
  | { type: "json" }
  | { type: "enum"; values: string[]; required?: boolean };

export type Spec = Record<string, Field>;
const REQ = "لطفاً همه فیلدهای ضروری را پر کنید";

function sanitize(spec: Spec, body: Record<string, unknown>, creating: boolean) {
  const out: Record<string, unknown> = {};
  for (const [key, f] of Object.entries(spec)) {
    const has = key in body && body[key] !== undefined;
    if (!has) {
      if (creating && "required" in f && f.required) throw new HttpError(400, REQ);
      continue;
    }
    const v = body[key];
    switch (f.type) {
      case "string": {
        const s = typeof v === "string" ? v.trim() : "";
        if (f.required && !s) throw new HttpError(400, REQ);
        out[key] = s.slice(0, f.max ?? 500);
        break;
      }
      case "int": {
        const n = Math.round(Number(v));
        if (!Number.isFinite(n)) throw new HttpError(400, "مقدار عددی نامعتبر است");
        out[key] = Math.min(f.max ?? 2_000_000_000, Math.max(f.min ?? 0, n));
        break;
      }
      case "float": {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new HttpError(400, "مقدار عددی نامعتبر است");
        out[key] = Math.min(f.max ?? 1e12, Math.max(f.min ?? 0, n));
        break;
      }
      case "nullableInt": {
        if (v === null || v === "" || Number(v) === 0) {
          if (f.required) throw new HttpError(400, REQ);
          out[key] = null;
        } else {
          const n = Math.round(Number(v));
          if (!Number.isFinite(n)) throw new HttpError(400, "مقدار عددی نامعتبر است");
          out[key] = Math.max(f.min ?? 0, n);
        }
        break;
      }
      case "bool":
        out[key] = Boolean(v);
        break;
      case "date": {
        if (v === null || v === "") {
          if (f.required) throw new HttpError(400, REQ);
          out[key] = null;
        } else {
          const d = new Date(String(v));
          if (isNaN(d.getTime())) throw new HttpError(400, "تاریخ نامعتبر است");
          out[key] = d;
        }
        break;
      }
      case "json":
        out[key] = v && typeof v === "object" ? v : [];
        break;
      case "enum":
        if (typeof v !== "string" || !f.values.includes(v)) {
          throw new HttpError(400, "مقدار انتخاب‌شده نامعتبر است");
        }
        out[key] = v;
        break;
    }
  }
  return out;
}

export type CrudConfig = {
  table: any;
  spec: Spec;
  order: any[];
  /** feature(s) required for write operations (and read unless readFeature is set) */
  feature?: string | string[];
  readFeature?: string | string[];
  scope?: SQL;
  /** extra roles (besides owner/manager) allowed to create/update/delete */
  writers?: string[];
  defaults?: Record<string, unknown> | (() => Record<string, unknown>);
  decorate?: (rows: any[], biz: Business, auth: AuthContext) => Promise<any[]>;
  validate?: (biz: Business, data: Record<string, unknown>, auth: AuthContext, creating: boolean, id?: number) => Promise<void>;
  /** runs before a row is deleted (throw HttpError to refuse) */
  beforeDelete?: (biz: Business, id: number, auth: AuthContext) => Promise<void>;
};

export function makeCrud(cfg: CrudConfig) {
  const { table } = cfg;
  const decorate = cfg.decorate ?? (async (r: any[]) => r);
  const where = (biz: Business, extra?: SQL) =>
    and(eq(table.businessId, biz.id), cfg.scope, extra) as SQL;

  const list = withAuth(
    async (_req, auth) => {
      const rows = await db
        .select()
        .from(table)
        .where(where(auth.business))
        .orderBy(...cfg.order);
      return Response.json({ items: await decorate(rows, auth.business, auth) });
    },
    { feature: cfg.readFeature ?? cfg.feature },
  );

  const create = withAuth(
    async (req, auth) => {
      const data = sanitize(cfg.spec, await readJson(req), true);
      const defaults = typeof cfg.defaults === "function" ? cfg.defaults() : (cfg.defaults ?? {});
      const merged = { ...defaults, ...data };
      await cfg.validate?.(auth.business, merged, auth, true);
      const inserted = (await (db.insert(table) as any)
        .values({ ...merged, businessId: auth.business.id })
        .returning()) as any[];
      return Response.json({ item: (await decorate([inserted[0]], auth.business, auth))[0] }, { status: 201 });
    },
    { feature: cfg.feature, manager: true, roles: cfg.writers },
  );

  const update = withAuth<{ id: string }>(
    async (req, auth, { id }) => {
      const data = sanitize(cfg.spec, await readJson(req), false);
      if (Object.keys(data).length === 0) throw new HttpError(400, "تغییری ارسال نشد");
      await cfg.validate?.(auth.business, data, auth, false, Number(id));
      const [row] = (await (db.update(table) as any)
        .set(data)
        .where(where(auth.business, eq(table.id, Number(id))))
        .returning()) as any[];
      if (!row) throw new HttpError(404, "مورد پیدا نشد");
      return Response.json({ item: (await decorate([row], auth.business, auth))[0] });
    },
    { feature: cfg.feature, manager: true, roles: cfg.writers },
  );

  const remove = withAuth<{ id: string }>(
    async (_req, auth, { id }) => {
      await cfg.beforeDelete?.(auth.business, Number(id), auth);
      const [row] = (await (db.delete(table) as any)
        .where(where(auth.business, eq(table.id, Number(id))))
        .returning()) as any[];
      if (!row) throw new HttpError(404, "مورد پیدا نشد");
      return Response.json({ ok: true });
    },
    { feature: cfg.feature, manager: true, roles: cfg.writers },
  );

  return { list, create, update, remove };
}
