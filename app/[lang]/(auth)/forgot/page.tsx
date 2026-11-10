import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthFormSkeleton } from "@/components/skeletons/pages";
import { ForgotForm } from "@/components/auth/ForgotForm";
import { t, translator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.forgot") };
}

export default async function ForgotPage() {
  const locale = await getLocale();
  return (
    <Suspense fallback={<AuthFormSkeleton locale={locale} />}>
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
