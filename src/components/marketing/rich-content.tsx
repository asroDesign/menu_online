export { SiteFooter } from "./site-footer";
import type { ReactNode } from "react";
import { parseRichDocument, safeRichHref } from "@/lib/rich-document";

function inline(text: string) {
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    return m ? <a key={i} href={m[2]} rel="nofollow noopener noreferrer" className="text-primary underline">{m[1]}</a> : part;
  });
}
export function RichContent({ content }: { content: string }) {
  const rich = parseRichDocument(content);
  if (rich) return <div className="rich-article-content max-w-none text-base-content">{rich.content.map((node, i) => renderRichNode(node, `r-${i}`))}</div>;
  const blocks = content.replace(/\r/g, "").split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  return <div className="prose max-w-none text-base-content">
    {blocks.map((block, i) => {
      const lines = block.split("\n");
      if (/^#{1,3} /.test(lines[0])) { const level = lines[0].match(/^#+/)![0].length; const text = lines[0].slice(level + 1); const C = level === 1 ? "h2" : level === 2 ? "h3" : "h4"; return <C key={i} className="mt-8 text-xl font-extrabold">{inline(text)}</C>; }
      if (lines.every(l => /^[-*] /.test(l))) return <ul key={i} className="list-disc space-y-2 pe-6 leading-8">{lines.map((l,j)=><li key={j}>{inline(l.slice(2))}</li>)}</ul>;
      if (lines[0].startsWith("> ")) return <blockquote key={i} className="border-s-4 border-primary px-4 py-2 text-base-content/70">{inline(lines.map(l=>l.replace(/^> ?/,"")).join(" "))}</blockquote>;
      return <p key={i} className="whitespace-pre-line leading-9 text-base-content/80">{inline(block)}</p>;
    })}
  </div>;
}

function renderRichNode(node: import("@/lib/rich-document").RichNode, key: string): ReactNode {
  const children = (node.content ?? []).map((child, i) => renderRichNode(child, `${key}-${i}`));
  if (node.type === "text") {
    let value: ReactNode = node.text ?? "";
    for (const mark of node.marks ?? []) {
      const tag = mark === "bold" ? "strong" : mark === "italic" ? "em" : mark === "underline" ? "u" : mark === "strike" ? "s" : "code";
      value = <>{/* React escapes all editor text; no raw HTML is rendered. */}{tag === "strong" ? <strong>{value}</strong> : tag === "em" ? <em>{value}</em> : tag === "u" ? <u>{value}</u> : tag === "s" ? <s>{value}</s> : <code>{value}</code>}</>;
    }
    return <span key={key} style={node.attrs?.color ? { color: node.attrs.color } : undefined}>{value}</span>;
  }
  if (node.type === "paragraph") return <p key={key} className="my-4 leading-8" style={{ textAlign: node.attrs?.align === "start" ? "right" : node.attrs?.align === "end" ? "left" : node.attrs?.align ?? "right" }}>{children}</p>;
  if (node.type === "heading") {
    const level = node.attrs?.level ?? 2;
    const common = "mb-3 mt-8 font-extrabold leading-relaxed";
    if (level === 2) return <h2 key={key} className={`${common} text-2xl`}>{children}</h2>;
    if (level === 3) return <h3 key={key} className={`${common} text-xl`}>{children}</h3>;
    return <h4 key={key} className={`${common} text-lg`}>{children}</h4>;
  }
  if (node.type === "hardBreak") return <br key={key} />;
  if (node.type === "horizontalRule") return <hr key={key} className="my-8 border-base-300" />;
  if (node.type === "bulletList") return <ul key={key} className="my-4 list-disc space-y-2 pe-7 leading-8">{children}</ul>;
  if (node.type === "orderedList") return <ol key={key} className="my-4 list-decimal space-y-2 pe-7 leading-8">{children}</ol>;
  if (node.type === "listItem") return <li key={key}>{children}</li>;
  if (node.type === "blockquote") return <blockquote key={key} className="my-5 border-s-4 border-primary bg-primary/5 px-5 py-3 leading-8 text-base-content/75">{children}</blockquote>;
  if (node.type === "link") {
    const href = safeRichHref(node.attrs?.href);
    return href ? <a key={key} href={href} rel={href.startsWith("http") ? "nofollow noopener noreferrer" : undefined} className="text-primary underline underline-offset-4">{children}</a> : <>{children}</>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  if (node.type === "image") return <figure key={key} className="my-7"><img src={node.attrs?.src} alt={node.attrs?.alt ?? ""} loading="lazy" className="mx-auto max-h-[720px] w-full rounded-2xl object-contain" />{node.attrs?.alt && <figcaption className="mt-2 text-center text-sm text-base-content/55">{node.attrs.alt}</figcaption>}</figure>;
  if (node.type === "video") return <video key={key} src={node.attrs?.src} controls preload="metadata" className="my-7 max-h-[720px] w-full rounded-2xl bg-black" />;
  if (node.type === "table") return <div key={key} className="my-6 overflow-x-auto rounded-xl border border-base-300"><table className="w-full min-w-[440px] border-collapse text-start">{children}</table></div>;
  if (node.type === "tableRow") return <tr key={key} className="even:bg-base-200/50">{children}</tr>;
  if (node.type === "tableCell") return <td key={key} className="border-b border-base-200 p-3 align-top">{children}</td>;
  return <span key={key}>{children}</span>;
}
