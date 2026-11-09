"use client";

import { ErrorView } from "@/components/app/ErrorView";
import { fontVariables } from "./fonts";
import "./globals.css";

// Last-resort boundary: the /[lang] root layout itself threw. It replaces the
// whole document, so it brings its own <html>, styles and fonts.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="bn" className={fontVariables}>
      <body>
        <title>Error · BariHisab</title>
        <ErrorView error={error} retry={retry} standalone />
      </body>
    </html>
  );
}
