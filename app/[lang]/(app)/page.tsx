import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { Suspense } from "react";
import { HomeDesk } from "@/components/app/HomeDesk";
import { requireViewer } from "@/lib/auth/server";
import { getLocale } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { closeReminder } from "@/lib/distribution/distribution-service";
import { prisma } from "@/lib/prisma";
import { currentPropertyId } from "@/lib/property";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.home") };
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const viewer = await requireViewer();
  const locale = await getLocale();
  // A5: admin blocks only for dashboard.admin, checked on the server.
  const stats = can(viewer, "dashboard.admin")
    ? {
        pendingInvites: await prisma.user.count({ where: { status: "INVITED" } }),
        activeUsers: await prisma.user.count({ where: { status: "ACTIVE" } }),
      }
    : null;
  const propertyId = await currentPropertyId();
  const [owner, reminder] = await Promise.all([
    can(viewer, "owner.view") ? prisma.owner.findFirst({ where: { propertyId, userId: viewer.id }, select: { id: true } }) : null,
    // F14: Close-the-month reminder for whoever can close it.
    can(viewer, "period.close") ? closeReminder(propertyId) : null,
  ]);
  return <HomeDesk locale={locale} name={viewer.firstName ?? viewer.username} permissions={viewer.permissions} stats={stats} ownerId={owner?.id ?? null} closeReminder={reminder} />;
}
