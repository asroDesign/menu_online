import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (req, { business }) =>
    Response.json({ domain: business.customDomain, status: business.domainStatus, appHost: (req.headers.get("host") ?? "").split(":")[0] }),
  { feature: "custom_domain" },
);

export const PUT = withAuth(
  async (req, { business }) => {
    const b = await readJson(req);
    const raw = String(b.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    let domain: string | null = raw || null;
    if (domain && !/^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/.test(domain)) throw new HttpError(400, "نام دامنه معتبر نیست (مثال: menu.example.com)");
    if (domain) {
      const [dup] = await db.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.customDomain, domain), ne(businesses.id, business.id)));
      if (dup) throw new HttpError(409, "این دامنه قبلاً توسط کسب‌وکار دیگری ثبت شده است");
    }
    if (domain === business.customDomain) domain = business.customDomain;
    await db.update(businesses).set({ customDomain: domain, domainStatus: domain ? (domain === business.customDomain ? business.domainStatus : "pending") : "none" }).where(eq(businesses.id, business.id));
    return Response.json({ ok: true });
  },
  { feature: "custom_domain" },
);
