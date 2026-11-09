import { NotFoundView } from "@/components/app/NotFoundView";
import { getLocale } from "@/lib/i18n/server";

// notFound() outside the app shell (auth and print routes). Unmatched URLs are
// handled by app/global-not-found.tsx instead.
export default async function NotFound() {
  return <NotFoundView locale={await getLocale()} standalone />;
}
