/** Public feature switch for the sample/demo tenant and demo-account sign-in. */
const value = (process.env.DEMO_MODE ?? process.env.NEXT_PUBLIC_DEMO_MODE ?? "false").trim().toLowerCase();
export const DEMO_ENABLED = ["true", "1", "on", "enabled", "yes"].includes(value);

/** Reserved sample tenant slug. Its public surfaces are read-only. */
export const DEMO_SLUG = "niloofar";

export function isReadOnlyDemoSlug(slug: string) {
  return slug === DEMO_SLUG;
}

/** Emails reserved for the seeded accounts shown in the demo sign-in panel. */
export const DEMO_LOGIN_EMAILS = new Set([
  "demo@menudigital.ir", "basic@menudigital.ir", "premium@menudigital.ir",
  "admin@menudigital.ir", "support@menudigital.ir", "finance@menudigital.ir",
  "courier@menudigital.ir", "waiter@menudigital.ir", "cashier@menudigital.ir",
  "kitchen@menudigital.ir", "warehouse@menudigital.ir", "accountant@menudigital.ir",
]);
