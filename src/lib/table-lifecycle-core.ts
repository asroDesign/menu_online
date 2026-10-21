export const OPERATIONAL_TABLE_STATES = ["available", "cleaning", "out_of_service"] as const;
export type OperationalTableState = (typeof OPERATIONAL_TABLE_STATES)[number];
export type EffectiveTableState = OperationalTableState | "occupied" | "reserved";

const transitions: Record<OperationalTableState, OperationalTableState[]> = {
  available: ["cleaning", "out_of_service"],
  cleaning: ["available", "out_of_service"],
  out_of_service: ["available"],
};

export function isOperationalTableState(value: string): value is OperationalTableState {
  return (OPERATIONAL_TABLE_STATES as readonly string[]).includes(value);
}

export function canTransitionTable(from: OperationalTableState, to: OperationalTableState) {
  return transitions[from].includes(to);
}

export function effectiveTableState(operational: OperationalTableState, occupied: boolean, reserved: boolean): EffectiveTableState {
  if (operational !== "available") return operational;
  if (occupied) return "occupied";
  if (reserved) return "reserved";
  return "available";
}
