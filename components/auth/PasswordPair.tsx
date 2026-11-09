"use client";

import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { PasswordField } from "@/components/forms/fields";
import { translator, type Locale } from "@/lib/i18n";

export function passwordPairValid(pw: string, repeat: string) {
  return pw.length >= 8 && pw === repeat;
}

/** New + repeat password with live checks (Auth PRD §4 A3/A4). */
export function PasswordPair({
  locale,
  password,
  repeat,
  onPassword,
  onRepeat,
  error,
  idPrefix = "pw",
  newLabelKey = "reset.new",
  repeatLabelKey = "reset.repeat",
}: {
  locale: Locale;
  password: string;
  repeat: string;
  onPassword: (v: string) => void;
  onRepeat: (v: string) => void;
  error?: string | null;
  idPrefix?: string;
  newLabelKey?: "reset.new" | "me.new";
  repeatLabelKey?: "reset.repeat" | "me.repeat";
}) {
  const tr = translator(locale);
  const longEnough = password.length >= 8;
  const matches = repeat.length > 0 && password === repeat;
  const mismatch = repeat.length > 0 && password !== repeat;
  return (
    <>
      <PasswordField
        id={`${idPrefix}-new`}
        label={tr(newLabelKey)}
        placeholder={tr("ph.newPassword")}
        autoComplete="new-password"
        value={password}
        onChange={(e) => onPassword(e.target.value)}
        maxLength={128}
        required
        error={error}
        showLabel={tr("common.showPassword")}
        hideLabel={tr("common.hidePassword")}
      />
      <PasswordField
        id={`${idPrefix}-repeat`}
        label={tr(repeatLabelKey)}
        placeholder={tr("ph.repeatPassword")}
        autoComplete="new-password"
        value={repeat}
        onChange={(e) => onRepeat(e.target.value)}
        maxLength={128}
        required
        error={mismatch ? tr("reset.mismatch") : null}
        showLabel={tr("common.showPassword")}
        hideLabel={tr("common.hidePassword")}
      />
      <ul className="checks" aria-live="polite">
        <li data-ok={String(longEnough)}>
          {longEnough ? <CheckIcon className="size-3.5" aria-hidden /> : <XMarkIcon className="size-3.5" aria-hidden />}
          <span>{tr("reset.check.length")}</span>
          <span className="sr-only">{longEnough ? tr("common.met") : tr("common.notMet")}</span>
        </li>
        <li data-ok={String(matches)}>
          {matches ? <CheckIcon className="size-3.5" aria-hidden /> : <XMarkIcon className="size-3.5" aria-hidden />}
          <span>{tr("reset.check.match")}</span>
          <span className="sr-only">{matches ? tr("common.met") : tr("common.notMet")}</span>
        </li>
      </ul>
    </>
  );
}

export function policyMessage(locale: Locale, reason: unknown): string | null {
  const tr = translator(locale);
  switch (reason) {
    case "TOO_SHORT":
      return tr("pw.TOO_SHORT");
    case "TOO_LONG":
      return tr("pw.TOO_LONG");
    case "MATCHES_IDENTITY":
      return tr("pw.MATCHES_IDENTITY");
    case "TOO_COMMON":
      return tr("pw.TOO_COMMON");
    default:
      return null;
  }
}
