import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { PrintLoanStatement } from "@/components/loans/PrintLoanStatement";
import { AutoPrint } from "@/components/owners/AutoPrint";
import { isUuid } from "@/lib/api/params";
import { requirePagePermission } from "@/lib/auth/server";
import { now } from "@/lib/clock";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { loanDetail } from "@/lib/loans/loan-read";
import { prisma } from "@/lib/prisma";
import { currentPropertyId } from "@/lib/property";
import { StatementPrintSkeleton } from "@/components/skeletons/pages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.loanStatement") };
}

type Props = { params: Promise<{ id: string }> };

/** Loan statement print view → browser "Save as PDF" (Advances & Loans PRD F15). No app chrome. */
export default async function LoanPrintPage(props: Props) {
  const locale = await getLocale();
  return (
    <main className="print-page">
      <Suspense fallback={<StatementPrintSkeleton locale={locale} />}>
        <Print {...props} />
      </Suspense>
    </main>
  );
}

async function Print({ params }: Props) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("loan.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const propertyId = await currentPropertyId();
  const detail = await loanDetail(propertyId, id);
  if (!detail) notFound();
  const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: { name: true } });
  return (
    <>
      <AutoPrint title={`BariHisab-Loan-L${detail.loan.number}-${detail.loan.ownerName}`} label={t(locale, "print.print")} />
      <PrintLoanStatement locale={locale} houseName={property.name} detail={detail} generatedAt={now().toISOString()} />
    </>
  );
}
