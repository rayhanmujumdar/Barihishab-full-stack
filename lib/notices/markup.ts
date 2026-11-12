// Notice formatting (Notices & Complaints PRD G4, design D3): exactly **bold**,
// "- " bullet lines and [text](http|https|mailto link). Everything else is
// plain text — the app renders tokens as React elements and emails escape
// them, so raw HTML can never reach a page or an inbox.

export type Inline = { t: "text"; v: string } | { t: "bold"; v: string } | { t: "link"; v: string; href: string };
export type Block = { type: "p"; lines: Inline[][] } | { type: "ul"; items: Inline[][] };

const INLINE = /\*\*([^*]+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;
const BULLET = /^\s*- /;

function pushText(out: Inline[], v: string): void {
  if (!v) return;
  const last = out[out.length - 1];
  if (last?.t === "text") last.v += v;
  else out.push({ t: "text", v });
}

function inline(line: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const m of line.matchAll(INLINE)) {
    pushText(out, line.slice(at, m.index));
    if (m[1] !== undefined) out.push({ t: "bold", v: m[1] });
    else if (SAFE_HREF.test(m[3])) out.push({ t: "link", v: m[2], href: m[3] });
    else pushText(out, m[0]);
    at = m.index + m[0].length;
  }
  pushText(out, line.slice(at));
  return out;
}

export function parseNotice(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) {
      current = null;
      continue;
    }
    if (BULLET.test(raw)) {
      if (current?.type !== "ul") blocks.push((current = { type: "ul", items: [] }));
      current.items.push(inline(raw.replace(BULLET, "")));
    } else {
      if (current?.type !== "p") blocks.push((current = { type: "p", lines: [] }));
      current.lines.push(inline(raw));
    }
  }
  return blocks;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

function inlineHtml(parts: Inline[]): string {
  return parts
    .map((p) => (p.t === "bold" ? `<strong>${escapeHtml(p.v)}</strong>` : p.t === "link" ? `<a href="${escapeHtml(p.href)}">${escapeHtml(p.v)}</a>` : escapeHtml(p.v)))
    .join("");
}

/** Email-safe HTML of a notice body. */
export function renderNoticeHtml(text: string): string {
  return parseNotice(text)
    .map((b) => (b.type === "p" ? `<p>${b.lines.map(inlineHtml).join("<br>")}</p>` : `<ul>${b.items.map((i) => `<li>${inlineHtml(i)}</li>`).join("")}</ul>`))
    .join("");
}
