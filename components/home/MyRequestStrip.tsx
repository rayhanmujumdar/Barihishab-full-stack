import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { requestsHref } from "@/components/requests/format";
import { Button } from "@/components/ui/button";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import type { MyRequestDto } from "./types";

/** "Your advance request for ৳10,000 is pending." → View request (F4). */
export function MyRequestStrip({ locale, request: r }: { locale: Locale; request: MyRequestDto }) {
  const tr = translator(locale);
  const lower = r.amountApprovedPaisa !== null && r.amountApprovedPaisa < r.amountRequestedPaisa;
  return (
    <section aria-label={tr("home.block.request")} className="reminder-strip">
      <p className="m-0 flex flex-wrap items-baseline gap-x-2">
        {r.once ? (
          <span className="font-semibold">{tr(`home.req.once.${r.status}` as MessageKey)}</span>
        ) : (
          <span className="font-semibold">
            {tr("home.req.strip", {
              type: tr(`home.req.type.${r.type}` as MessageKey),
              amount: formatMoney(locale, r.amountRequestedPaisa),
              status: tr(`home.req.status.${r.status}` as MessageKey),
            })}
          </span>
        )}
        {!r.once && lower ? <span className="font-extrabold">{tr("home.req.lower", { amount: formatMoney(locale, r.amountApprovedPaisa!) })}</span> : null}
      </p>
      <Button asChild variant="ghost" className="pl-0">
        <Link href={requestsHref(locale, { request: r.id })}>
          {tr(r.once ? "home.req.onceView" : "home.req.view")}
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </Button>
    </section>
  );
}
