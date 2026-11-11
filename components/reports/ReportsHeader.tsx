// Reports header (Reports PRD F1, G16): house kicker, title, tab row, period
// picker slot and Print / PDF / CSV. Links only, so it renders on the server.
import { ArrowDownTrayIcon, DocumentArrowDownIcon, PrinterIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { REPORT_TABS, reportHref, type ReportTab } from "./format";

const TAB_LABEL: Record<ReportTab, MessageKey> = {
  monthly: "rpt.tab.monthly",
  yearly: "rpt.tab.yearly",
  "rent-roll": "rpt.tab.rentRoll",
  expenses: "rpt.tab.expenses",
  funds: "rpt.tab.funds",
};

export type ReportActions = { print?: string; pdf?: string; csv?: string };

export function ReportsHeader({ locale, tab, houseName, actions = {}, children }: { locale: Locale; tab: ReportTab; houseName: string; actions?: ReportActions; children?: ReactNode }) {
  const tr = translator(locale);
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="kicker">{houseName}</p>
          <h1 className="page-title">{tr("rpt.title")}</h1>
        </div>
        {actions.print || actions.pdf || actions.csv ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label={tr("rpt.actions")}>
            {actions.print ? (
              <Button asChild variant="outline">
                <a href={actions.print} target="_blank" rel="noopener">
                  <PrinterIcon data-icon="inline-start" />
                  {tr("rpt.print")}
                </a>
              </Button>
            ) : null}
            {actions.pdf ? (
              <Button asChild variant="outline">
                <a href={actions.pdf} target="_blank" rel="noopener">
                  <DocumentArrowDownIcon data-icon="inline-start" />
                  {tr("rpt.pdf")}
                </a>
              </Button>
            ) : null}
            {actions.csv ? (
              <Button asChild variant="outline">
                <a href={actions.csv} download>
                  <ArrowDownTrayIcon data-icon="inline-start" />
                  {tr("rpt.csv")}
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <nav className="rpt-tabs" aria-label={tr("rpt.tabs")}>
        {REPORT_TABS.map((t) => (
          <Link key={t} href={reportHref(locale, t)} aria-current={t === tab ? "page" : undefined} className={cn("rpt-tab", t === tab && "rpt-tab-active")}>
            {tr(TAB_LABEL[t])}
          </Link>
        ))}
      </nav>
      {children ? <div className="flex flex-wrap items-center gap-3">{children}</div> : null}
    </header>
  );
}
