import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthFormSkeleton } from "@/components/skeletons/pages";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeLocalNext } from "@/lib/auth/safe-redirect";
import { getViewer } from "@/lib/auth/server";
import { t, translator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.login") };
}

export default async function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<AuthFormSkeleton locale={locale} />}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: { searchParams: PageProps<"/[lang]/login">["searchParams"] }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const next = safeLocalNext(typeof sp.next === "string" ? sp.next : null, locale);
  if (await getViewer()) redirect(next);
  const tr = translator(locale);
  return (
    <div className="form-stack" lang={locale}>
      <AuthHeading kicker={tr("login.kicker")} title={tr("login.title")} />
      <LoginForm locale={locale} next={next} />
    </div>
  );
}
