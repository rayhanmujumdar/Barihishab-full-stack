import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { SettingsView } from "@/components/settings/SettingsView";
import { requireViewer } from "@/lib/auth/server";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { listCategories } from "@/lib/master-data/category-service";
import { listFunds } from "@/lib/master-data/fund-service";
import { listUnits } from "@/lib/master-data/unit-service";
import { getReserveSettings } from "@/lib/distribution/reserve-service";
import { loadAdvanceLimit } from "@/lib/loans/settings-service";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.settings") };
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <Settings />
    </Suspense>
  );
}

/** Settings › master data (Income & Expenses PRD §6.6). */
async function Settings() {
  const locale = await getLocale();
  const viewer = await requireViewer();
  const allowed = { units: can(viewer, "unit.manage"), funds: can(viewer, "fund.manage"), categories: can(viewer, "category.manage") };
  const reserveAllowed = can(viewer, "settings.manage");
  if (!allowed.units && !allowed.funds && !allowed.categories && !reserveAllowed) return <Forbidden locale={locale} />;
  const propertyId = await currentPropertyId();
  const [units, funds, categories, reserve] = await Promise.all([
    listUnits(propertyId),
    listFunds(propertyId),
    listCategories(propertyId),
    reserveAllowed ? getReserveSettings(propertyId) : null,
  ]);
  const advanceLimitPct = reserveAllowed ? (await loadAdvanceLimit(prisma, propertyId)).multiplierPct : null;
  return <SettingsView locale={locale} units={units} funds={funds} categories={categories} can={allowed} reserve={reserve} advanceLimitPct={advanceLimitPct} />;
}
