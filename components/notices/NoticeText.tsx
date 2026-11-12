import { Fragment } from "react";
import { parseNotice, type Inline } from "@/lib/notices/markup";
import { cn } from "@/lib/utils";

function Line({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.t === "bold" ? (
          <strong key={i}>{p.v}</strong>
        ) : p.t === "link" ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-foreground underline underline-offset-2">
            {p.v}
          </a>
        ) : (
          <Fragment key={i}>{p.v}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * A notice body with only bold, bullets and safe links (G4). Built from tokens,
 * never from HTML, so nothing a writer types can run in the page.
 */
export function NoticeText({ text, clamp, id, className }: { text: string; clamp?: 3 | 4; id?: string; className?: string }) {
  return (
    <div id={id} className={cn("notice-text flex flex-col gap-2 text-[14px] text-[var(--color-neutral-800)]", clamp === 3 && "line-clamp-3", clamp === 4 && "line-clamp-4", className)}>
      {parseNotice(text).map((b, i) =>
        b.type === "p" ? (
          <p key={i} className="m-0">
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j ? <br /> : null}
                <Line parts={l} />
              </Fragment>
            ))}
          </p>
        ) : (
          <ul key={i} className="m-0 list-disc pl-5">
            {b.items.map((it, j) => (
              <li key={j}>
                <Line parts={it} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
