import { ArrowRightIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toBanglaDigits, translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { monthLabel } from "@/lib/periods/month";
import { can, type Permission } from "@/lib/permissions";
import { RequestStatusTag } from "@/components/requests/RequestCard";
import { reqNumber, requestsHref, typeLabel } from "@/components/requests/format";
import { formatMoney } from "@/lib/money";
import type { RequestDto } from "@/lib/requests/dto";
import type { RequestReminder } from "@/lib/requests/reminders";

export function HomeDesk({
  locale,
  name,
  permissions,
  stats,
  ownerId = null,
  closeReminder = null,
  requests = null,
  latestRequest = null,
}: {
  locale: Locale;
  name: string;
  permissions: Permission[];
  stats: { pendingInvites: number; activeUsers: number } | null;
  /** The viewer's own owner record, for the "Statement →" shortcut (Owners PRD F17). */
  ownerId?: string | null;
  /** An earlier month still open, for users who can close it (Distribution PRD F14). */
  closeReminder?: { month: string; unpaid: { name: string; tenantName: string | null }[] } | null;
  /** Super Admin: pending count + reminders (Requests PRD F13, F14). */
  requests?: { pending: number; reminders: RequestReminder[] } | null;
  /** Owner: their newest open request (Requests PRD F14). */
  latestRequest?: RequestDto | null;
}) {
  const tr = translator(locale);
  const n = (v: number) => (locale === "bn" ? toBanglaDigits(String(v)) : String(v));
  return (
    <div className="page-stack" lang={locale}>
      <div>
        <p className="kicker">{tr("home.kicker")}</p>
        <h1 className="page-title">{tr("home.welcome", { name })}</h1>
        {ownerId ? (
          <Button asChild variant="ghost" className="mt-2 pl-0 font-extrabold">
            <Link href={localePath(locale, `/owners/${ownerId}`)}>
              {tr("home.statement")}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        ) : null}
      </div>
      {closeReminder ? (
        <div className="reminder-strip" role="note">
          <p className="m-0 flex items-start gap-2">
            <ExclamationTriangleIcon className="bal-neg size-5 shrink-0" aria-hidden />
            <span>
              <strong>{tr("home.reminder.open", { month: monthLabel(locale, closeReminder.month) })}</strong>{" "}
              {closeReminder.unpaid.length
                ? tr(closeReminder.unpaid.length === 1 ? "home.reminder.unpaid" : "home.reminder.unpaidMany", {
                    units: closeReminder.unpaid.map((u) => (u.tenantName ? `${u.name} (${u.tenantName})` : u.name)).join(", "),
                  })
                : null}
            </span>
          </p>
          <Button asChild>
            <Link href={localePath(locale, `/distribution?month=${closeReminder.month}`)}>
              {tr("home.reminder.review")}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      ) : null}
      {requests ? (
        <section aria-labelledby="req-tile-title" className="flex flex-col gap-3">
          <div className="stats">
            <div className={`stat${requests.pending > 0 ? " stat-signal" : ""}`}>
              <p id="req-tile-title" className="kicker" style={requests.pending > 0 ? { color: "var(--color-text)" } : undefined}>
                {tr("home.req.pending")}
              </p>
              <div className="stat-value">{n(requests.pending)}</div>
            </div>
          </div>
          {requests.reminders.length ? (
            <div className="reminder-strip" role="note">
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {requests.reminders.map((r) => (
                  <li key={`${r.id}-${r.kind}`} className="flex items-start gap-2">
                    <ExclamationTriangleIcon className="bal-neg size-5 shrink-0" aria-hidden />
                    <span>{tr(r.kind === "PENDING_3_DAYS" ? "home.req.waiting" : "home.req.overdue", { number: reqNumber(locale, r.number), name: r.ownerName })}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button asChild className="self-start">
            <Link href={requestsHref(locale)}>
              {tr("home.req.review")}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </section>
      ) : null}
      {latestRequest ? (
        <section aria-labelledby="req-latest-title" className="flex flex-col gap-2 border-t-2 border-foreground pt-3">
          <h2 id="req-latest-title" className="m-0 text-lg font-extrabold">
            {tr("home.req.latest")}
          </h2>
          <p className="m-0 flex flex-wrap items-center gap-2">
            <RequestStatusTag locale={locale} status={latestRequest.status} />
            <span className="font-semibold">
              {reqNumber(locale, latestRequest.number)} · {formatMoney(locale, latestRequest.amountApprovedPaisa ?? latestRequest.amountRequestedPaisa)} · {typeLabel(locale, latestRequest.type)}
            </span>
          </p>
          <Button asChild variant="ghost" className="self-start pl-0">
            <Link href={requestsHref(locale, { request: latestRequest.id })}>
              {tr("home.req.open")}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </section>
      ) : null}
      {can({ permissions }, "dashboard.admin") && stats ? (
        <section aria-labelledby="desk-title">
          <div className="section-head">
            <h2 id="desk-title">{tr("home.desk.title")}</h2>
            <span className="kicker">{tr("home.desk.adminOnly")}</span>
          </div>
          <div className="stats">
            <div className={`stat${stats.pendingInvites > 0 ? " stat-signal" : ""}`}>
              <p className="kicker" style={stats.pendingInvites > 0 ? { color: "var(--color-text)" } : undefined}>
                {tr("home.desk.pendingInvites")}
              </p>
              <div className="stat-value">{n(stats.pendingInvites)}</div>
            </div>
            <div className="stat">
              <p className="kicker">{tr("home.desk.activeUsers")}</p>
              <div className="stat-value">{n(stats.activeUsers)}</div>
            </div>
          </div>
          <Button asChild className="mt-4">
            <Link href={localePath(locale, "/admin/users")}>
              {tr("home.desk.manageUsers")}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </section>
      ) : (
        <Alert>
          <AlertDescription>{tr("home.ownerNote")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
