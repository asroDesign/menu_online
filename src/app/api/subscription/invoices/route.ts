import { and, desc, eq, gte, or } from "drizzle-orm";
import { db } from "@/db";
import { subscriptionInvoices } from "@/db/schema";
import { withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { business }) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  const conditions = [eq(subscriptionInvoices.businessId, business.id), eq(subscriptionInvoices.status, "unpaid")];
  conditions.push(or(eq(subscriptionInvoices.couponCode, ""), gte(subscriptionInvoices.createdAt, new Date(Date.now() - 24 * 60 * 60_000)))!);
  if (Number.isInteger(id) && id > 0) conditions.push(eq(subscriptionInvoices.id, id));
  const items = await db.select().from(subscriptionInvoices).where(and(...conditions)).orderBy(desc(subscriptionInvoices.id)).limit(100);
  return Response.json({ items });
}, { manager: true, allowUnpaid: true });
