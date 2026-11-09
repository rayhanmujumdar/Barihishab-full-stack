"use client";

import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import type { Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";

/**
 * Always-visible language switch (design system §7). Swaps only the [lang]
 * segment of the current URL, remembers the choice in a cookie, and saves it
 * to the profile when logged in.
 */
export function LanguageToggle({ locale, label, loggedIn = false }: { locale: Locale; label: string; loggedIn?: boolean }) {
  const router = useRouter();
  const saveLocale = useApiMutation(["me", "locale"], (locale: Locale) => apiFetch("/me", { method: "PATCH", body: { locale } }));
  const [pending, start] = useTransition();
  const next: Locale = locale === "bn" ? "en" : "bn";
  return (
    <Button
      variant="outline"
      lang={next}
      disabled={pending}
      onClick={() =>
        start(async () => {
          document.cookie = `bh_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
          if (loggedIn) await saveLocale.run(next);
          // Read the URL at click time (not usePathname) so the toggle can be
          // prerendered in the static shell of every page.
          router.push(`${localePath(next, window.location.pathname)}${window.location.search}`);
        })
      }
    >
      <GlobeAltIcon data-icon="inline-start" />
      {label}
    </Button>
  );
}
