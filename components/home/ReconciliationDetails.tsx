"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import type { DeskDto } from "./types";

const PARTS: [keyof DeskDto["reconciliation"]["parts"], MessageKey][] = [
  ["fundPaisa", "home.recon.fund"],
  ["ownerBalancesPaisa", "home.recon.ownerBalances"],
  ["reservePaisa", "home.recon.reserve"],
  ["openNetPaisa", "home.recon.openNet"],
  ["deficitCarriedPaisa", "home.recon.deficit"],
  ["loansOutstandingPaisa", "home.recon.loans"],
];

/** "See details": each part of the §5.7 formula and the difference (G8). */
export function ReconciliationDetails({ locale, reconciliation: r }: { locale: Locale; reconciliation: DeskDto["reconciliation"] }) {
  const tr = translator(locale);
  const [open, setOpen] = useState(false);
  const money = (p: number) => formatMoney(locale, p);
  return (
    <>
      <Button variant="ghost" className="self-start pl-0" onClick={() => setOpen(true)}>
        {tr("home.desk.details")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none sm:max-w-[480px]" lang={locale} aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold">{tr("home.recon.title")}</DialogTitle>
          </DialogHeader>
          <table className="recon-table">
            <tbody>
              {PARTS.map(([k, label]) => (
                <tr key={k}>
                  <th scope="row">{tr(label)}</th>
                  <td>{money(r.parts[k])}</td>
                </tr>
              ))}
              <tr className="recon-total">
                <th scope="row">{tr("home.recon.expected")}</th>
                <td>{money(r.expectedPaisa)}</td>
              </tr>
              <tr className="recon-total">
                <th scope="row">{tr("home.recon.difference")}</th>
                <td className={r.mismatchPaisa === 0 ? "bal-pos" : "bal-neg"}>{money(r.mismatchPaisa)}</td>
              </tr>
            </tbody>
          </table>
        </DialogContent>
      </Dialog>
    </>
  );
}
