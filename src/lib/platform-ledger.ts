import { and, asc, eq, inArray } from "drizzle-orm";
import { platformAccounts, platformJournalLines, platformJournals } from "@/db/schema";

export type PlatformJournalLineInput = { accountCode: string; description?: string; debit?: number; credit?: number };

/** Insert one balanced platform journal and its lines in the caller's existing transaction. */
export async function postPlatformJournal(tx: any, input: {
  date?: Date; description: string; sourceType: "subscription_invoice" | "subscription_receipt" | "platform_expense" | "affiliate_commission" | "affiliate_payout" | "platform_check" | "platform_check_settlement" | "manual";
  sourceId?: number | null; createdBy?: string; reversalOf?: number | null; lines: PlatformJournalLineInput[];
}) {
  const lines = input.lines.map((line) => ({
    accountCode: line.accountCode,
    description: String(line.description ?? "").slice(0, 240),
    debit: Math.round(Number(line.debit ?? 0)),
    credit: Math.round(Number(line.credit ?? 0)),
  }));
  if (lines.length < 2 || lines.some((line) => !line.accountCode || line.debit < 0 || line.credit < 0 || (line.debit > 0) === (line.credit > 0))) throw new Error("ردیف‌های سند سامانه معتبر نیستند");
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  if (debit <= 0 || debit !== credit) throw new Error("جمع بدهکار و بستانکار سند سامانه برابر نیست");
  const codes = [...new Set(lines.map((line) => line.accountCode))];
  const accounts = await tx.select({ code: platformAccounts.code }).from(platformAccounts).where(and(inArray(platformAccounts.code, codes), eq(platformAccounts.isActive, true)));
  if (accounts.length !== codes.length) throw new Error("یکی از حساب‌های سند سامانه غیرفعال یا نامعتبر است");
  const [childAccount] = await tx.select({ code: platformAccounts.code }).from(platformAccounts).where(inArray(platformAccounts.parentCode, codes)).limit(1);
  if (childAccount) throw new Error("ثبت مستقیم روی سرفصل دارای زیرحساب مجاز نیست؛ حساب تفصیلی یا آخرین سطح را انتخاب کنید");
  const [journal] = await tx.insert(platformJournals).values({
    date: input.date ?? new Date(), description: input.description.slice(0, 500),
    sourceType: input.sourceType, sourceId: input.sourceId ?? null, reversalOf: input.reversalOf ?? null,
    createdBy: input.createdBy ?? "سیستم", status: "posted",
  }).onConflictDoNothing().returning();
  if (!journal) return null; // Source key is the idempotency boundary.
  await tx.insert(platformJournalLines).values(lines.map((line, index) => ({ journalId: journal.id, lineNo: index + 1, ...line })));
  return journal;
}

export function paymentAccountCode(method: string) {
  return method === "cash" ? "10101" : "10201";
}

export function expenseAccountCode(category: string) {
  if (/سرور|زیرساخت|دامنه/i.test(category)) return "5010";
  if (/پیامک|ارتباط/i.test(category)) return "5020";
  if (/حقوق|دستمزد/i.test(category)) return "5030";
  if (/بازاریابی|تبلیغ/i.test(category)) return "5040";
  if (/ابزار|نرم.?افزار/i.test(category)) return "5050";
  if (/پورسانت/i.test(category)) return "5070";
  return "5060";
}

export async function listPlatformJournal(tx: any, journalId: number) {
  const [journal] = await tx.select().from(platformJournals).where(eq(platformJournals.id, journalId));
  if (!journal) return null;
  const lines = await tx.select({ lineNo: platformJournalLines.lineNo, accountCode: platformJournalLines.accountCode, accountName: platformAccounts.name, description: platformJournalLines.description, debit: platformJournalLines.debit, credit: platformJournalLines.credit }).from(platformJournalLines).innerJoin(platformAccounts, eq(platformAccounts.code, platformJournalLines.accountCode)).where(eq(platformJournalLines.journalId, journalId)).orderBy(asc(platformJournalLines.lineNo));
  return { ...journal, lines };
}
