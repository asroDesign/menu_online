export const TABLE_QR_FRAMES = [
  { id: "signature", label: "امضای برند", description: "نوار رنگی و قاب شاخص" },
  { id: "minimal", label: "مینیمال", description: "ساده و خلوت" },
  { id: "ticket", label: "بلیتی", description: "لبه‌های بریدگی‌دار" },
  { id: "soft", label: "نرم", description: "پس‌زمینهٔ لطیف و گوشه‌های گرد" },
  { id: "classic", label: "کلاسیک", description: "حاشیهٔ دوخطی رسمی" },
] as const;

export type TableQrFrame = (typeof TABLE_QR_FRAMES)[number]["id"];

export type TableQrDesign = {
  frame: TableQrFrame;
  frameColor: string;
  qrColor: string;
  paperColor: string;
  headline: string;
  caption: string;
  qrSize: number;
  quietZone: number;
  showTableName: boolean;
  showUrl: boolean;
};

export const DEFAULT_TABLE_QR_DESIGN: TableQrDesign = {
  frame: "signature",
  frameColor: "#2563eb",
  qrColor: "#172554",
  paperColor: "#ffffff",
  headline: "منوی دیجیتال",
  caption: "برای مشاهده منو، دوربین را روی کد بگیرید",
  qrSize: 240,
  quietZone: 4,
  showTableName: true,
  showUrl: true,
};

const validFrames = new Set<string>(TABLE_QR_FRAMES.map((item) => item.id));
const validSizes = new Set([180, 200, 220, 240, 260, 280, 300]);
const validQuietZones = new Set([2, 4, 6, 8]);
const color = (value: unknown, fallback: string) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
const text = (value: unknown, fallback: string, max: number) => typeof value === "string" ? value.trim().slice(0, max) : fallback;

function hasQrContrast(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)?.map((part) => parseInt(part, 16) / 255) ?? [0, 0, 0];
  const luminance = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return 1.05 / (luminance + 0.05) >= 4.5;
}

export function normalizeTableQrDesign(value: unknown): TableQrDesign {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const requestedSize = Number(input.qrSize);
  const requestedQuietZone = Number(input.quietZone);
  return {
    frame: typeof input.frame === "string" && validFrames.has(input.frame) ? input.frame as TableQrFrame : DEFAULT_TABLE_QR_DESIGN.frame,
    frameColor: color(input.frameColor, DEFAULT_TABLE_QR_DESIGN.frameColor),
    qrColor: (() => {
      const requested = color(input.qrColor, DEFAULT_TABLE_QR_DESIGN.qrColor);
      return hasQrContrast(requested) ? requested : DEFAULT_TABLE_QR_DESIGN.qrColor;
    })(),
    paperColor: color(input.paperColor, DEFAULT_TABLE_QR_DESIGN.paperColor),
    headline: text(input.headline, DEFAULT_TABLE_QR_DESIGN.headline, 60) || DEFAULT_TABLE_QR_DESIGN.headline,
    caption: text(input.caption, DEFAULT_TABLE_QR_DESIGN.caption, 100) || DEFAULT_TABLE_QR_DESIGN.caption,
    qrSize: validSizes.has(requestedSize) ? requestedSize : DEFAULT_TABLE_QR_DESIGN.qrSize,
    quietZone: validQuietZones.has(requestedQuietZone) ? requestedQuietZone : DEFAULT_TABLE_QR_DESIGN.quietZone,
    showTableName: input.showTableName !== false,
    showUrl: input.showUrl !== false,
  };
}
