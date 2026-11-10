"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { todayIsoInDhaka } from "@/lib/clock";
import { HIDDEN_COOKIE, hideToday, readCookie } from "@/lib/home/hidden";
import { translator, type Locale } from "@/lib/i18n";

/** A reminder strip with one action and **Hide today** (F6, Rule 9; design D8). */
export function ReminderStrip({ locale, hideKey, action, children }: { locale: Locale; hideKey: string; action: React.ReactNode; children: React.ReactNode }) {
  const tr = translator(locale);
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const hide = () => {
    const value = hideToday(readCookie(document.cookie), hideKey, todayIsoInDhaka());
    // Two days is enough: only today's entries count, older ones are dropped on the next hide.
    document.cookie = `${HIDDEN_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=172800; samesite=lax`;
    setHidden(true);
    // At most two show: re-render so the next reminder (if any) takes the freed slot.
    router.refresh();
  };
  return (
    <div className="reminder-strip" role="note">
      <p className="m-0 flex min-w-0 items-start gap-2">
        <ExclamationTriangleIcon className="bal-neg size-5 shrink-0" aria-hidden />
        <span>{children}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {action}
        <Button variant="ghost" onClick={hide}>
          {tr("home.rem.hide")}
        </Button>
      </div>
    </div>
  );
}
