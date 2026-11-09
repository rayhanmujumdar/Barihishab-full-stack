import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { OwnersView } from "@/components/owners/OwnersView";
import { requirePagePermission } from "@/lib/auth/server";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { listOwners } from "@/lib/owners/owner-service";
import { effectiveMonths, linkableUsers } from "@/lib/owners/page-data";
import { listShareSets } from "@/lib/owners/share-service";
import { ensureCurrentPeriod, listPeriods } from "@/lib/periods/period-service";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.owners") };
}

/** Owners list (Owners PRD F1, F5, F6, F7, F9). */
export default async function OwnersPage() {
  const locale = await getLocale();
  return (
    <Suspense fallback={<p className="muted">{t(locale, "owners.loading")}</p>}>
      <Owners />
    </Suspense>
  );
}

async function Owners() {
  const locale = await getLocale();
  const viewer = await requirePagePermission("owner.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const propertyId = await currentPropertyId();
  await ensureCurrentPeriod(propertyId);
  const manage = can(viewer, "owner.manage");
  const [list, timeline, { items: periods }, users] = await Promise.all([
    listOwners(propertyId, viewer.id),
    listShareSets(propertyId),
    listPeriods(propertyId),
    manage ? linkableUsers(propertyId) : Promise.resolve([]),
  ]);
  return (
    <OwnersView
      locale={locale}
      data={{
        list,
        timeline,
        periods,
        effectiveMonths: effectiveMonths(periods),
        linkableUsers: users,
        perms: { manage, shares: can(viewer, "share.manage") },
      }}
    />
  );
}
