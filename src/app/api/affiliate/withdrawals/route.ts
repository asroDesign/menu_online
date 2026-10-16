import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { affiliateWalletEntries, affiliateWithdrawals, affiliates } from "@/db/schema";
import { getAffiliate } from "@/lib/affiliate-auth";
import { errorResponse, HttpError, readJson } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const affiliate = await getAffiliate();
    if (!affiliate) throw new HttpError(401, "برای ادامه وارد پنل همکاری شوید");
    const b = await readJson(req);
    const amount = Math.round(Number(String(b.amount ?? "").replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "")));
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new HttpError(400, "مبلغ برداشت معتبر نیست");
    if (!affiliate.accountHolder || (!affiliate.cardNumber && !affiliate.sheba)) throw new HttpError(400, "ابتدا اطلاعات بانکی خود را تکمیل کنید");
    const result = await db.transaction(async tx => {
      const [lockedAffiliate] = await tx.select({ id: affiliates.id, status: affiliates.status, minimumWithdrawal: affiliates.minimumWithdrawal, bankName: affiliates.bankName, accountHolder: affiliates.accountHolder, cardNumber: affiliates.cardNumber, sheba: affiliates.sheba }).from(affiliates).where(eq(affiliates.id, affiliate.id)).for("update");
      if (!lockedAffiliate) throw new HttpError(404, "حساب همکاری یافت نشد");
      if (lockedAffiliate.status !== "active") throw new HttpError(403, "حساب همکاری فعال نیست");
      if (!lockedAffiliate.accountHolder || (!lockedAffiliate.cardNumber && !lockedAffiliate.sheba)) throw new HttpError(400, "ابتدا اطلاعات بانکی خود را تکمیل کنید");
      const [bal] = await tx.select({ amount: sql<number>`coalesce(sum(${affiliateWalletEntries.amount}),0)::bigint` }).from(affiliateWalletEntries).where(eq(affiliateWalletEntries.affiliateId, affiliate.id));
      if (amount < lockedAffiliate.minimumWithdrawal) throw new HttpError(400, `حداقل مبلغ درخواست ${lockedAffiliate.minimumWithdrawal.toLocaleString("fa-IR")} تومان است`);
      if (amount > Number(bal.amount ?? 0)) throw new HttpError(400, "موجودی قابل برداشت کافی نیست");
      const [withdrawal] = await tx.insert(affiliateWithdrawals).values({ affiliateId: affiliate.id, amount, bankName: lockedAffiliate.bankName, accountHolder: lockedAffiliate.accountHolder, cardNumber: lockedAffiliate.cardNumber, sheba: lockedAffiliate.sheba }).returning();
      await tx.insert(affiliateWalletEntries).values({ affiliateId: affiliate.id, kind: "withdrawal_hold", amount: -amount, referenceType: "withdrawal", referenceId: withdrawal.id, description: "رزرو موجودی برای درخواست برداشت" });
      return withdrawal;
    });
    return Response.json({ item: result }, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
