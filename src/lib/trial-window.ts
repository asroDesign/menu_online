export function isTrialWindowActive(startsAt: Date | string, endsAt: Date | string, at: Date | number = Date.now()) {
  const now = at instanceof Date ? at.getTime() : at;
  return new Date(startsAt).getTime() <= now && new Date(endsAt).getTime() > now;
}
