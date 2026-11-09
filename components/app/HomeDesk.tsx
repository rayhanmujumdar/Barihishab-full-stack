import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toBanglaDigits, translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { can, type Permission } from "@/lib/permissions";

export function HomeDesk({
  locale,
  name,
  permissions,
  stats,
  ownerId = null,
}: {
  locale: Locale;
  name: string;
  permissions: Permission[];
  stats: { pendingInvites: number; activeUsers: number } | null;
  /** The viewer's own owner record, for the "Statement →" shortcut (Owners PRD F17). */
  ownerId?: string | null;
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
