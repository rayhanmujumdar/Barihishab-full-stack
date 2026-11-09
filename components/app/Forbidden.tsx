import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";

/** RBAC-04 page-level "You don't have access". */
export function Forbidden({ locale }: { locale: Locale }) {
  const tr = translator(locale);
  return (
    <div className="page-stack" lang={locale} data-testid="forbidden">
      <div>
        <p className="kicker">{tr("forbidden.kicker")}</p>
        <h1 className="page-title">{tr("forbidden.title")}</h1>
      </div>
      <p>{tr("forbidden.body")}</p>
      <Button asChild className="self-start">
        <Link href={localePath(locale, "/")}>
          {tr("forbidden.back")}
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </Button>
    </div>
  );
}
