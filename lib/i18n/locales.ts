// Supported locales, kept dependency-free so the proxy doesn't bundle dictionaries.
export type Locale = "bn" | "en";
export const LOCALES: readonly Locale[] = ["bn", "en"];
export const DEFAULT_LOCALE: Locale = "bn";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "bn" || value === "en";
}
