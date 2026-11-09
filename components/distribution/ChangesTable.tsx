import type { Locale } from "@/lib/i18n";
import { translator } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { signedMoney } from "@/components/owners/format";
import { lineLabel } from "./format";
import type { ChangesDto } from "./types";

/** Before → after since the last close (F8, G6): changed staircase lines, then every owner. */
export function ChangesTable({ locale, changes }: { locale: Locale; changes: ChangesDto }) {
  const tr = translator(locale);
  const rows = [
    ...changes.lines.map((l) => ({ ...l, id: l.key, label: lineLabel(locale, l.key) })),
    ...changes.owners.map((o) => ({ ...o, id: o.ownerId, label: o.displayName })),
  ];
  return (
    <div className="st-wrap">
      <table className="st-table changes-table" style={{ minWidth: 420 }}>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col" className="num">{tr("dist.changes.before")}</th>
            <th scope="col" className="num">{tr("dist.changes.after")}</th>
            <th scope="col" className="num">{tr("dist.changes.diff")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={i === changes.lines.length - 1 ? "st-edge" : undefined}>
              <th scope="row" className="text-left font-semibold">{r.label}</th>
              <td className="num">{formatMoney(locale, r.beforePaisa)}</td>
              <td className="num">{formatMoney(locale, r.afterPaisa)}</td>
              <td className="num">{r.diffPaisa === 0 ? "—" : signedMoney(locale, r.diffPaisa)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
