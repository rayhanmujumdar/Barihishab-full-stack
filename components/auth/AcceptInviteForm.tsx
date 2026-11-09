"use client";

import { useState, type FormEvent } from "react";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { ErrorStrip } from "@/components/forms/error-strip";
import { TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiFetch } from "@/lib/api/client";
import { hoursLeft } from "@/lib/auth/invite-hours";
import { translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { InviteState } from "./InviteState";
import { hardNavigate } from "./navigate";
import { PasswordPair, passwordPairValid, policyMessage } from "./PasswordPair";

export type InviteInfo = {
  firstName: string;
  username: string;
  invitedBy: string;
  expiresAt: string;
  locale: Locale;
  /** Whole hours left, computed on the server so SSR and hydration agree. */
  hoursLeft?: number;
};

export function AcceptInviteForm({
  locale,
  token,
  info,
  navigate = hardNavigate,
}: {
  locale: Locale;
  token: string;
  info: InviteInfo;
  navigate?: (path: string) => void;
}) {
  const tr = translator(locale);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [chosen, setChosen] = useState<Locale>(info.locale ?? locale);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dead, setDead] = useState<"expired" | "used" | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFieldError(null);
    const res = await apiFetch("/auth/accept-invite", { method: "POST", body: { token, password, locale: chosen } });
    if (res.ok) {
      navigate(localePath(chosen, "/"));
      return;
    }
    setPending(false);
    if (res.status === 410) setDead(res.error.code === "TOKEN_USED" ? "used" : "expired");
    else if (res.status === 422) setFieldError(policyMessage(locale, res.error.details?.reason) ?? tr("common.error"));
    else if (res.status === 429) setError(tr("common.rateLimited"));
    else setError(tr(res.status === 0 ? "common.network" : "common.error"));
  }

  if (dead === "expired") return <InviteState locale={locale} state={{ kind: "expired", invitedBy: info.invitedBy }} />;
  if (dead === "used") return <InviteState locale={locale} state={{ kind: "used" }} />;

  return (
    <form className="form-stack" onSubmit={onSubmit}>
      <div>
        <p className="kicker">{tr("invite.expiresIn", { hours: info.hoursLeft ?? hoursLeft(info.expiresAt) })}</p>
        <h1 className="page-title">{tr("invite.welcome", { name: info.firstName })}</h1>
      </div>
      <p>{tr("invite.intro", { admin: info.invitedBy })}</p>
      <ErrorStrip message={error} />
      <TextField id="invite-username" label={tr("invite.username")} value={info.username} readOnly />
      <PasswordPair locale={locale} password={password} repeat={repeat} onPassword={setPassword} onRepeat={setRepeat} error={fieldError} idPrefix="invite" />
      <FieldSet>
        <FieldLegend variant="label" className="text-xs font-semibold text-muted-foreground">
          {tr("invite.language")}
        </FieldLegend>
        <RadioGroup value={chosen} onValueChange={(v) => setChosen(v as Locale)} className="flex gap-6">
          {(["bn", "en"] as const).map((l) => (
            <div key={l} className="flex min-h-11 items-center gap-2.5" lang={l}>
              <RadioGroupItem value={l} id={`invite-locale-${l}`} />
              <Label htmlFor={`invite-locale-${l}`} className="text-sm font-semibold">
                {tr(l === "bn" ? "lang.bn" : "lang.en")}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </FieldSet>
      <Button type="submit" size="lg" className="w-full justify-between" disabled={pending || !passwordPairValid(password, repeat)}>
        {tr("invite.submit")}
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </form>
  );
}
