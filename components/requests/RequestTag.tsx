import Link from "next/link";
import { translator, type Locale } from "@/lib/i18n";
import type { RequestRef } from "@/lib/requests/ref";
import { reqNumber, requestsHref } from "./format";

/** "From request R-2026-014" on entries a disbursal created (Requests PRD §2.1 Other places). */
export function RequestTag({ locale, request }: { locale: Locale; request: RequestRef }) {
  if (!request) return null;
  return (
    <Link href={requestsHref(locale, { request: request.id })} className="text-xs font-semibold text-foreground underline underline-offset-2">
      {translator(locale)("req.fromRequest", { number: reqNumber(locale, request.number) })}
    </Link>
  );
}
