export type MenuViewDay = { key: string; date: string };
export type MenuViewCount = { date: string; views: number };

/** Fill missing calendar days with zero so the dashboard chart has a stable daily series. */
export function buildMenuViewsSeries(days: MenuViewDay[], counts: MenuViewCount[]) {
  const byDate = new Map(counts.map(({ date, views }) => [date, Math.max(0, Math.trunc(Number(views) || 0))]));
  return days.map(({ key, date }) => ({ date, views: byDate.get(key) ?? 0 }));
}
