// Minimal, design-system-flavoured email shell: ink on paper, zero radius,
// one yellow rule. Inline styles only (email clients ignore <style>).
export type RenderedEmail = { subject: string; html: string; text: string };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function layout(opts: {
  lang: "bn" | "en";
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footnote: string;
}): string {
  const p = opts.paragraphs.map((t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1a1818">${escapeHtml(t)}</p>`).join("");
  const cta = opts.cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;background:#1a1818;color:#f6f3ec;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:0">${escapeHtml(opts.cta.label)} &rarr;</a></p>`
    : "";
  return `<!doctype html><html lang="${opts.lang}"><body style="margin:0;background:#f6f3ec;font-family:Arial,'Noto Sans Bengali',sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-top:4px solid #f5c400">
<tr><td style="padding:28px">
<p style="margin:0 0 24px;font-size:20px;font-weight:800;color:#1a1818">BariHisab</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:#1a1818">${escapeHtml(opts.heading)}</h1>
${p}${cta}
<p style="margin:24px 0 0;padding-top:16px;border-top:2px solid #1a1818;font-size:13px;color:#444141">${escapeHtml(opts.footnote)}</p>
</td></tr></table></td></tr></table></body></html>`;
}
