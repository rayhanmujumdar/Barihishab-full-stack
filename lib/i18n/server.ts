// Server-side locale = the /[lang] root segment (SSR localization). Root-param
// getters only work in Server Components, so route handlers derive the locale
// from the URL or user instead.
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { isLocale, type Locale } from "./locales";

export async function getLocale(): Promise<Locale> {
  const value = await lang();
  if (!isLocale(value)) notFound();
  return value;
}
