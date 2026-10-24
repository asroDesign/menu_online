/** Public feature switch for the sample/demo tenant and demo-account sign-in. */
const value = (process.env.DEMO_MODE ?? process.env.NEXT_PUBLIC_DEMO_MODE ?? "false").trim().toLowerCase();
export const DEMO_ENABLED = ["true", "1", "on", "enabled", "yes"].includes(value);

/** Reserved public sample tenant slug. Checkout remains read-only; reservations follow the tenant entitlement/settings. */
export const DEMO_SLUG = "niloofar";

export function isReadOnlyDemoSlug(slug: string) {
  return slug === DEMO_SLUG;
}

/** Emails reserved for the seeded accounts shown in the demo sign-in panel. */
export const DEMO_LOGIN_EMAILS = new Set([
  "demo@menupeak.ir", "basic@menupeak.ir", "premium@menupeak.ir",
  "admin@menupeak.ir", "support@menupeak.ir", "finance@menupeak.ir",
  "courier@menupeak.ir", "waiter@menupeak.ir", "cashier@menupeak.ir",
  "kitchen@menupeak.ir", "warehouse@menupeak.ir", "accountant@menupeak.ir",
]);
