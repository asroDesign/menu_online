"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type MouseEvent, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Code2, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Strikethrough, Table2, Underline, Undo2, Video, Eye, Pencil } from "lucide-react";
import { RichContent } from "@/components/marketing/rich-content";
import { Button, ToastProvider, useToast } from "@/components/ui";
import { parseRichDocument, richDocumentToEditorHtml, serializeRichDocument, safeRichHref, type RichNode } from "@/lib/rich-document";

type Props = { value: string; onChange: (value: string) => void };

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }
function safeEditorColor(value: string) {
  if (/^#[a-f0-9]{3}(?:[a-f0-9]{3})?$/i.test(value)) return value;
  const match = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (!match) return undefined;
  return `#${match.slice(1, 4).map((channel) => Math.max(0, Math.min(255, Number(channel))).toString(16).padStart(2, "0")).join("")}`;
}

function legacyMarkdownHtml(value: string) {
  const inline = (text: string) => escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  const blocks = value.replace(/\r/g, "").split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n");
    const heading = lines[0].match(/^(#{1,4})\s+(.*)$/);
    if (heading) { const level = Math.min(4, Math.max(2, heading[1].length)); return `<h${level}>${inline(heading[2])}</h${level}>`; }
    if (lines.every((line) => /^[-*] /.test(line))) return `<ul>${lines.map((line) => `<li>${inline(line.slice(2))}</li>`).join("")}</ul>`;
    if (lines.every((line) => /^\d+\. /.test(line))) return `<ol>${lines.map((line) => `<li>${inline(line.replace(/^\d+\. /, ""))}</li>`).join("")}</ol>`;
    if (lines[0].startsWith("> ")) return `<blockquote><p>${inline(lines.map((line) => line.replace(/^> ?/, "")).join(" "))}</p></blockquote>`;
    return `<p>${lines.map(inline).join("<br>")}</p>`;
  }).join("");
}

function inlineNodes(parent: ParentNode, marks: RichNode["marks"] = [], inheritedColor?: string): RichNode[] {
  const result: RichNode[] = [];
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent) result.push({ type: "text", text: child.textContent, ...(marks?.length ? { marks: [...new Set(marks)] } : {}), ...(inheritedColor ? { attrs: { color: inheritedColor } } : {}) });
      continue;
    }
    if (!(child instanceof HTMLElement)) continue;
    const tag = child.tagName.toLowerCase();
    if (["script", "style", "iframe", "object", "embed", "svg", "math", "form", "input", "button"].includes(tag)) continue;
    if (tag === "br") { result.push({ type: "hardBreak" }); continue; }
    if (tag === "img") { result.push({ type: "image", attrs: { src: child.getAttribute("src") ?? "", alt: child.getAttribute("alt") ?? "" } }); continue; }
    if (tag === "video") {
      result.push({ type: "video", attrs: { src: child.getAttribute("src") ?? child.querySelector("source")?.getAttribute("src") ?? "", title: child.getAttribute("title") ?? "" } });
      continue;
    }
    if (tag === "hr") { result.push({ type: "horizontalRule" }); continue; }
    if (tag === "a") {
      const content = inlineNodes(child, marks, inheritedColor);
      const href = safeRichHref(child.getAttribute("href"));
      result.push(...(href ? [{ type: "link", attrs: { href }, content } as RichNode] : content));
      continue;
    }
    const nextMarks = [...(marks ?? [])];
    const ownColor = safeEditorColor(child.style.color || (tag === "font" ? child.getAttribute("color") ?? "" : ""));
    const nextColor = ownColor ?? inheritedColor;
    if (["b", "strong"].includes(tag)) nextMarks.push("bold");
    if (["i", "em"].includes(tag)) nextMarks.push("italic");
    if (tag === "u") nextMarks.push("underline");
    if (["s", "strike", "del"].includes(tag)) nextMarks.push("strike");
    if (tag === "code") nextMarks.push("code");
    result.push(...inlineNodes(child, nextMarks, nextColor));
  }
  return result;
}

function blockNodes(parent: ParentNode): RichNode[] {
  const result: RichNode[] = [];
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? "";
      if (text.trim()) result.push({ type: "paragraph", content: [{ type: "text", text }] });
      continue;
    }
    if (!(child instanceof HTMLElement)) continue;
    const tag = child.tagName.toLowerCase();
    if (["script", "style", "iframe", "object", "embed", "svg", "math", "form"].includes(tag)) continue;
    if (tag === "p" || tag === "div") {
      const alignment = child.style.textAlign === "center" ? "center" : child.style.textAlign === "left" ? "end" : child.style.textAlign === "right" ? "start" : undefined;
      result.push({ type: "paragraph", ...(alignment ? { attrs: { align: alignment } } : {}), content: inlineNodes(child) });
    } else if (/^h[1-6]$/.test(tag)) {
      const level = Math.max(2, Math.min(4, Number(tag.slice(1))));
      result.push({ type: "heading", attrs: { level }, content: inlineNodes(child) });
    } else if (tag === "ul" || tag === "ol") {
      const content = Array.from(child.children).filter((el) => el.tagName.toLowerCase() === "li").map((li) => ({ type: "listItem", content: blockNodes(li) } as RichNode));
      result.push({ type: tag === "ul" ? "bulletList" : "orderedList", content });
    } else if (tag === "li") result.push({ type: "listItem", content: blockNodes(child) });
    else if (tag === "blockquote") result.push({ type: "blockquote", content: blockNodes(child) });
    else if (tag === "table") result.push({ type: "table", content: blockNodes(child) });
    else if (tag === "tbody" || tag === "thead" || tag === "tfoot") result.push(...blockNodes(child));
    else if (tag === "tr") result.push({ type: "tableRow", content: Array.from(child.children).filter((el) => ["td", "th"].includes(el.tagName.toLowerCase())).map((cell) => ({ type: "tableCell", content: inlineNodes(cell) } as RichNode)) });
    else if (tag === "img") result.push({ type: "image", attrs: { src: child.getAttribute("src") ?? "", alt: child.getAttribute("alt") ?? "" } });
    else if (tag === "video") result.push({ type: "video", attrs: { src: child.getAttribute("src") ?? child.querySelector("source")?.getAttribute("src") ?? "", title: child.getAttribute("title") ?? "" } });
    else if (tag === "hr") result.push({ type: "horizontalRule" });
    else {
      const inline = inlineNodes(child);
      if (inline.length) result.push({ type: "paragraph", content: inline });
    }
  }
  return result;
}

function htmlToDocument(html: string) {
  const body = new DOMParser().parseFromString(html.slice(0, 60_000), "text/html").body;
  return serializeRichDocument(blockNodes(body));
}

function ToolButton({ title, onMouseDown, children, disabled = false }: { title: string; onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void; children: ReactNode; disabled?: boolean }) {
  return <button type="button" title={title} aria-label={title} disabled={disabled} onMouseDown={onMouseDown} className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-base-300 bg-base-100 text-base-content/70 transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-40">{children}</button>;
}

function Editor({ value, onChange }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<Range | null>(null);
  const lastValue = useRef<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState(false);
  const [counts, setCounts] = useState({ words: 0, chars: 0 });

  useEffect(() => {
    if (lastValue.current === value) return;
    const parsed = parseRichDocument(value);
    const html = parsed ? richDocumentToEditorHtml(parsed) : legacyMarkdownHtml(value);
    if (editorRef.current) editorRef.current.innerHTML = html;
    lastValue.current = value;
    const text = editorRef.current?.innerText ?? "";
    setCounts({ words: text.trim() ? text.trim().split(/\s+/).length : 0, chars: text.length });
  }, [value]);

  function rememberSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editorRef.current?.contains(selection.anchorNode)) return;
    rangeRef.current = selection.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    editorRef.current?.focus();
    const selection = window.getSelection();
    if (!selection || !rangeRef.current) return;
    selection.removeAllRanges();
    selection.addRange(rangeRef.current);
  }
  function publish() {
    const editor = editorRef.current;
    if (!editor) return;
    rememberSelection();
    const next = htmlToDocument(editor.innerHTML);
    lastValue.current = next;
    const text = editor.innerText ?? "";
    setCounts({ words: text.trim() ? text.trim().split(/\s+/).length : 0, chars: text.length });
    onChange(next);
  }
  function command(name: string, argument?: string) {
    restoreSelection();
    document.execCommand(name, false, argument);
    publish();
  }
  function insertHtml(html: string) {
    restoreSelection();
    document.execCommand("insertHTML", false, html);
    publish();
  }
  async function uploadInline(file?: File, kind?: "image" | "video") {
    if (!file || !kind) return;
    if (kind === "image" && !file.type.startsWith("image/")) { toast("فایل انتخاب‌شده تصویر نیست", "error"); return; }
    if (kind === "video" && !["video/mp4", "video/webm"].includes(file.type)) { toast("فقط ویدیوی MP4 یا WebM مجاز است", "error"); return; }
    setBusy(kind);
    try {
      const response = await fetch("/api/admin/media", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }, body: await file.arrayBuffer() });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") throw new Error(data.error || "بارگذاری ناموفق بود");
      const url = escapeHtml(data.url);
      if (kind === "image") insertHtml(`<p><img src="${url}" alt="${escapeHtml(file.name.replace(/\.[^.]+$/, ""))}"></p><p><br></p>`);
      else insertHtml(`<p><video controls preload="metadata" src="${url}"></video></p><p><br></p>`);
      toast(kind === "image" ? "تصویر در متن قرار گرفت" : "ویدیو در متن قرار گرفت");
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setBusy(""); }
  }
  function paste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    if (html) {
      const safe = htmlToDocument(html);
      const parsed = parseRichDocument(safe);
      if (parsed) insertHtml(richDocumentToEditorHtml(parsed));
    } else document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    publish();
  }
  function createLink() {
    const href = window.prompt("نشانی پیوند (https:// یا مسیر داخلی)");
    if (!href) return;
    const safe = safeRichHref(href);
    if (!safe) { toast("نشانی پیوند معتبر نیست", "error"); return; }
    command("createLink", safe);
  }
  return <div className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 bg-base-200/60 px-3 py-2"><div><p className="text-sm font-bold">متن کامل</p><p className="mt-0.5 text-[11px] text-base-content/55">قالب‌بندی، جدول، پیوند و رسانهٔ درون‌متنی</p></div><div className="join"><Button type="button" size="sm" variant={!preview ? "primary" : "ghost"} className="join-item" onClick={() => setPreview(false)}><Pencil className="me-1 size-3.5"/>ویرایش</Button><Button type="button" size="sm" variant={preview ? "primary" : "ghost"} className="join-item" onClick={() => { publish(); setPreview(true); }}><Eye className="me-1 size-3.5"/>پیش‌نمایش</Button></div></div>
    {!preview && <>
      <div role="toolbar" aria-label="ابزارهای ویرایش متن" className="flex flex-wrap items-center gap-1 border-b border-base-300 bg-base-200/30 p-2">
        <ToolButton title="بازگشت" onMouseDown={(e) => { e.preventDefault(); command("undo"); }}><Undo2 className="size-4"/></ToolButton>
        <ToolButton title="تکرار" onMouseDown={(e) => { e.preventDefault(); command("redo"); }}><Redo2 className="size-4"/></ToolButton>
        <span className="mx-1 h-6 border-s border-base-300"/>
        <ToolButton title="پررنگ" onMouseDown={(e) => { e.preventDefault(); command("bold"); }}><Bold className="size-4"/></ToolButton>
        <ToolButton title="ایتالیک" onMouseDown={(e) => { e.preventDefault(); command("italic"); }}><Italic className="size-4"/></ToolButton>
        <ToolButton title="زیرخط" onMouseDown={(e) => { e.preventDefault(); command("underline"); }}><Underline className="size-4"/></ToolButton>
        <ToolButton title="خط‌خورده" onMouseDown={(e) => { e.preventDefault(); command("strikeThrough"); }}><Strikethrough className="size-4"/></ToolButton>
        <ToolButton title="کد" onMouseDown={(e) => { e.preventDefault(); command("formatBlock", "pre"); }}><Code2 className="size-4"/></ToolButton>
        <ToolButton title="عنوان سطح ۲" onMouseDown={(e) => { e.preventDefault(); command("formatBlock", "h2"); }}><Heading2 className="size-4"/></ToolButton>
        <ToolButton title="عنوان سطح ۳" onMouseDown={(e) => { e.preventDefault(); command("formatBlock", "h3"); }}><Heading3 className="size-4"/></ToolButton>
        <ToolButton title="فهرست نشانه‌دار" onMouseDown={(e) => { e.preventDefault(); command("insertUnorderedList"); }}><List className="size-4"/></ToolButton>
        <ToolButton title="فهرست شماره‌دار" onMouseDown={(e) => { e.preventDefault(); command("insertOrderedList"); }}><ListOrdered className="size-4"/></ToolButton>
        <ToolButton title="نقل‌قول" onMouseDown={(e) => { e.preventDefault(); command("formatBlock", "blockquote"); }}><Quote className="size-4"/></ToolButton>
        <ToolButton title="راست‌چین" onMouseDown={(e) => { e.preventDefault(); command("justifyRight"); }}><AlignRight className="size-4"/></ToolButton>
        <ToolButton title="وسط‌چین" onMouseDown={(e) => { e.preventDefault(); command("justifyCenter"); }}><AlignCenter className="size-4"/></ToolButton>
        <ToolButton title="چپ‌چین" onMouseDown={(e) => { e.preventDefault(); command("justifyLeft"); }}><AlignLeft className="size-4"/></ToolButton>
        <ToolButton title="پیوند" onMouseDown={(e) => { e.preventDefault(); createLink(); }}><Link2 className="size-4"/></ToolButton>
        <ToolButton title="خط جداکننده" onMouseDown={(e) => { e.preventDefault(); command("insertHorizontalRule"); }}><Minus className="size-4"/></ToolButton>
        <ToolButton title="جدول ۳×۳" onMouseDown={(e) => { e.preventDefault(); insertHtml("<table><tbody><tr><td>سرستون</td><td>سرستون</td><td>سرستون</td></tr><tr><td>متن</td><td>متن</td><td>متن</td></tr><tr><td>متن</td><td>متن</td><td>متن</td></tr></tbody></table><p><br></p>"); }}><Table2 className="size-4"/></ToolButton>
        <label title="رنگ متن" className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-base-300 bg-base-100 text-sm font-black text-primary">A<input type="color" className="sr-only" onMouseDown={rememberSelection} onChange={(e) => command("foreColor", e.target.value)}/></label>
        <label title="بارگذاری و درج تصویر" className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-base-300 bg-base-100 text-base-content/70 hover:text-primary"><ImagePlus className="size-4"/><input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={!!busy} onMouseDown={rememberSelection} onChange={(e) => { void uploadInline(e.target.files?.[0], "image"); e.currentTarget.value = ""; }}/></label>
        <label title="بارگذاری و درج ویدیو" className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-base-300 bg-base-100 text-base-content/70 hover:text-primary"><Video className="size-4"/><input ref={videoInput} type="file" accept="video/mp4,video/webm" className="sr-only" disabled={!!busy} onMouseDown={rememberSelection} onChange={(e) => { void uploadInline(e.target.files?.[0], "video"); e.currentTarget.value = ""; }}/></label>
        {busy && <span className="px-2 text-xs font-semibold text-primary">{busy === "image" ? "در حال بارگذاری تصویر…" : "در حال بارگذاری ویدیو…"}</span>}
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning role="textbox" aria-label="متن مقاله" aria-multiline="true" dir="rtl" onInput={publish} onKeyUp={rememberSelection} onMouseUp={rememberSelection} onPaste={paste} className="min-h-[400px] max-h-[70vh] overflow-y-auto px-5 py-5 text-base leading-8 outline-none sm:min-h-[520px] [&_a]:text-primary [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-s-4 [&_blockquote]:border-primary [&_blockquote]:bg-primary/5 [&_blockquote]:px-4 [&_blockquote]:py-2 [&_h2]:my-5 [&_h2]:text-2xl [&_h2]:font-extrabold [&_h3]:my-4 [&_h3]:text-xl [&_h3]:font-bold [&_img]:mx-auto [&_img]:my-5 [&_img]:max-h-[520px] [&_img]:rounded-xl [&_img]:object-contain [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pe-7 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-base-200 [&_pre]:p-3 [&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-base-300 [&_td]:p-2 [&_ul]:list-disc [&_ul]:pe-7 [&_video]:my-5 [&_video]:max-h-[520px] [&_video]:w-full [&_video]:rounded-xl [&_video]:bg-black" />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-200 px-4 py-2 text-[11px] text-base-content/50"><span>برای ورود محتوا، تصویر یا ویدیو را از نوار ابزار درج کنید. حداکثر تصویر ۲٫۵ و ویدیو ۵۰ مگابایت است.</span><span>{counts.words.toLocaleString("fa-IR")} واژه · {counts.chars.toLocaleString("fa-IR")} نویسه</span></div>
    </>}
    {preview && <div className="min-h-[400px] px-5 py-6 sm:min-h-[520px]"><RichContent content={value}/>{!counts.chars && <p className="text-sm text-base-content/45">پیش‌نمایش خالی است.</p>}</div>}
  </div>;
}

export function RichTextEditor(props: Props) {
  return <ToastProvider><Editor {...props}/></ToastProvider>;
}
