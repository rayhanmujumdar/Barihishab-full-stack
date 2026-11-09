import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { StatusScreen } from "@/components/app/StatusScreen";
import { Button } from "@/components/ui/button";
import { toBanglaDigits, translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";

/** 404 for a known locale — notFound() inside the shell, auth or print routes. */
export function NotFoundView({ locale, standalone = false }: { locale: Locale; standalone?: boolean }) {
  const tr = translator(locale);
  return (
    <StatusScreen
      standalone={standalone}
      lang={locale}
      testId="not-found"
      code={locale === "bn" ? toBanglaDigits("404") : "404"}
      kicker={tr("notFound.kicker")}
      title={tr("notFound.title")}
      body={<p>{tr("notFound.body")}</p>}
      actions={
        <Button asChild>
          <Link href={localePath(locale, "/")}>
            {tr("status.home")}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      }
    />
  );
}
