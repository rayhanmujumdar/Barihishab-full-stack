"use client";

import { ArrowPathIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { StatusScreen } from "@/components/app/StatusScreen";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, toBanglaDigits, translator } from "@/lib/i18n";
import { localeFromPath, localePath } from "@/lib/i18n/paths";

/**
 * Body of every error boundary (error.tsx, global-error.tsx). Boundaries get no
 * route params, so the locale is read from the URL's /[lang] prefix.
 * Server errors arrive with a generic message in production; only the digest
 * is shown, so the user can quote it and we can match the server log.
 */
export function ErrorView({ error, retry, standalone = false }: { error: unknown; retry: () => void; standalone?: boolean }) {
  const locale = localeFromPath(usePathname()) ?? DEFAULT_LOCALE;
  const tr = translator(locale);
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      standalone={standalone}
      lang={locale}
      testId="error-page"
      code={locale === "bn" ? toBanglaDigits("500") : "500"}
      kicker={tr("errorPage.kicker")}
      title={tr("errorPage.title")}
      body={<p>{tr("errorPage.body")}</p>}
      detail={digest ? tr("errorPage.reference", { digest }) : null}
      actions={
        <>
          <Button onClick={() => retry()}>
            <ArrowPathIcon data-icon="inline-start" />
            {tr("errorPage.retry")}
          </Button>
          <Button asChild variant="outline">
            <Link href={localePath(locale, "/")}>
              {tr("status.home")}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </>
      }
    />
  );
}
