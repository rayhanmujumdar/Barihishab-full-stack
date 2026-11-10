"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";

/** A notice body clamped to 3 lines with **Read more** (G6). */
export function NoticeBody({ locale, text }: { locale: Locale; text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  // Until laid out, guess from length; then measure the clamp for real.
  const [overflows, setOverflows] = useState(text.length > 160);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.clientHeight > 0) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text]);
  return (
    <>
      <p ref={ref} className={`m-0 text-[14px] text-[var(--color-neutral-800)]${open ? "" : " line-clamp-3"}`}>
        {text}
      </p>
      {overflows || open ? (
        <Button variant="ghost" className="self-start pl-0" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {translator(locale)("home.notices.readMore")}
        </Button>
      ) : null}
    </>
  );
}
