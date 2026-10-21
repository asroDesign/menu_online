export const DEFAULT_TRIAL_DURATION_DAYS = 14;

/** Every newly verified registration receives a trial; invalid legacy settings fall back safely. */
export function trialDurationDays(value: unknown) {
  const days = typeof value === "number" ? value : Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 60 ? days : DEFAULT_TRIAL_DURATION_DAYS;
}
