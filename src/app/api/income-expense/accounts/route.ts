import { withAuth } from "@/lib/auth";
import * as A from "@/lib/accounting";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, auth) => {
  await A.ensureAccounting(auth.business);
  const items = (await A.loadAccounts(auth.business.id)).filter((account) =>
    account.isActive && (
      (account.type === "revenue" && account.nature === "credit" && (account.level === "moein" || account.level === "tafsili")) ||
      (account.type === "expense" && account.nature === "debit" && (account.level === "moein" || account.level === "tafsili"))
    ),
  );
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "income_expense" });
