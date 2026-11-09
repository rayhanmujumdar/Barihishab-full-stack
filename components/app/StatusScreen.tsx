import type { ReactNode } from "react";

/**
 * Shared layout for the 404 / 500 screens (no hooks, so it renders from both
 * server not-found files and client error boundaries). A huge ink status code
 * over a 2px ink rule, then kicker, title, one plain sentence and actions —
 * all flush left (design system §2, §3, §7 "Empty states").
 *
 * `standalone` adds a minimal brand bar for screens that render outside the
 * app shell (unmatched URLs, root-layout crashes, auth/print routes).
 */
export function StatusScreen({
  code,
  kicker,
  title,
  body,
  detail,
  actions,
  lang,
  standalone = false,
  testId,
}: {
  code: string;
  kicker: string;
  title: ReactNode;
  body: ReactNode;
  detail?: ReactNode;
  actions: ReactNode;
  lang?: string;
  standalone?: boolean;
  testId?: string;
}) {
  const content = (
    <section className="status" lang={lang} data-testid={testId} aria-labelledby="status-title">
      <p className="status-code" aria-hidden="true">
        {code}
      </p>
      <div>
        <p className="kicker">{kicker}</p>
        <h1 id="status-title" className="page-title">
          {title}
        </h1>
      </div>
      <div className="status-body">{body}</div>
      {detail ? <p className="status-detail">{detail}</p> : null}
      <div className="status-actions">{actions}</div>
    </section>
  );

  if (!standalone) return content;
  return (
    <div className="status-frame">
      <header className="status-bar">
        <span className="brand-mark">BariHisab</span>
      </header>
      <main className="shell-main">{content}</main>
    </div>
  );
}
