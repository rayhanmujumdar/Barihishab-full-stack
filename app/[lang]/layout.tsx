import type { Metadata, Viewport } from "next";
import { Archivo, Hind_Siliguri } from "next/font/google";
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { t } from "@/lib/i18n";
import { LOCALES, isLocale } from "@/lib/i18n/locales";
import "../globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["400", "600", "800"] });
const hind = Hind_Siliguri({ variable: "--font-hind", subsets: ["bengali", "latin"], weight: ["400", "600", "700"] });

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
    <html lang={lang} className={`${archivo.variable} ${hind.variable}`}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
