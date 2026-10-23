export const RECEIPT_TEXT_WIDTH = 48;

export type ReceiptLayoutItem = {
  name: string;
  quantity: string;
  amount?: string;
  weight?: string;
  options?: string[];
};

export type ReceiptLayoutInput = {
  businessName: string;
  header?: string;
  footer?: string;
  orderNumber: string;
  typeLabel: string;
  customerName?: string;
  address?: string;
  note?: string;
  printerName?: string;
  includeTotal?: boolean;
  total?: string;
  items: ReceiptLayoutItem[];
  banners?: string[];
};

const points = (value: string) => Array.from(value);

function fitLine(value: string, width: number) {
  const chars = points(value);
  return chars.length > width ? chars.slice(0, width).join("") : value + " ".repeat(width - chars.length);
}

export function wrapReceiptText(value: string, width: number) {
  const result: string[] = [];
  for (const paragraph of value.replace(/\r/g, "").replace(/\|/g, "¦").split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      result.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const parts = points(word);
      while (parts.length > width) {
        const fragment = parts.splice(0, width).join("");
        if (line) { result.push(line); line = ""; }
        result.push(fragment);
      }
      const remaining = parts.join("");
      if (!remaining) continue;
      if (!line) line = remaining;
      else if (points(`${line} ${remaining}`).length <= width) line += ` ${remaining}`;
      else { result.push(line); line = remaining; }
    }
    if (line) result.push(line);
  }
  return result;
}

export function formatReceiptBox(value: string) {
  const width = RECEIPT_TEXT_WIDTH;
  const innerWidth = width - 4;
  const border = `+${"-".repeat(width - 2)}+`;
  return [border, ...wrapReceiptText(value, innerWidth).map((line) => `| ${fitLine(line, innerWidth)} |`), border].join("\n");
}

export function formatReceiptText(input: ReceiptLayoutInput) {
  const width = RECEIPT_TEXT_WIDTH;
  const innerWidth = width - 4;
  const border = `+${"-".repeat(width - 2)}+`;
  const boxLine = (value: string) => `| ${fitLine(value, innerWidth)} |`;
  const tableRow = (name: string, quantity: string, amount: string) => `| ${fitLine(name, 22)} | ${fitLine(quantity, 4)} | ${fitLine(amount, 12)} |`;
  const lines: string[] = [];
  const addFrame = (values: string[]) => {
    if (!values.length) return;
    lines.push(border);
    for (const value of values) for (const wrapped of wrapReceiptText(value, innerWidth)) lines.push(boxLine(wrapped));
    lines.push(border);
  };

  for (const banner of input.banners ?? []) if (banner.trim()) lines.push(formatReceiptBox(banner));
  addFrame([
    input.businessName,
    ...(input.header?.trim() ? [input.header.trim()] : []),
    `سفارش #${input.orderNumber} · ${input.typeLabel}`,
    ...(input.printerName ? [`بخش: ${input.printerName}`] : []),
    ...(input.customerName ? [`مشتری: ${input.customerName}`] : []),
    ...(input.address ? [`نشانی: ${input.address}`] : []),
  ]);

  lines.push(border, tableRow("شرح کالا", "تعداد", input.includeTotal === false ? "" : "تومان"), border);
  input.items.forEach((item) => {
    const name = item.weight ? `${item.name} · وزن خالص ${item.weight} گرم` : item.name;
    const nameLines = wrapReceiptText([name, ...(item.options ?? []).map(option => `انتخاب: ${option}`)].join("\n"), 22);
    const quantities = wrapReceiptText(item.quantity, 4);
    const amounts = wrapReceiptText(input.includeTotal === false ? "" : item.amount ?? "", 12);
    for (let i = 0; i < Math.max(nameLines.length, quantities.length, amounts.length); i++) {
      lines.push(tableRow(nameLines[i] ?? "", quantities[i] ?? "", amounts[i] ?? ""));
    }
    lines.push(border);
  });

  if (input.includeTotal !== false && input.total) addFrame(["مبلغ نهایی", `${input.total} تومان`]);
  if (input.note?.trim()) addFrame([`توضیحات: ${input.note.trim()}`]);
  if (input.footer?.trim()) addFrame([input.footer.trim()]);
  else addFrame(["از خرید شما سپاسگزاریم"]);
  return lines.join("\n");
}
