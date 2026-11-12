import { formatDay } from "@/components/distribution/format";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import type { LinkItem } from "./types";

/** Builds /{lang}/notices?… keeping only non-empty params. */
export function noticesHref(locale: Locale, q: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== "all").map(([k, v]) => [k, String(v)]));
  const qs = sp.toString();
  return localePath(locale, `/notices${qs ? `?${qs}` : ""}`);
}

/** Chip: "Electricity · Oct 2026" (type only when the viewer can't open it). */
export function linkChip(locale: Locale, l: LinkItem): string {
  const tr = translator(locale);
  const type = tr(`nc.link.${l.type}` as MessageKey);
  if (l.hidden || !l.subject) return tr("nc.link.hidden", { type });
  return l.month && l.type !== "MONTH" ? `${l.subject} · ${monthLabel(locale, l.month)}` : l.subject;
}

/** Card: "{date} · {item} · ৳X". */
export function linkCard(locale: Locale, l: LinkItem): string {
  if (l.hidden || !l.subject) return linkChip(locale, l);
  return [l.date ? formatDay(locale, l.date) : null, l.subject, l.amountPaisa !== null ? formatMoney(locale, l.amountPaisa) : null].filter(Boolean).join(" · ");
}

/** Where a linked item lives in the app. */
export function linkHref(locale: Locale, l: LinkItem): string | null {
  if (l.hidden) return null;
  switch (l.type) {
    case "ENTRY":
      return localePath(locale, `/entries?period=${l.month ?? ""}&entry=${l.id}`);
    case "MONTH":
      return localePath(locale, `/distribution?month=${l.month ?? ""}`);
    case "LEDGER":
      return localePath(locale, `/owners`);
    case "LOAN":
      return localePath(locale, `/advances?loan=${l.id}`);
    case "REQUEST":
      return localePath(locale, `/requests?request=${l.id}`);
    case "SHARE_SET":
      return localePath(locale, `/owners`);
  }
}
