// Print / PDF page frame for reports (Reports PRD F4–F6): header repeated on
// every page, footer, and the DRAFT — NOT FINAL watermark on drafts.
import type { ReactNode } from "react";
import { formatDateTime, translator, type Locale } from "@/lib/i18n";
import type { House } from "@/lib/reports/dto";

type Props = {
  locale: Locale;
  house: House;
  title: string;
  draft: boolean;
  generatedBy: string;
  generatedAt: string;
  /** Opened from the PDF action: show how to save it. */
  pdf?: boolean;
  children: ReactNode;
};

export function PrintFrame({ locale, house, title, draft, generatedBy, generatedAt, pdf = false, children }: Props) {
  const tr = translator(locale);
  return (
    <div className="rpt-print" lang={locale}>
      {pdf ? <p className="no-print rpt-pdf-hint">{tr("rpt.pdf.hint")}</p> : null}
      {draft ? (
        <div className="rpt-watermark" data-testid="rpt-watermark" aria-hidden>
          <span>{tr("rpt.print.watermark")}</span>
        </div>
      ) : null}
      {/* thead / tfoot repeat on every printed page (F5 header and footer). */}
      <table className="rpt-print-layout" role="presentation">
        <thead>
          <tr>
            <td>
              <header className="rpt-print-head" data-testid="rpt-print-head">
                <div>
                  <p className="kicker m-0">{house.name}</p>
                  {house.address ? <p className="muted m-0">{house.address}</p> : null}
                </div>
                <div className="text-right">
                  <p className="m-0 font-extrabold">{title}</p>
                  <p className="m-0 font-semibold">{draft ? tr("rpt.print.draftHeader") : tr("rpt.final")}</p>
                </div>
              </header>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="rpt-print-body">{children}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>
              <footer className="rpt-print-foot">{tr("rpt.print.generated", { name: generatedBy, date: formatDateTime(locale, generatedAt) ?? "" })}</footer>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
