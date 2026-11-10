import { Suspense } from "react";
import { ShellNav } from "@/components/app/ShellNav";
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
  const pendingInvites = can(viewer, "user.list") ? await prisma.user.count({ where: { status: "INVITED" } }) : 0;
  const requests = can(viewer, "request.view") ? await requestBadge(await currentPropertyId(), { userId: viewer.id, viewAll: can(viewer, "request.view.all") }) : 0;
  const name = [viewer.firstName, viewer.lastName].filter(Boolean).join(" ") || viewer.username;
  return (
    <div className="shell" lang={locale}>
      <ShellNav locale={locale} viewer={{ name, initials: initials(name), avatarUrl: viewer.avatarUrl, roles: viewer.roles, permissions: viewer.permissions }} pendingInvites={pendingInvites} requestBadge={requests} />
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <span className="brand-mark">{tr("app.name")}</span>
          <LanguageToggle locale={locale} label={tr("lang.switchTo")} loggedIn />
        </header>
        <main className="shell-main">{children}</main>
      </div>
    </div>
  );
}
