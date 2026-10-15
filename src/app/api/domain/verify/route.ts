import dns from "node:dns/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { HttpError, withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const POST = withAuth(
  async (req, { business }) => {
    const domain = business.customDomain;
    if (!domain) throw new HttpError(400, "ابتدا دامنه را ثبت کنید");
    const appHost = (req.headers.get("host") ?? "").split(":")[0];
    let ok = false;
    try {
      const cname = await dns.resolveCname(domain);
      if (cname.some((c) => c.replace(/\.$/, "") === appHost)) ok = true;
    } catch { /* no CNAME */ }
    if (!ok) {
      try {
        const [a, mine] = await Promise.all([dns.resolve4(domain), dns.resolve4(appHost).catch(() => [] as string[])]);
        if (a.some((x) => mine.includes(x))) ok = true;
      } catch { /* no A record */ }
    }
    await db.update(businesses).set({ domainStatus: ok ? "verified" : "pending" }).where(eq(businesses.id, business.id));
    return Response.json({ verified: ok });
  },
  { feature: "custom_domain" },
);
