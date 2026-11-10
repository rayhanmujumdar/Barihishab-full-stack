"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { MINUTE } from "@/lib/clock";
import { translator, type Locale } from "@/lib/i18n";

/** Back to the tab after this long → refresh (F11). */
export const STALE_AFTER_MS = 5 * MINUTE;
const PULL_PX = 64;

/**
 * Keeps Home fresh (F11, G13): refresh on returning to the tab after 5
 * minutes, pull down at the top of the page on phones, then "Updated just now".
 */
export function HomeRefresh({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [updated, setUpdated] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    const refresh = () => {
      asked.current = true;
      start(() => router.refresh());
    };
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt !== null && Date.now() - hiddenAt >= STALE_AFTER_MS) refresh();
      if (!document.hidden) hiddenAt = null;
    };
    let startY: number | null = null;
    // Not while a drawer, sheet or dialog is open over Home (they are portalled, so check the document).
    const overlayOpen = () => document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
    const onTouchStart = (e: TouchEvent) => {
      startY = window.scrollY <= 0 && e.touches.length === 1 && !overlayOpen() ? e.touches[0].clientY : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (startY !== null && e.changedTouches[0].clientY - startY >= PULL_PX) refresh();
      startY = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [router]);

  // Show the note once the refresh this component asked for has settled.
  useEffect(() => {
    if (pending || !asked.current) return;
    asked.current = false;
    setUpdated(true);
    const t = setTimeout(() => setUpdated(false), 3000);
    return () => clearTimeout(t);
  }, [pending]);

  return (
    <p role="status" aria-live="polite" className="muted m-0 min-h-[1lh]">
      {updated ? translator(locale)("home.updated") : ""}
    </p>
  );
}
