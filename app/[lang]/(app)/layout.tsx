import { Suspense } from "react";
import { ShellNav, TopbarAction } from "@/components/app/ShellNav";
import { LanguageToggle } from "@/components/app/language-toggle";
import { requireViewer } from "@/lib/auth/server";
import { translator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { currentPropertyId } from "@/lib/property";
import { requestBadge } from "@/lib/requests/request-read";
import { initials } from "@/lib/users/initials";

// App shell (design system §4). The session read streams in behind Suspense,
// as Cache Components requires; the proxy has already bounced anonymous visits.
export default function AppLayout({ children }: LayoutProps<"/[lang]">) {
  return (
    <Suspense fallback={<div className="shell" aria-busy="true" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const locale = await getLocale();
  const tr = translator(locale);
  const propertyId = await currentPropertyId();
  const [pendingInvites, requests, property, ownLink, openMonths] = await Promise.all([
    can(viewer, "user.list") ? prisma.user.count({ where: { status: "INVITED" } }) : 0,
    can(viewer, "request.view") ? requestBadge(propertyId, { userId: viewer.id, viewAll: can(viewer, "request.view.all") }) : 0,
    prisma.property.findUnique({ where: { id: propertyId }, select: { name: true } }),
    prisma.owner.findFirst({ where: { propertyId, userId: viewer.id }, select: { id: true } }),
    can(viewer, "transaction.create") ? prisma.period.count({ where: { propertyId, status: "OPEN" } }) : 0,
  ]);
  const monthOpen = openMonths > 0;
  // Home PRD §4: + New entry for bookkeepers, + Request money for owners (it needs an owner record).
  // + New entry only while a month is open to add it to (else the drawer can't open).
  const action = can(viewer, "transaction.create") ? (monthOpen ? "entry" : null) : can(viewer, "request.create") && ownLink ? "request" : null;
  const name = [viewer.firstName, viewer.lastName].filter(Boolean).join(" ") || viewer.username;
  return (
    <div className="shell" lang={locale}>
      <ShellNav locale={locale} viewer={{ name, initials: initials(name), avatarUrl: viewer.avatarUrl, roles: viewer.roles, permissions: viewer.permissions }} pendingInvites={pendingInvites} requestBadge={requests} houseName={property?.name ?? null} monthOpen={monthOpen} />
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <span className="brand-mark">{tr("app.name")}</span>
          <div className="flex items-center gap-2">
            <LanguageToggle locale={locale} label={tr("lang.switchTo")} loggedIn />
            <TopbarAction locale={locale} action={action} />
          </div>
        </header>
        <main className="shell-main">{children}</main>
      </div>
    </div>
  );
}
