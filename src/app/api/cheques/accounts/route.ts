import { withAuth } from "@/lib/auth";
import * as A from "@/lib/accounting";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, auth) => {
  await A.ensureChequeAccountingAccounts(auth.business);
  const items = (await A.loadAccounts(auth.business.id)).filter((account) =>
    account.isActive && (account.level === "moein" || account.level === "tafsili") &&
    account.code !== A.C.CHEQUE_RECEIVABLE && account.code !== A.C.CHEQUE_PAYABLE,
  ).map(({ id, code, name, level, nature, type }) => ({ id, code, name, level, nature, type }));
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "cheque_register", manager: true, roles: ["accountant"] });
