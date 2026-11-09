import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading, FormSkeleton } from "@/components/auth/AuthHeading";
import { ForgotForm } from "@/components/auth/ForgotForm";
import { t, translator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.forgot") };
}

export default function ForgotPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Forgot />
    </Suspense>
  );
}

async function Forgot() {
  const locale = await getLocale();
  const tr = translator(locale);
  return (
    <div className="form-stack" lang={locale}>
      <AuthHeading kicker={tr("forgot.kicker")} title={tr("forgot.title")} />
      <ForgotForm locale={locale} />
    </div>
  );
}
