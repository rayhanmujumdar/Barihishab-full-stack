import type { Metadata } from "next";
import { Archivo, Hind_Siliguri } from "next/font/google";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["400", "600", "800"] });
const hind = Hind_Siliguri({ variable: "--font-hind", subsets: ["bengali", "latin"], weight: ["400", "600", "700"] });

export const metadata: Metadata = { title: "404 · BariHisab", robots: { index: false, follow: false } };

// Unmatched URLs and unsupported /[lang] values (e.g. /xx/admin/users). The
// language is unknown here, so the page is bilingual.
export default function GlobalNotFound() {
  return (
    <html lang="bn" className={`${archivo.variable} ${hind.variable}`}>
      <body>
        <main className="shell-main page-stack">
          <div>
            <p className="kicker">404</p>
            <h1 className="page-title">পাওয়া যায়নি</h1>
            <p lang="en" className="muted">
              Page not found.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/bn">হোমে যান</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/en" lang="en">
                Go to Home
              </Link>
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
