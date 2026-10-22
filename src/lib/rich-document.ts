export const RICH_DOCUMENT_FORMAT = "menupeak-rich-v1" as const;

export type RichMark = "bold" | "italic" | "underline" | "strike" | "code";
export type RichNodeType =
  | "text" | "paragraph" | "heading" | "hardBreak" | "horizontalRule"
  | "bulletList" | "orderedList" | "listItem" | "blockquote" | "link"
  | "image" | "video" | "table" | "tableRow" | "tableCell";
export type RichNode = {
  type: RichNodeType;
  text?: string;
  marks?: RichMark[];
  attrs?: { level?: number; href?: string; src?: string; alt?: string; title?: string; align?: "start" | "center" | "end"; color?: string };
  content?: RichNode[];
};
export type RichDocument = { format: typeof RICH_DOCUMENT_FORMAT; content: RichNode[] };

const NODE_TYPES = new Set<RichNodeType>([
  "text", "paragraph", "heading", "hardBreak", "horizontalRule", "bulletList", "orderedList",
  "listItem", "blockquote", "link", "image", "video", "table", "tableRow", "tableCell",
]);
const MARKS = new Set<RichMark>(["bold", "italic", "underline", "strike", "code"]);

export function safeRichHref(value: unknown): string {
  if (typeof value !== "string") return "";
  const href = value.trim().slice(0, 1000);
  if (!href || /[\u0000-\u0020\\]/.test(href)) return "";
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? href : "";
  } catch {
    return "";
  }
}

export function safeRichMediaSrc(value: unknown): string {
  if (typeof value !== "string") return "";
  const src = value.trim().slice(0, 1000);
  if (/^\/api\/files\/[a-f0-9]{24}$/.test(src)) return src;
  try {
    const url = new URL(src);
    return ["http:", "https:"].includes(url.protocol) ? src : "";
  } catch {
    return "";
  }
}

function cleanNode(value: unknown, depth = 0): RichNode | null {
  if (!value || typeof value !== "object" || depth > 20) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.type !== "string" || !NODE_TYPES.has(row.type as RichNodeType)) return null;
  const type = row.type as RichNodeType;
  if (type === "text") {
    if (typeof row.text !== "string") return null;
    const marks = Array.isArray(row.marks) ? [...new Set(row.marks.filter((mark): mark is RichMark => typeof mark === "string" && MARKS.has(mark as RichMark)))] : [];
    const attrs: RichNode["attrs"] = {};
    const color = (row.attrs as Record<string, unknown> | undefined)?.color;
    if (typeof color === "string" && /^#[a-f0-9]{3}(?:[a-f0-9]{3})?$/i.test(color)) attrs.color = color;
    return { type, text: row.text.slice(0, 20_000), ...(marks.length ? { marks } : {}), ...(Object.keys(attrs).length ? { attrs } : {}) };
  }
  const rawAttrs = row.attrs && typeof row.attrs === "object" ? row.attrs as Record<string, unknown> : {};
  const attrs: RichNode["attrs"] = {};
  if (type === "heading") attrs.level = Math.max(2, Math.min(4, Math.round(Number(rawAttrs.level) || 2)));
  if (type === "link") attrs.href = safeRichHref(rawAttrs.href);
  if (type === "image" || type === "video") {
    attrs.src = safeRichMediaSrc(rawAttrs.src);
    if (!attrs.src) return null;
    if (type === "image") attrs.alt = typeof rawAttrs.alt === "string" ? rawAttrs.alt.slice(0, 300) : "";
    if (typeof rawAttrs.title === "string") attrs.title = rawAttrs.title.slice(0, 300);
  }
  if (type === "paragraph" && ["start", "center", "end"].includes(String(rawAttrs.align))) attrs.align = rawAttrs.align as "start" | "center" | "end";
  const content = Array.isArray(row.content) ? row.content.slice(0, 2000).map((child) => cleanNode(child, depth + 1)).filter((child): child is RichNode => !!child) : [];
  if (type === "link" && !attrs.href) return { type: "paragraph", content };
  return { type, ...(Object.keys(attrs).length ? { attrs } : {}), ...(content.length ? { content } : {}) };
}

export function parseRichDocument(value: string): RichDocument | null {
  if (typeof value !== "string" || value.length > 250_000) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed?.format !== RICH_DOCUMENT_FORMAT) return null;
    const content = Array.isArray(parsed.content) ? parsed.content.slice(0, 2000).map((node) => cleanNode(node)).filter((node): node is RichNode => !!node) : [];
    return { format: RICH_DOCUMENT_FORMAT, content };
  } catch {
    return null;
  }
}

export function serializeRichDocument(content: RichNode[]): string {
  const nodes = content.slice(0, 2000).map((node) => cleanNode(node)).filter((node): node is RichNode => !!node);
  return JSON.stringify({ format: RICH_DOCUMENT_FORMAT, content: nodes });
}

export function normalizeRichContent(value: unknown, maxLength = 250_000): string {
  const raw = typeof value === "string" ? value : "";
  const rich = parseRichDocument(raw);
  return rich ? JSON.stringify(rich) : raw.slice(0, maxLength);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function richDocumentToEditorHtml(document: RichDocument): string {
  const render = (nodes: RichNode[]): string => nodes.map((node) => {
    const children = render(node.content ?? []);
    if (node.type === "text") {
      let text = escapeHtml(node.text ?? "");
      if (node.attrs?.color && /^#[a-f0-9]{3}(?:[a-f0-9]{3})?$/i.test(node.attrs.color)) text = `<span style="color:${node.attrs.color}">${text}</span>`;
      for (const mark of node.marks ?? []) {
        const tag = mark === "bold" ? "strong" : mark === "italic" ? "em" : mark === "underline" ? "u" : mark === "strike" ? "s" : "code";
        text = `<${tag}>${text}</${tag}>`;
      }
      return text;
    }
    if (node.type === "paragraph") return `<p${node.attrs?.align ? ` style="text-align:${node.attrs.align === "start" ? "right" : node.attrs.align === "end" ? "left" : "center"}"` : ""}>${children || "<br>"}</p>`;
    if (node.type === "heading") return `<h${node.attrs?.level ?? 2}>${children}</h${node.attrs?.level ?? 2}>`;
    if (node.type === "hardBreak") return "<br>";
    if (node.type === "horizontalRule") return "<hr>";
    if (node.type === "bulletList") return `<ul>${children}</ul>`;
    if (node.type === "orderedList") return `<ol>${children}</ol>`;
    if (node.type === "listItem") return `<li>${children}</li>`;
    if (node.type === "blockquote") return `<blockquote>${children}</blockquote>`;
    if (node.type === "link") return `<a href="${escapeHtml(safeRichHref(node.attrs?.href ?? ""))}">${children}</a>`;
    if (node.type === "image") return `<p><img src="${escapeHtml(safeRichMediaSrc(node.attrs?.src ?? ""))}" alt="${escapeHtml(node.attrs?.alt ?? "")}"></p>`;
    if (node.type === "video") return `<p><video controls preload="metadata" src="${escapeHtml(safeRichMediaSrc(node.attrs?.src ?? ""))}"></video></p>`;
    if (node.type === "table") return `<table><tbody>${children}</tbody></table>`;
    if (node.type === "tableRow") return `<tr>${children}</tr>`;
    if (node.type === "tableCell") return `<td>${children}</td>`;
    return children;
  }).join("");
  return render(document.content);
}
