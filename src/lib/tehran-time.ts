/** Parse date values from PersianDateInput as Tehran wall time; preserve explicit ISO offsets. */
export function parseTehranDateTime(value: unknown): Date {
  const raw = String(value ?? "").trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/u.test(raw);
  const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/u.test(raw);
  const parsed = new Date(dateOnly ? `${raw}T00:00:00+03:30` : localDateTime ? `${raw}+03:30` : raw);
  return parsed;
}
