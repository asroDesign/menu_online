export type PrintMoment = "created_with_table" | "created_without_table" | "settled" | "completed";
export type PrintRule = {
  customerCopies: number;
  kitchenCopies: number;
  cafeCopies: number;
  customerPrinterId: number | null;
  kitchenPrinterIds: number[];
  cafePrinterId: number | null;
};
export type PrinterSettings = {
  receiptHeader: string;
  receiptFooter: string;
  rules: Record<PrintMoment, PrintRule>;
};
export type PrintCopyPreset = { key: string; customer: number; kitchen: number; cafe: number };

const rule = (customerCopies = 0, kitchenCopies = 0, cafeCopies = 0): PrintRule => ({
  customerCopies, kitchenCopies, cafeCopies, customerPrinterId: null, kitchenPrinterIds: [], cafePrinterId: null,
});

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  receiptHeader: "",
  receiptFooter: "",
  rules: {
    created_with_table: rule(1, 1),
    created_without_table: rule(0, 1),
    settled: rule(1, 0, 1),
    completed: rule(1, 0),
  },
};

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const printerId = (value: unknown): number | null => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const printerIds = (value: unknown): number[] => Array.isArray(value)
  ? [...new Set(value.map(printerId).filter((id): id is number => id !== null))].slice(0, 100)
  : [];
const copies = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Math.min(5, Math.max(0, Math.floor(Number(value)))) : fallback;

/** Normalize persisted JSON settings, including older businesses with no printer settings yet. */
export function normalizePrinterSettings(value: unknown): PrinterSettings {
  const raw = object(value);
  const rawRules = object(raw.rules);
  const rules = {} as Record<PrintMoment, PrintRule>;
  for (const moment of Object.keys(DEFAULT_PRINTER_SETTINGS.rules) as PrintMoment[]) {
    const fallback = DEFAULT_PRINTER_SETTINGS.rules[moment];
    const current = object(rawRules[moment]);
    rules[moment] = {
      customerCopies: copies(current.customerCopies, fallback.customerCopies),
      kitchenCopies: copies(current.kitchenCopies, fallback.kitchenCopies),
      cafeCopies: copies(current.cafeCopies, fallback.cafeCopies),
      customerPrinterId: printerId(current.customerPrinterId),
      kitchenPrinterIds: printerIds(current.kitchenPrinterIds),
      cafePrinterId: printerId(current.cafePrinterId),
    };
  }
  return {
    receiptHeader: typeof raw.receiptHeader === "string" ? raw.receiptHeader.trim().slice(0, 500) : "",
    receiptFooter: typeof raw.receiptFooter === "string" ? raw.receiptFooter.trim().slice(0, 500) : "",
    rules,
  };
}

/** Keep rules with explicit device routing in the custom editor, even when copy counts match a preset. */
export function printerRulePresetKey(value: PrintRule, presets: PrintCopyPreset[]): string {
  const hasExplicitPrinterRouting = value.customerPrinterId !== null
    || value.kitchenPrinterIds.length > 0
    || value.cafePrinterId !== null;
  if (hasExplicitPrinterRouting) return "custom";
  return presets.find((item) => item.customer === value.customerCopies
    && item.kitchen === value.kitchenCopies
    && item.cafe === value.cafeCopies)?.key ?? "custom";
}

/** Apply a named preset and return its routing to automatic device selection. */
export function applyPrintCopyPreset(value: PrintRule, preset: PrintCopyPreset): PrintRule {
  return {
    ...value,
    customerCopies: preset.customer,
    kitchenCopies: preset.kitchen,
    cafeCopies: preset.cafe,
    customerPrinterId: null,
    kitchenPrinterIds: [],
    cafePrinterId: null,
  };
}

export function validatePrinterSelection(settings: PrinterSettings, ownedPrinterIds: Set<number>) {
  for (const current of Object.values(settings.rules)) {
    if (current.customerPrinterId && !ownedPrinterIds.has(current.customerPrinterId)) return false;
    if (current.cafePrinterId && !ownedPrinterIds.has(current.cafePrinterId)) return false;
    if (current.kitchenPrinterIds.some((id) => !ownedPrinterIds.has(id))) return false;
  }
  return true;
}

export function printOutputs(settings: PrinterSettings, moment: PrintMoment) {
  const current = settings.rules[moment];
  return [
    ...(current.customerCopies ? [{ kind: "customer" as const, copies: current.customerCopies, printerId: current.customerPrinterId }] : []),
    ...(current.kitchenCopies ? [{ kind: "kitchen" as const, copies: current.kitchenCopies, printerIds: current.kitchenPrinterIds }] : []),
    ...(current.cafeCopies ? [{ kind: "cafe" as const, copies: current.cafeCopies, printerId: current.cafePrinterId }] : []),
  ];
}
