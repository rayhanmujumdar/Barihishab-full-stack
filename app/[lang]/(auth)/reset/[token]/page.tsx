import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthHeading, FormSkeleton } from "@/components/auth/AuthHeading";
import { ResetExpired } from "@/components/auth/ResetExpired";
import { ResetForm } from "@/components/auth/ResetForm";
import { inspectToken } from "@/lib/auth/token-service";
import { t, translator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.reset") };
}

export default function ResetPage({ params }: PageProps<"/[lang]/reset/[token]">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Reset params={params} />
    </Suspense>
  );
}

async function Reset({ params }: { params: PageProps<"/[lang]/reset/[token]">["params"] }) {
  const { token } = await params;
  await connection(); // expiry checks use the current time
  const locale = await getLocale();
  const tr = translator(locale);
  const inspection = await inspectToken(token, "RESET");
  const valid = inspection.status === "VALID" && inspection.token.user.status === "ACTIVE";
  return (
    <div className="form-stack" lang={locale}>
      <AuthHeading kicker={tr("reset.kicker")} title={tr("reset.title")} />
      {valid ? <ResetForm locale={locale} token={token} /> : <ResetExpired locale={locale} />}
    </div>
  );
}
