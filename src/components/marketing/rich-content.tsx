export { SiteFooter } from "./site-footer";

function inline(text: string) {
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    return m ? <a key={i} href={m[2]} rel="nofollow noopener noreferrer" className="text-primary underline">{m[1]}</a> : part;
  });
}
export function RichContent({ content }: { content: string }) {
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
