import type { TransferCard } from "@/lib/plans";

/** Returns valid active destination cards, retaining the legacy single-card format during migration. */
export function activeTransferCards(value: unknown): TransferCard[] {
  if (!value || typeof value !== "object") return [];
  const config = value as Record<string, unknown>;
  if (!config.enabled) return [];
  const rows = Array.isArray(config.cards) ? config.cards.slice(0, 10) : [config];
  return rows.flatMap((row, index) => {
    if (!row || typeof row !== "object") return [];
    const card = row as Record<string, unknown>;
    const cardNumber = typeof card.cardNumber === "string" ? card.cardNumber.replace(/\D/g, "") : "";
    const accountHolder = typeof card.accountHolder === "string" ? card.accountHolder.trim().slice(0, 80) : "";
    if (!/^\d{16}$/.test(cardNumber) || accountHolder.length < 2) return [];
    const rawId = typeof card.id === "string" ? card.id : "";
    return [{
      id: /^[a-zA-Z0-9_-]{1,40}$/.test(rawId) ? rawId : `card-${index + 1}`,
      cardNumber,
      accountHolder,
      bankName: typeof card.bankName === "string" ? card.bankName.trim().slice(0, 60) : "",
      instructions: typeof card.instructions === "string" ? card.instructions.trim().slice(0, 200) : "",
    }];
  });
}
