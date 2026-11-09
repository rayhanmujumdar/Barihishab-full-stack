import { NotFoundView } from "@/components/app/NotFoundView";
import { getLocale } from "@/lib/i18n/server";

// notFound() from a signed-in page (e.g. an unknown owner id): renders inside
// the shell so the sidebar / bottom nav stay usable.
export default async function NotFound() {
  return <NotFoundView locale={await getLocale()} />;
}
