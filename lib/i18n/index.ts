// Tiny i18n (design D10): flat key → string dictionaries, bn default.
// Safe to import from client components (no server-only deps).
import { bn } from "./bn";
import { en, type MessageKey } from "./en";

import { DEFAULT_LOCALE, type Locale } from "./locales";

export type Dict = Record<MessageKey, string>;
export type { MessageKey };
export { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from "./locales";

const DICTS: Record<Locale, Dict> = { bn, en };

export function resolveLocale(value: string | null | undefined): Locale {
  return value === "en" || value === "bn" ? value : DEFAULT_LOCALE;
}

export function dictionary(locale: Locale): Dict {
  return DICTS[locale];
}

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
export function toBanglaDigits(s: string): string {
  return s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

export function format(locale: Locale, template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = vars[name];
    if (v === undefined) return `{${name}}`;
    return typeof v === "number" && locale === "bn" ? toBanglaDigits(String(v)) : String(v);
  });
}

export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  return format(locale, DICTS[locale][key], vars);
}

/** Binds a locale so components can call tr("key", vars). */
export function translator(locale: Locale) {
  return (key: MessageKey, vars?: Record<string, string | number>) => t(locale, key, vars);
}

export function formatDateTime(locale: Locale, iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(new Date(iso));
}
