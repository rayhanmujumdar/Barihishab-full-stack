import { ArrowRightIcon, CheckIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import type { SetupDto, SetupStepKey } from "./types";

const WHERE: Record<SetupStepKey, string> = {
  HOUSE: "/settings",
  FUNDS: "/settings",
  SHARES: "/owners",
  OPENINGS: "/owners",
  FIRST_MONTH: "/distribution",
  INVITES: "/admin/users",
};

/** First-run checklist for the Super Admin (F12). */
export function SetupChecklist({ locale, setup }: { locale: Locale; setup: SetupDto }) {
  const tr = translator(locale);
  return (
    <section aria-labelledby="setup-title">
      <div className="section-head">
        <h2 id="setup-title">{tr("home.setup.title")}</h2>
      </div>
      <ul className="m-0 list-none p-0" aria-label={tr("home.setup.title")}>
        {setup.steps.map((s) => (
          <li key={s.key} className="list-row">
            <span className="font-semibold">{tr(`home.setup.${s.key}` as MessageKey)}</span>
            {s.done ? (
              <span className="bal-pos flex items-center gap-1 font-extrabold">
                <CheckIcon className="size-4" aria-hidden />
                {tr("home.setup.done")}
              </span>
            ) : (
              <Button asChild variant="secondary">
                <Link href={localePath(locale, WHERE[s.key])}>
                  {tr("home.setup.continue")}
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
