/** Public feature switch for the sample/demo tenant and demo-account sign-in. */
const value = (process.env.NEXT_PUBLIC_DEMO_MODE ?? "true").trim().toLowerCase();
export const DEMO_ENABLED = !["false", "0", "off", "disabled", "no"].includes(value);

/** Emails reserved for the seeded accounts shown in the demo sign-in panel. */
export const DEMO_LOGIN_EMAILS = new Set([
  "demo@menudigital.ir", "basic@menudigital.ir", "premium@menudigital.ir",
  "admin@menudigital.ir", "support@menudigital.ir", "finance@menudigital.ir",
  "courier@menudigital.ir", "waiter@menudigital.ir", "cashier@menudigital.ir",
  "kitchen@menudigital.ir", "warehouse@menudigital.ir", "accountant@menudigital.ir",
]);
