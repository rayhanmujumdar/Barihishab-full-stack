import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";

export function ResetExpired({ locale }: { locale: Locale }) {
  const tr = translator(locale);
  return (
    <div className="form-stack">
      <h2 className="section-head text-[22px] font-extrabold">{tr("reset.expired.title")}</h2>
      <p>{tr("reset.expired.body")}</p>
      <Button asChild size="lg" className="w-full justify-between">
        <Link href={localePath(locale, "/forgot")}>
          {tr("reset.expired.cta")}
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </Button>
    </div>
  );
}
