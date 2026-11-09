"use client";

import { PrinterIcon } from "@heroicons/react/24/outline";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Names the document (= the saved PDF's file name, F4) and opens the print dialog once. */
export function AutoPrint({ title, label }: { title: string; label: string }) {
  useEffect(() => {
    document.title = title;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [title]);
  return (
    <Button className="no-print self-start" onClick={() => window.print()}>
      <PrinterIcon data-icon="inline-start" />
      {label}
    </Button>
  );
}
