"use client";

import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, translator } from "@/lib/i18n";
import { localeFromPath } from "@/lib/i18n/paths";

// A report print / PDF view that failed to load (Reports PRD F6, §8).
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  const locale = localeFromPath(usePathname()) ?? DEFAULT_LOCALE;
  const tr = translator(locale);
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="print-page" lang={locale}>
      <p role="alert" className="bal-neg m-0 font-semibold">
        {tr("rpt.pdf.failed")}
      </p>
      <Button className="self-start" onClick={() => retry()}>
        <ArrowPathIcon data-icon="inline-start" />
        {tr("rpt.pdf.retry")}
      </Button>
    </main>
  );
}
