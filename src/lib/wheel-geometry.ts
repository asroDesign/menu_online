/** Angles start at the fixed pointer (12 o'clock), clockwise. */
export function wheelSectors(weights: number[]) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!weights.length || !Number.isFinite(total) || weights.some(weight => !Number.isFinite(weight) || weight <= 0)) return [];
  let cursor = 0;
  return weights.map(weight => {
    const start = cursor / total * 360;
    cursor += weight;
    const end = cursor / total * 360;
    return { start, end, center: (start + end) / 2 };
  });
}

export function wheelLandingRotation(current: number, center: number, turns = 7) {
  const target = (360 - center) % 360;
  const normalized = ((current % 360) + 360) % 360;
  return current + turns * 360 + ((target - normalized + 360) % 360);
}

export function wheelPoint(angle: number, radius: number) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: 200 + Math.cos(radians) * radius, y: 200 + Math.sin(radians) * radius };
}

export function wheelSectorPath(start: number, end: number) {
  const a = wheelPoint(start, 167);
  const b = wheelPoint(end, 167);
  if (end - start >= 359.999) return "M 200 33 A 167 167 0 1 1 200 367 A 167 167 0 1 1 200 33 Z";
  return `M 200 200 L ${a.x} ${a.y} A 167 167 0 ${end - start > 180 ? 1 : 0} 1 ${b.x} ${b.y} Z`;
}
