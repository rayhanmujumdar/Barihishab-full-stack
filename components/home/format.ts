// Display helpers for the Home blocks (client-safe).
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import type { ActivityItem } from "./types";

/** Block names used by the loading and error states (F11). */
export type HomeBlockName = "me" | "request" | "setup" | "desk" | "reminders" | "house" | "activity" | "notices" | "actions";

export const blockLabel = (locale: Locale, block: HomeBlockName) => translator(locale)(`home.block.${block}` as MessageKey);

/** Income & Expenses detail for entries; the owner's statement for owner events (F8). */
export function activityHref(locale: Locale, i: ActivityItem): string {
  if (i.entryId) return localePath(locale, `/entries?period=${i.month}&type=${i.kind}&entry=${i.entryId}`);
  return i.owner ? localePath(locale, `/owners/${i.owner.id}`) : localePath(locale, "/entries");
}

/** "Cleaning & maintenance" / "Advance · Nasrin Ahmed". */
export function activityTitle(locale: Locale, i: ActivityItem): string {
  if (i.category) return locale === "bn" ? i.category.nameBn : i.category.nameEn;
  return translator(locale)(`home.act.${i.kind}` as MessageKey, { owner: i.owner?.name ?? "" });
}

/** Description, or "Bank · TX4134". */
export function activitySub(locale: Locale, i: ActivityItem): string {
  if (i.description) return i.description;
  const tr = translator(locale);
  return [i.method ? tr(`method.${i.method}` as MessageKey) : null, i.reference].filter(Boolean).join(" · ");
}

/** "Flat 3A (Nusrat Jahan), Flat 2B" */
export const unitList = (units: readonly { name: string; tenantName: string | null }[]) => units.map((u) => (u.tenantName ? `${u.name} (${u.tenantName})` : u.name)).join(", ");
