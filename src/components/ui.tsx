"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  cloneElement,
  isValidElement,
  Children,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, Award, Banknote, Bell, Bike, BookOpen, Bot, Building2,
  CalendarDays, Calculator, ChartColumn, ChartPie, Check, ChevronDown, ChevronLeft, ChevronUp,
  CircleCheck, CirclePlus, CircleX, Clock3, Coffee, Coins, Copy, CreditCard, Download, ExternalLink,
  Eye, EyeOff, FileText, Filter, FlaskConical, Globe, Glasses, Grid2X2, Headphones, House, Image as ImageIcon,
  Landmark, Layers, Leaf, Link, List, ListFilter, LockKeyhole, LogOut, Mail, Map, MapPin, Menu,
  MessageCircle, Minus, Monitor, PackageOpen, PenSquare, Phone, Pizza, Plus, Printer, QrCode,
  ReceiptText, RefreshCw, Scale, Search, Settings, ShieldCheck, ShoppingCart, Smartphone, Sparkles,
  Star, Tag, Ticket, Trash2, TrendingUp, TriangleAlert, Truck, Utensils, UserRound, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persianFa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";
import { formatAmountInput, normalizeAmountInput } from "@/lib/amount-format";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- SVG icons ---------- */
const iconComponents: Record<string, LucideIcon> = {
  home: House, orders: ReceiptText, waiter: UserRound, menu: Menu, tag: Tag, table: Grid2X2,
  users: Users, settings: Settings, plus: Plus, minus: Minus, edit: PenSquare, trash: Trash2,
  x: CircleX, search: Search, logout: LogOut, qr: QrCode, external: ExternalLink, check: Check,
  chevronUp: ChevronUp, chevronDown: ChevronDown, chevronLeft: ChevronLeft, cart: ShoppingCart,
  clock: Clock3, copy: Copy, print: Printer, trend: TrendingUp, menuBurger: Menu, sparkle: Sparkles,
  phone: Phone, pin: MapPin, lock: LockKeyhole, box: PackageOpen, pay: CreditCard, utensils: Utensils,
  coffee: Coffee, pizza: Pizza, globe: Globe, shield: ShieldCheck, bell: Bell, chart: ChartColumn,
  calendar: CalendarDays, ticket: Ticket, mobile: Smartphone, truck: Truck, headset: Headphones,
  layers: Layers, building: Building2, map: Map, robot: Bot, wallet: Wallet, leaf: Leaf, star: Star,
  usersCog: Users, clipboard: FileText, filter: ListFilter, download: Download, upload: ArrowUpRight,
  eye: Eye, eyeSlash: EyeOff, arrowLeft: ArrowLeft, arrowRight: ArrowRight, refresh: RefreshCw,
  location: MapPin, list: List, book: BookOpen, calculator: Calculator, scale: Scale,
  message: MessageCircle, envelope: Mail, link: Link, coins: Coins, desktop: Monitor, motorcycle: Bike,
  bank: Landmark, utensil: Utensils, glasses: Glasses, warning: TriangleAlert, circleCheck: CircleCheck,
  circleX: CircleX, plusCircle: CirclePlus, file: FileText, chartPie: ChartPie, sparkles: Sparkles,
  activity: Activity, award: Award, banknote: Banknote, flask: FlaskConical, image: ImageIcon, "credit-card": CreditCard,
};

const emojiIconMap: Record<string, string> = {
  "🏠": "home", "🧾": "orders", "🧑‍🍳": "utensils", "👨‍🍳": "utensils", "👩‍🍳": "utensils",
  "💳": "pay", "🖥️": "desktop", "🪑": "table", "🎟️": "ticket", "🏦": "bank", "🏛️": "bank",
  "👥": "users", "🍽️": "utensils", "🍽": "utensils", "🏷️": "tag", "🧩": "layers", "🌐": "globe",
  "🕶️": "glasses", "🌍": "globe", "🔗": "link", "💎": "star", "🪙": "coins", "📝": "clipboard",
  "✉️": "envelope", "✉": "envelope", "💬": "message", "🤖": "robot", "📒": "book", "💸": "wallet",
  "📊": "chart", "📈": "trend", "🏗️": "building", "📦": "box", "🔄": "refresh", "🔍": "search",
  "🛵": "motorcycle", "🗺️": "map", "📱": "mobile", "🖨️": "print", "☎️": "phone", "☎": "phone",
  "⚖️": "scale", "📢": "bell", "🔔": "bell", "🎧": "headset", "⭐": "star", "⚙️": "settings",
  "🛡️": "shield", "🛡": "shield", "🍳": "utensils", "☕": "coffee", "☕️": "coffee", "🧊": "box",
  "🍕": "pizza", "🍔": "utensils", "🍛": "utensils", "🥗": "leaf", "🍰": "utensils", "🍝": "utensils",
  "🥪": "utensils", "🍣": "utensils", "🥤": "coffee", "🍞": "utensils", "🍨": "utensils", "🌮": "utensils",
  "🫖": "coffee", "🥞": "utensils", "🥛": "coffee", "🍫": "utensils", "🍋": "leaf", "🍹": "coffee",
  "🍓": "leaf", "🍄": "leaf", "🍗": "utensils", "🍟": "utensils", "🍢": "utensils", "🍚": "utensils",
  "🥒": "leaf", "🥬": "leaf", "🍮": "utensils", "🥣": "utensils", "📍": "pin", "💵": "wallet",
  "💰": "wallet", "⏳": "clock", "⏰": "clock", "⚠️": "warning", "⛔": "circleX",
  "✅": "circleCheck", "✔": "check", "🎉": "sparkles", "📣": "bell", "🔒": "lock", "🔌": "desktop",
  "⬇": "download", "▶": "arrowRight", "🛍️": "cart", "🛍": "cart", "✨": "sparkles", "👤": "users",
  "🌸": "leaf", "🙏": "circleCheck", "☆": "star", "＋": "plus", "📜": "file", "📋": "clipboard",
  "🤝": "users", "🛠️": "settings", "🛠": "settings", "📄": "file", "📚": "book", "📖": "book",
  "📅": "calendar", "↩": "arrowLeft", "🏪": "building", "🧪": "flask", "⚗️": "flask", "🧮": "calculator",
  "💡": "sparkles", "🧠": "robot", "🔊": "bell", "🛒": "cart", "🌟": "star",
};

const glyphCodepoints: Record<string, string> = {
  home: "\uf015", orders: "\uf543", utensils: "\uf2e7", pay: "\uf09d", desktop: "\uf108",
  table: "\uf00a", ticket: "\uf145", bank: "\uf19c", users: "\uf0c0", tag: "\uf02b",
  layers: "\uf5fd", globe: "\uf0ac", glasses: "\uf530", link: "\uf0c1", star: "\uf005",
  coins: "\uf51e", clipboard: "\uf46d", envelope: "\uf0e0", message: "\uf27a", robot: "\uf544",
  book: "\uf518", wallet: "\uf555", chart: "\uf080", trend: "\uf201", building: "\uf1ad",
  box: "\uf466", refresh: "\uf2f1", search: "\uf002", motorcycle: "\uf21c", map: "\uf279",
  mobile: "\uf3cd", print: "\uf02f", phone: "\uf095", scale: "\uf24e", bell: "\uf0f3",
  headset: "\uf590", settings: "\uf013", shield: "\uf3ed", coffee: "\uf0f4", pizza: "\uf818",
  leaf: "\uf06c", pin: "\uf3c5", clock: "\uf017", circleX: "\uf057", circleCheck: "\uf058",
  check: "\uf00c", sparkles: "\uf890", lock: "\uf023", cart: "\uf07a", download: "\uf019",
  arrowRight: "\uf061", arrowLeft: "\uf060", file: "\uf15c", calendar: "\uf073", flask: "\uf0c3",
  calculator: "\uf1ec", warning: "\uf071", eye: "\uf06e",
};

const legacyGlyphNames = Object.fromEntries(Object.entries(glyphCodepoints).map(([name, glyph]) => [glyph, name]));

export function iconName(value: string | null | undefined) {
  if (!value) return "utensils";
  if (iconComponents[value]) return value;
  const emoji = emojiIconMap[value] ?? emojiIconMap[[...value].find((c) => emojiIconMap[c]) ?? ""];
  return emoji ?? legacyGlyphNames[value] ?? "utensils";
}

/** Kept for callers that pass a category/product glyph into ProductThumb. */
export function iconGlyph(value: string | null | undefined) {
  return iconName(value);
}

export function Icon({ name, className = "size-5" }: { name: string; className?: string }) {
  const Glyph = iconComponents[iconName(name)] ?? iconComponents.box;
  return <Glyph className={cn("inline-block shrink-0", className)} aria-hidden="true" strokeWidth={1.9} />;
}

export function EmojiIcon({ emoji, className }: { emoji: string | null | undefined; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-flex size-[1em] shrink-0 items-center justify-center align-[-0.15em]", className)}><Icon name={iconName(emoji)} className="size-full" /></span>;
}

/** Converts legacy Font Awesome private-use characters in text into Lucide SVGs. */
function renderLegacyIcons(value: ReactNode): ReactNode {
  if (typeof value === "string") {
    return value.split(/([\uE000-\uF8FF])/u).map((part, index) =>
      /^[\uE000-\uF8FF]$/u.test(part) ? <EmojiIcon key={`${part}-${index}`} emoji={part} /> : part,
    );
  }
  if (Array.isArray(value)) return value.map(renderLegacyIcons);
  if (isValidElement<{ children?: ReactNode }>(value) && value.props.children !== undefined) {
    if (value.type === "option") {
      const clean = (node: ReactNode): ReactNode => typeof node === "string"
        ? node.replace(/[\uE000-\uF8FF]/gu, "")
        : Array.isArray(node) ? node.map(clean) : node;
      return cloneElement(value, undefined, clean(value.props.children));
    }
    return cloneElement(value, undefined, renderLegacyIcons(value.props.children));
  }
  return value;
}

export function IconText({ children }: { children: ReactNode }) {
  return <>{renderLegacyIcons(Children.toArray(children))}</>;
}

/* ---------- Button ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "dark";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  const variants = {
    primary: "btn-primary",
    secondary: "bg-white text-base-content ring-1 ring-base-300 hover:bg-base-200 active:bg-base-300",
    ghost: "btn-ghost text-base-content/75 hover:bg-base-200",
    danger: "btn-error text-white",
    dark: "btn-neutral text-white",
  };
  const sizes = { sm: "btn-sm h-9 px-3 text-xs gap-1.5", md: "btn-md h-10 px-4 text-sm gap-2", lg: "btn-lg h-12 px-6 text-base gap-2" };
  return (
    <button
      className={cn(
        "btn inline-flex items-center justify-center rounded-xl font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      <IconText>{children}</IconText>
    </button>
  );
}

export function IconButton({
  icon,
  label,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "btn btn-ghost btn-square btn-sm inline-flex size-9 items-center justify-center rounded-xl text-base-content/65 transition hover:bg-base-200 hover:text-base-content disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} className="size-[18px]" />
    </button>
  );
}

/* ---------- Form controls ---------- */
const controlCls =
  "w-full border-base-300 bg-base-100 text-sm text-base-content transition placeholder:text-base-content/40 focus:border-primary focus:outline-none disabled:bg-base-200";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("input input-bordered h-10", controlCls, className)} {...rest} />;
}

type AmountInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "inputMode"> & {
  value: string | number | null | undefined;
  onValueChange: (value: string) => void;
  inputMode?: "numeric" | "decimal";
  allowNegative?: boolean;
};

/** Amount entry with grouped Persian digits; onValueChange always receives plain ASCII digits. */
export function AmountInput({ value, onValueChange, inputMode = "numeric", allowNegative = false, ...rest }: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingDigitOffset = useRef<number | null>(null);
  const [negativeSignDraft, setNegativeSignDraft] = useState(false);
  const displayValue = negativeSignDraft ? "-" : formatAmountInput(value, allowNegative);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const offset = pendingDigitOffset.current;
    if (!input || offset === null) return;

    if (input === document.activeElement) {
      if (offset === 0) input.setSelectionRange(allowNegative && displayValue.startsWith("-") ? 1 : 0, allowNegative && displayValue.startsWith("-") ? 1 : 0);
      else {
        let seen = 0;
        let cursor = displayValue.length;
        for (let index = 0; index < displayValue.length; index++) {
          if (normalizeAmountInput(displayValue[index]).length > 0 && ++seen >= offset) {
            cursor = index + 1;
            break;
          }
        }
        input.setSelectionRange(cursor, cursor);
      }
    }
    pendingDigitOffset.current = null;
  });

  return <input
    {...rest}
    ref={inputRef}
    type="text"
    inputMode={inputMode}
    data-amount-input="true"
    className={cn("input input-bordered h-10", controlCls, rest.className)}
    value={displayValue}
    onChange={(event) => {
      const typed = event.currentTarget.value;
      const caret = event.currentTarget.selectionStart ?? typed.length;
      pendingDigitOffset.current = normalizeAmountInput(typed.slice(0, caret), allowNegative).replace(/^-/, "").length;
      const normalized = normalizeAmountInput(typed, allowNegative);
      if (allowNegative && normalized === "-") {
        setNegativeSignDraft(true);
        return;
      }
      setNegativeSignDraft(false);
      onValueChange(normalized);
    }}
  />;
}

const twoDigits = (n: number) => String(n).padStart(2, "0");
const localDateValue = (date: Date) => `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;

export function PersianDateInput({
  value,
  onChange,
  withTime = false,
  className,
  placeholder,
  disabled,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const day = value.slice(0, 10);
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = (withTime ? value.slice(11, 16) || "00:00" : "00:00").split(":").map(Number);
  const selected = year && month && date ? new Date(year, month - 1, date, hour || 0, minute || 0) : null;

  function selectDate(next: DateObject | null | false) {
    if (!next) {
      onChange("");
      return;
    }
    const picked = next.toDate();
    const dateValue = localDateValue(picked);
    onChange(withTime ? `${dateValue}T${value.slice(11, 16) || "00:00"}` : dateValue);
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div className="jalali-picker min-w-0 flex-1">
        <DatePicker
          calendar={persian}
          locale={persianFa}
          value={selected}
          onChange={selectDate}
          format="YYYY/MM/DD"
          inputClass="input input-bordered !h-10 !w-full border-base-300 bg-base-100 text-sm text-base-content focus:border-primary focus:outline-none"
          containerStyle={{ display: "block", width: "100%" }}
          placeholder={placeholder ?? "انتخاب تاریخ شمسی"}
          calendarPosition="bottom-right"
          editable={false}
          disabled={disabled}
          required={required}
          zIndex={1200}
        />
      </div>
      {withTime && (
        <Input
          type="time"
          aria-label="ساعت"
          className="!w-28 shrink-0 text-center"
          value={value.slice(11, 16)}
          disabled={disabled}
          onChange={(event) => {
            const dateValue = day || localDateValue(new Date());
            onChange(event.target.value ? `${dateValue}T${event.target.value}` : dateValue);
          }}
        />
      )}
      {value && !disabled && (
        <button type="button" aria-label="پاک کردن تاریخ" title="پاک کردن تاریخ" onClick={() => onChange("")} className="btn btn-ghost btn-square btn-sm size-9 shrink-0 text-base-content/55 hover:text-error">
          <Icon name="x" className="size-4" />
        </button>
      )}
    </div>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("textarea textarea-bordered min-h-24", controlCls, "py-2.5", className)} {...rest} />;
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("select select-bordered h-10", controlCls, "appearance-none bg-no-repeat pe-3 ps-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold text-stone-600">{label}</span>
      <IconText>{children}</IconText>
      {hint && <span className="mt-1 block text-[11px] text-stone-400">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean;
}) {
  return <input type="checkbox" className="toggle toggle-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} disabled={disabled} />;
}

/* ---------- Layout bits ---------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card border border-base-300/70 bg-base-100 shadow-sm", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="border-r-4 border-primary pe-3 text-xl font-extrabold text-base-content sm:text-2xl"><IconText>{title}</IconText></h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const badgeColors: Record<string, string> = {
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  stone: "bg-stone-100 text-stone-600 ring-stone-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
};
export function Badge({ color = "stone", children, className }: { color?: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "badge badge-soft inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        badgeColors[color] ?? badgeColors.stone,
        className,
      )}
    >
      <IconText>{children}</IconText>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function EmptyState({
  icon = "box",
  emoji,
  title,
  description,
  action,
}: {
  icon?: string;
  emoji?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-200 bg-white/60 px-6 py-14 text-center animate-fade-in">
      <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        {emoji ? <EmojiIcon emoji={emoji} className="text-3xl" /> : <Icon name={icon} className="size-8" />}
      </div>
      <h3 className="text-base font-bold text-stone-800"><IconText>{title}</IconText></h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-6 text-stone-500"><IconText>{description}</IconText></p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl bg-rose-50 p-6 text-center ring-1 ring-rose-200">
      <p className="text-sm font-medium text-rose-700"><IconText>{message}</IconText></p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          تلاش دوباره
        </Button>
      )}
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  description,
  theme = "default",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  theme?: "default" | "dark";
}) {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      const preferred = dialog?.querySelector<HTMLElement>("[autofocus]");
      const first = dialog?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      (preferred ?? first ?? dialog)?.focus();
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open || !mounted) return null;
  const dark = theme === "dark";
  const widths = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-6xl" };
  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <button type="button" tabIndex={-1} aria-label="بستن پنجره" className={cn("absolute inset-0 cursor-default animate-fade-in backdrop-blur-[3px]", dark ? "bg-[#02040d]/80 backdrop-blur-md" : "bg-slate-950/55")} onClick={onClose} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={size === "xl" ? { maxWidth: "72rem" } : undefined}
        className={cn(
          "modal-box relative flex max-h-[min(92dvh,56rem)] w-full !overflow-hidden !p-0 animate-slide-up flex-col rounded-t-3xl outline-none sm:rounded-3xl",
          dark ? "border border-indigo-100/15 bg-[#080d20] text-[#f4f7ff] shadow-[0_28px_100px_-24px_rgba(3,7,20,.9)]" : "border border-white/70 bg-base-100 text-base-content shadow-[0_24px_80px_-20px_rgba(15,23,42,.42)]",
          widths[size],
        )}
      >
        <div className={cn("relative flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-6 sm:py-4", dark ? "border-indigo-100/10 bg-gradient-to-l from-[#172344] via-[#101a32] to-[#0b1328]" : "border-base-200 bg-gradient-to-l from-brand-50/70 via-base-100 to-base-100")}>
          <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l to-transparent", dark ? "from-cyan-300 via-indigo-400" : "from-brand-500 via-sky-400")} />
          <div className="min-w-0">
            <h2 className={cn("truncate text-base font-extrabold sm:text-lg", dark ? "text-white" : "text-base-content")}><IconText>{title}</IconText></h2>
            {description && <p className={cn("mt-1 text-xs leading-5 sm:text-sm", dark ? "text-indigo-100/65" : "text-base-content/60")}>{description}</p>}
          </div>
          <IconButton icon="x" label="بستن" onClick={onClose} className={cn("size-10 shrink-0 rounded-xl ring-1", dark ? "bg-[#101a32] text-indigo-100/75 ring-indigo-100/15 hover:bg-[#1b294b] hover:text-white" : "bg-base-100/80 text-base-content/65 ring-base-300 hover:bg-base-200")} />
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5", dark && "text-[#eef4ff]")}>{children}</div>
        {footer && <div className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-3.5", dark ? "border-indigo-100/10 bg-[#0b1328]/95" : "border-base-200 bg-base-100/95")}>{footer}</div>}
      </div>
    </div>
  ), document.body);
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "حذف",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description="پیش از ادامه، پیامد این عملیات را بررسی کنید."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-7 text-stone-600">{message}</p>
    </Modal>
  );
}

/* ---------- Toasts ---------- */
type Toast = { id: number; type: "success" | "error"; message: string };
const ToastCtx = createContext<(message: string, type?: Toast["type"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "alert pointer-events-auto flex max-w-sm animate-pop items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl",
              t.type === "success" ? "bg-stone-900" : "bg-rose-600",
            )}
          >
            <Icon name={t.type === "success" ? "check" : "x"} className="size-4" />
            <IconText>{t.message}</IconText>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Product visual ---------- */
export function ProductThumb({ imageUrl, emoji, className }: { imageUrl?: string; emoji: string; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-br from-brand-100 to-amber-50", className)}>
      {imageUrl && imageUrl !== failedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(imageUrl)} className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-primary"><EmojiIcon emoji={emoji} className="text-4xl" /></div>
      )}
    </div>
  );
}

export const FOOD_IMAGES = [
  { key: "breakfast", label: "صبحانه" },
  { key: "coffee", label: "قهوه" },
  { key: "cold", label: "نوشیدنی سرد" },
  { key: "pizza", label: "پیتزا" },
  { key: "burger", label: "برگر" },
  { key: "persian", label: "ایرانی" },
  { key: "salad", label: "سالاد" },
  { key: "dessert", label: "دسر" },
];
