import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { StatusScreen } from "@/components/app/StatusScreen";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = { title: "404 · BariHisab", robots: { index: false, follow: false } };

// Unmatched URLs and unsupported /[lang] values (e.g. /xx/admin/users). The
// language is unknown here, so the page is bilingual: Bangla first, English under.
export default function GlobalNotFound() {
  return (
    <html lang="bn" className={fontVariables}>
      <body>
        <StatusScreen
          standalone
          lang="bn"
          testId="not-found"
          code="404"
          kicker={`${t("bn", "notFound.kicker")} · ${t("en", "notFound.kicker")}`}
          title={
            <>
              {t("bn", "notFound.title")}
              <span lang="en" className="block text-[0.55em] text-[var(--color-neutral-700)]">
                {t("en", "notFound.title")}
              </span>
            </>
          }
          body={
            <>
              <p>{t("bn", "notFound.body")}</p>
              <p lang="en" className="muted">
                {t("en", "notFound.body")}
              </p>
            </>
          }
          actions={
            <>
              <Button asChild>
                <Link href="/bn">
                  {t("bn", "status.home")}
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/en" lang="en">
                  {t("en", "status.home")}
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            </>
          }
        />
      </body>
    </html>
  );
}
