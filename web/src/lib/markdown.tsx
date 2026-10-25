// A small Markdown renderer for campaign briefs: headings, paragraphs, lists,
// **bold**, *italic*, `code` and [links](https://…). It builds React elements
// (never raw HTML), so a brief can't inject markup.
import type { ReactNode } from "react";

type Block =
  | { kind: "h"; level: 2 | 3 | 4; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] };

function blocks(src: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join(" ") });
    para = [];
    if (list) out.push(list);
    list = null;
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s{0,3}[-*+]\s+(.*)$/);
    const ol = line.match(/^\s{0,3}\d+[.)]\s+(.*)$/);
    if (!line.trim()) {
      flush();
    } else if (h) {
      flush();
      out.push({ kind: "h", level: (h[1]!.length + 1) as 2 | 3 | 4, text: h[2]! });
    } else if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      if (para.length || (list && list.kind !== kind)) flush();
      list ??= { kind, items: [] };
      list.items.push((ul ?? ol)![1]!);
    } else if (list && /^\s+/.test(raw)) {
      // An indented line continues the current list item.
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return out;
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** Inline markup → React nodes. */
function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${n++}`;
    if (m[1]) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(t.slice(2, -2), k)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(t.slice(1, -1), k)}</em>);
    else {
      const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      out.push(
        SAFE_URL.test(href!) ? (
          <a key={k} href={href} target="_blank" rel="noreferrer nofollow">
            {inline(label!, k)}
          </a>
        ) : (
          label
        ),
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className}>
      {blocks(source).map((b, i) => {
        if (b.kind === "h") {
          const H = `h${b.level}` as "h2" | "h3" | "h4";
          return <H key={i}>{inline(b.text, `${i}`)}</H>;
        }
        if (b.kind === "p") return <p key={i}>{inline(b.text, `${i}`)}</p>;
        const L = b.kind;
        return (
          <L key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it, `${i}-${j}`)}</li>
            ))}
          </L>
        );
      })}
    </div>
  );
}
