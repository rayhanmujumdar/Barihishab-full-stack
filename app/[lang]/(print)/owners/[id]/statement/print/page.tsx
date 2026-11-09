import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { AutoPrint } from "@/components/owners/AutoPrint";
import { PrintStatement } from "@/components/owners/PrintStatement";
import { isUuid } from "@/lib/api/params";
import { requirePagePermission } from "@/lib/auth/server";
import { now, todayIsoInDhaka } from "@/lib/clock";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { ownerStatement } from "@/lib/owners/ledger-service";
import { getOwnerItem } from "@/lib/owners/owner-service";
import { parseRange } from "@/lib/owners/page-data";
import { prisma } from "@/lib/prisma";
import { currentPropertyId } from "@/lib/property";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "print.title") };
}

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Statement print view → browser "Save as PDF" (Owners PRD F4). No app chrome. */
export default function PrintPage(props: Props) {
  return (
    <main className="print-page">
      <Suspense fallback={null}>
        <Print {...props} />
      </Suspense>
    </main>
  );
}

async function Print({ params, searchParams }: Props) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("owner.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const range = parseRange(await searchParams, todayIsoInDhaka());
  const propertyId = await currentPropertyId();
  const [owner, property] = await Promise.all([getOwnerItem(propertyId, id, viewer.id), prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: { name: true } })]);
  if (!owner) notFound();
  const statement = await ownerStatement(propertyId, owner, range.from, range.to);
  const viewerName = [viewer.firstName, viewer.lastName].filter(Boolean).join(" ") || viewer.username;
  // File name for "Save as PDF": BariHisab-Statement-{OwnerName}-{From}-{To}.
  const title = `BariHisab-Statement-${owner.displayName}-${range.from}-${range.to === "latest" ? "Latest" : range.to}`;
  return (
    <>
      <AutoPrint title={title} label={t(locale, "print.print")} />
      <PrintStatement locale={locale} houseName={property.name} statement={statement} generatedAt={now().toISOString()} generatedBy={viewerName} />
    </>
  );
}
