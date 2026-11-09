"use client";

import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLogoutConfirm } from "@/components/app/logout-confirm";
import { translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";

export type InviteStateKind = { kind: "expired"; invitedBy?: string } | { kind: "used" } | { kind: "otherUser"; name: string };

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <Alert role="status">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function InviteState({ locale, state }: { locale: Locale; state: InviteStateKind }) {
  const tr = translator(locale);
  const otherName = state.kind === "otherUser" ? state.name : "";
  const { ask, leaving, dialog } = useLogoutConfirm({
    locale,
    onLoggedOut: () => window.location.reload(),
    title: tr("invite.logoutConfirm.title", { name: otherName }),
    description: tr("invite.logoutConfirm.body"),
  });

  if (state.kind === "expired") return <Notice>{tr("invite.expired", { admin: state.invitedBy ?? "BariHisab" })}</Notice>;
  if (state.kind === "used") {
    return (
      <div className="form-stack">
        <Notice>{tr("invite.used")}</Notice>
        <Button asChild size="lg" className="w-full justify-between">
          <Link href={localePath(locale, "/login")}>
            {tr("invite.login")}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="form-stack">
      <Notice>{tr("invite.otherUser", { name: state.name })}</Notice>
      <Button
        size="lg"
        className="w-full justify-between"
        disabled={leaving}
        onClick={ask}
      >
        {tr("invite.logoutContinue")}
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
      {dialog}
    </div>
  );
}
