import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { affiliateCommissions, affiliateWalletEntries, affiliateWithdrawals, affiliates, businesses, subscriptionInvoices } from "@/db/schema";
import { getAffiliate } from "@/lib/affiliate-auth";
import { errorResponse, HttpError, readJson } from "@/lib/auth";

const digits = (v: unknown) => String(v ?? "").replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");

export async function GET() {
  try {
    const affiliate = await getAffiliate();
    if (!affiliate) throw new HttpError(401, "برای ادامه وارد پنل همکاری شوید");
    const [balance, stats, customersCount, commissions, entries, withdrawals] = await Promise.all([
      db.select({ amount: sql<number>`coalesce(sum(${affiliateWalletEntries.amount}),0)::bigint` }).from(affiliateWalletEntries).where(eq(affiliateWalletEntries.affiliateId, affiliate.id)).then(rows => rows[0]),
      db.select({ count: sql<number>`count(*)::int`, saleAmount: sql<number>`coalesce(sum(${affiliateCommissions.saleAmount}),0)::bigint`, commissionAmount: sql<number>`coalesce(sum(${affiliateCommissions.amount}),0)::bigint` }).from(affiliateCommissions).where(eq(affiliateCommissions.affiliateId, affiliate.id)).then(rows => rows[0]),
      db.select({ count: sql<number>`count(*)::int` }).from(businesses).where(eq(businesses.affiliateId, affiliate.id)).then(rows => rows[0]),
      db.select({ c: affiliateCommissions, businessName: businesses.name, plan: subscriptionInvoices.plan, invoiceNumber: subscriptionInvoices.number, months: subscriptionInvoices.months }).from(affiliateCommissions).innerJoin(businesses, eq(businesses.id, affiliateCommissions.businessId)).innerJoin(subscriptionInvoices, eq(subscriptionInvoices.id, affiliateCommissions.invoiceId)).where(eq(affiliateCommissions.affiliateId, affiliate.id)).orderBy(desc(affiliateCommissions.id)).limit(200),
      db.select().from(affiliateWalletEntries).where(eq(affiliateWalletEntries.affiliateId, affiliate.id)).orderBy(desc(affiliateWalletEntries.id)).limit(300),
      db.select().from(affiliateWithdrawals).where(eq(affiliateWithdrawals.affiliateId, affiliate.id)).orderBy(desc(affiliateWithdrawals.id)).limit(100),
    ]);
    return Response.json({ item: affiliate, balance: Number(balance?.amount ?? 0), stats: { salesCount: Number(stats?.count ?? 0), saleAmount: Number(stats?.saleAmount ?? 0), commissionAmount: Number(stats?.commissionAmount ?? 0), customerCount: Number(customersCount?.count ?? 0) }, commissions: commissions.map(x => ({ ...x.c, businessName: x.businessName, plan: x.plan, invoiceNumber: x.invoiceNumber, months: x.months })), entries, withdrawals });
  } catch (e) { return errorResponse(e); }
}

export async function PATCH(req: Request) {
  try {
    const affiliate = await getAffiliate();
    if (!affiliate) throw new HttpError(401, "برای ادامه وارد پنل همکاری شوید");
    const b = await readJson(req);
    const cardNumber = digits(b.cardNumber);
    const shebaDigits = digits(b.sheba);
    if (shebaDigits && shebaDigits.length !== 24) throw new HttpError(400, "شماره شبا باید شامل ۲۴ رقم باشد");
    const sheba = shebaDigits ? `IR${shebaDigits}` : "";
    if (cardNumber && cardNumber.length !== 16) throw new HttpError(400, "شماره کارت باید ۱۶ رقم باشد");
    if (sheba && !/^IR\d{24}$/.test(sheba)) throw new HttpError(400, "شماره شبا باید شامل IR و ۲۴ رقم باشد");
    const [item] = await db.update(affiliates).set({ bankName: String(b.bankName ?? "").trim().slice(0, 80), accountHolder: String(b.accountHolder ?? "").trim().slice(0, 100), cardNumber, sheba }).where(and(eq(affiliates.id, affiliate.id), eq(affiliates.status, "active"))).returning({ bankName: affiliates.bankName, accountHolder: affiliates.accountHolder, cardNumber: affiliates.cardNumber, sheba: affiliates.sheba });
    if (!item) throw new HttpError(404, "حساب همکاری یافت نشد");
    return Response.json({ item });
  } catch (e) { return errorResponse(e); }
}
