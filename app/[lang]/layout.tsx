import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { QueryProvider } from "@/components/app/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { t } from "@/lib/i18n";
import { LOCALES, isLocale } from "@/lib/i18n/locales";
import { fontVariables } from "../fonts";
import "../globals.css";

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: { default: "BariHisab — বাড়ি হিসাব", template: "%s · BariHisab" },
    description: t(isLocale(lang) ? lang : "bn", "meta.description"),
    // Private family app: never index any page (Auth PRD §8 Privacy).
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  };
}

export const viewport: Viewport = { themeColor: "#f3f2f2", width: "device-width", initialScale: 1 };

// Every page lives under /[lang]; both languages are known at build time, so
// the shell for each language is prerendered and translated on the server.
export async function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <html lang={lang} className={fontVariables}>
      <body>
        <QueryProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
