import type { Settings } from "@/lib/plans";

const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function tehranParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    day: DAY_INDEX[value.weekday] ?? 0,
    minute: Number(value.hour) * 60 + Number(value.minute),
  };
}

const minutes = (time: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
};

function hoursFor(settings: Settings, day: number) {
  return settings.operatingHours?.days?.find((entry) => entry.day === day && entry.open);
}

export function isOpenAt(settings: Settings, date: Date) {
  const hours = settings.operatingHours;
  if (!hours?.enabled) return true;
  const now = tehranParts(date);
  const current = hoursFor(settings, now.day);
  const start = current ? minutes(current.start) : null;
  const end = current ? minutes(current.end) : null;
  if (start !== null && end !== null) {
    if (start <= end && now.minute >= start && now.minute < end) return true;
    if (start > end && now.minute >= start) return true;
  }

  const previousDay = (now.day + 6) % 7;
  const previous = hoursFor(settings, previousDay);
  const previousStart = previous ? minutes(previous.start) : null;
  const previousEnd = previous ? minutes(previous.end) : null;
  return previousStart !== null && previousEnd !== null && previousStart > previousEnd && now.minute < previousEnd;
}

export function isOpenForDuration(settings: Settings, date: Date, durationMinutes: number) {
  if (!isOpenAt(settings, date)) return false;
  if (!settings.operatingHours?.enabled) return true;
  const now = tehranParts(date);
  const current = hoursFor(settings, now.day);
  const start = current ? minutes(current.start) : null;
  const end = current ? minutes(current.end) : null;
  if (start !== null && end !== null) {
    if (start < end && now.minute >= start && now.minute < end) return now.minute + durationMinutes <= end;
    if (start > end && now.minute >= start) return now.minute + durationMinutes <= end + 1440;
  }
  const previousDay = (now.day + 6) % 7;
  const previous = hoursFor(settings, previousDay);
  const previousStart = previous ? minutes(previous.start) : null;
  const previousEnd = previous ? minutes(previous.end) : null;
  return previousStart !== null && previousEnd !== null && previousStart > previousEnd && now.minute < previousEnd && now.minute + durationMinutes <= previousEnd;
}

function menuIsActive(menu: NonNullable<Settings["scheduledMenus"]>[number], date: Date) {
  if (!menu.enabled || menu.categoryIds.length === 0) return false;
  const now = tehranParts(date);
  const start = minutes(menu.start);
  const end = minutes(menu.end);
  if (start === null || end === null) return false;
  const days = menu.days.length ? menu.days : [0, 1, 2, 3, 4, 5, 6];
  if (start <= end) return days.includes(now.day) && now.minute >= start && now.minute < end;
  if (now.minute >= start) return days.includes(now.day);
  const previousDay = (now.day + 6) % 7;
  return now.minute < end && days.includes(previousDay);
}

export function activeScheduledCategoryIds(settings: Settings, date = new Date()) {
  const menus = settings.scheduledMenus ?? [];
  const assigned = new Set(menus.filter((m) => m.enabled).flatMap((m) => m.categoryIds));
  if (assigned.size === 0) return null;
  const active = new Set(menus.filter((m) => menuIsActive(m, date)).flatMap((m) => m.categoryIds));
  return { assigned, active };
}
