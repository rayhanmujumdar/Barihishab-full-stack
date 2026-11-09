// Shared next/font instances for every document-level file (the /[lang] root
// layout, global-not-found, global-error) so each font is declared once.
import { Archivo, Hind_Siliguri } from "next/font/google";

export const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["400", "600", "800"] });
export const hind = Hind_Siliguri({ variable: "--font-hind", subsets: ["bengali", "latin"], weight: ["400", "600", "700"] });

export const fontVariables = `${archivo.variable} ${hind.variable}`;
