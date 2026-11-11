"use client";

// Income / expense category rows (F2.3–F2.5, G4, G5): count, amount, % and a
// on screen a row expands to its entries and bills (the chart sits above).
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { AttachmentGallery } from "@/components/attachments/AttachmentGallery";
import { categoryName, shortDate } from "@/components/entries/format";
import { Badge } from "@/components/ui/badge";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import type { ReportCategory } from "@/lib/reports/dto";
import { bigChange, bpPercent, entryCount } from "./format";

type Props = { locale: Locale; categories: ReportCategory[]; kind: "INCOME" | "EXPENSE"; print?: boolean };

export function CategoryList({ locale, categories, kind, print = false }: Props) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <ul className="rpt-cats">
      {categories.map((c) => {
        const expanded = open.has(c.categoryId);
        const label = `${categoryName(locale, c)} · ${entryCount(locale, c.count)}`;
        const body = (
          <>
            <span className="rpt-cat-line">
              <span className="rpt-cat-name">
                {print ? null : expanded ? <ChevronDownIcon className="size-4" aria-hidden /> : <ChevronRightIcon className="size-4" aria-hidden />}
                {label}
              </span>
              <span className="rpt-cat-amount">
                {formatMoney(locale, c.amountPaisa)} · {bpPercent(locale, c.shareBp)}
              </span>
            </span>
          </>
        );
        return (
          <li key={c.categoryId}>
            {print ? (
              <div className="rpt-cat">{body}</div>
            ) : (
              <button type="button" className="rpt-cat" aria-expanded={expanded} onClick={() => toggle(c.categoryId)}>
                {body}
              </button>
            )}
            {kind === "EXPENSE" ? <Change locale={locale} c={c} /> : null}
            {expanded && !print ? <Entries locale={locale} c={c} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function Change({ locale, c }: { locale: Locale; c: ReportCategory }) {
  const tr = translator(locale);
  const diff = bigChange(c.amountPaisa, c.previousPaisa);
  if (diff === null) return null;
  return <p className="muted rpt-cat-change">{tr("rpt.catChange", { arrow: diff > 0 ? "▲" : "▼", amount: formatMoney(locale, Math.abs(diff)) })}</p>;
}

function Entries({ locale, c }: { locale: Locale; c: ReportCategory }) {
  const tr = translator(locale);
  return (
    <div className="st-wrap rpt-entries">
      <table className="st-table" aria-label={tr("rpt.showEntries", { name: categoryName(locale, c) })}>
        <thead>
          <tr>
            <th>{tr("rpt.col.date")}</th>
            <th>{tr("rpt.col.description")}</th>
            <th>{c.entries.some((e) => e.unitName) ? tr("rpt.col.unit") : tr("rpt.col.vendor")}</th>
            <th className="num">{tr("rpt.col.amount")}</th>
            <th>{tr("rpt.col.bill")}</th>
          </tr>
        </thead>
        <tbody>
          {c.entries.map((e) => (
            <tr key={e.id}>
              <td>{shortDate(locale, e.date)}</td>
              <td>
                {e.description ?? "—"}
                {e.fromReserve ? (
                  <>
                    {" "}
                    <Badge variant="accent">{tr("rpt.reserveTag")}</Badge>
                  </>
                ) : null}
              </td>
              <td>{e.unitName ?? e.vendor ?? "—"}</td>
              <td className="num">{formatMoney(locale, e.amountPaisa)}</td>
              <td>{e.attachments.length ? <AttachmentGallery locale={locale} items={e.attachments} variant="links" /> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
