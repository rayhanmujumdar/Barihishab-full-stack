"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NoticeText } from "@/components/notices/NoticeText";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { translator, type Locale } from "@/lib/i18n";

/**
 * A notice body clamped to 3 lines with **Read more** (G6). Expanding an unread
 * notice records the read (Notices & Complaints N4) — an explicit write.
 */
export function NoticeBody({ locale, id, text, unread = false }: { locale: Locale; id?: string; text: string; unread?: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Until laid out, guess from length; then measure the clamp for real.
  const [overflows, setOverflows] = useState(text.length > 160);
  useLayoutEffect(() => {
    const el = ref.current?.firstElementChild as HTMLElement | null;
    if (el && el.clientHeight > 0) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text]);
  function toggle() {
    setOpen((o) => !o);
    if (!open && unread && id) void apiFetch(`/notices/${id}/read`, { method: "POST" }).then((r) => r.ok && router.refresh());
  }
  return (
    <>
      <div ref={ref}>
        <NoticeText text={text} clamp={open ? undefined : 3} />
      </div>
      {overflows || open ? (
        <Button variant="ghost" className="self-start pl-0" aria-expanded={open} onClick={toggle}>
          {translator(locale)("home.notices.readMore")}
        </Button>
      ) : null}
    </>
  );
}
