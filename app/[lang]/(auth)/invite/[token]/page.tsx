import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { FormSkeleton, AuthHeading } from "@/components/auth/AuthHeading";
import { AcceptInviteForm } from "@/components/auth/AcceptInviteForm";
import { hoursLeft } from "@/lib/auth/invite-hours";
import { InviteState } from "@/components/auth/InviteState";
import { inviterName } from "@/lib/auth/invite-service";
import { getViewer } from "@/lib/auth/server";
import { inspectToken } from "@/lib/auth/token-service";
import { t, translator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { displayName } from "@/lib/users/dto";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.invite") };
}

export default function InvitePage({ params }: PageProps<"/[lang]/invite/[token]">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Invite params={params} />
    </Suspense>
  );
}

async function Invite({ params }: { params: PageProps<"/[lang]/invite/[token]">["params"] }) {
  const { token } = await params;
  await connection(); // expiry checks use the current time
  const [inspection, viewer] = await Promise.all([inspectToken(token, "INVITE"), getViewer()]);
  const locale = await getLocale();
  const tr = translator(locale);

  let body;
  if (viewer && (!inspection.token || viewer.id !== inspection.token.userId)) {
    body = <InviteState locale={locale} state={{ kind: "otherUser", name: viewer.firstName ?? viewer.username }} />;
  } else if (inspection.status === "EXPIRED") {
    body = <InviteState locale={locale} state={{ kind: "expired", invitedBy: inspection.token ? inviterName(inspection.token) : undefined }} />;
  } else if (inspection.status === "USED" || inspection.token.user.status !== "INVITED") {
    body = <InviteState locale={locale} state={{ kind: "used" }} />;
  } else {
    const u = inspection.token.user;
    return (
      <div lang={locale}>
        <AcceptInviteForm
          locale={locale}
          token={token}
          info={{
            firstName: u.firstName ?? displayName(u),
            username: u.username,
            invitedBy: inviterName(inspection.token),
            expiresAt: inspection.token.expiresAt.toISOString(),
            hoursLeft: hoursLeft(inspection.token.expiresAt.toISOString()),
            locale: u.locale,
          }}
        />
      </div>
    );
  }
  return (
    <div className="form-stack" lang={locale}>
      <AuthHeading kicker={tr("invite.kicker")} title={tr("invite.title")} />
      {body}
    </div>
  );
}
