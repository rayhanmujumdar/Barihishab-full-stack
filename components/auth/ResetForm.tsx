"use client";

import { useState, type FormEvent } from "react";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { ErrorStrip } from "@/components/forms/error-strip";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { hardNavigate } from "./navigate";
import { PasswordPair, passwordPairValid, policyMessage } from "./PasswordPair";
import { ResetExpired } from "./ResetExpired";

export function ResetForm({ locale, token, navigate = hardNavigate }: { locale: Locale; token: string; navigate?: (path: string) => void }) {
  const tr = translator(locale);
  const reset = useApiMutation(["auth", "reset"], (password: string) => apiFetch("/auth/reset", { method: "POST", body: { token, password } }));
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFieldError(null);
    const res = await reset.run(password);
    if (res.ok) {
      navigate(localePath(locale, "/"));
      return;
    }
    setPending(false);
    if (res.status === 410) setExpired(true);
    else if (res.status === 422) setFieldError(policyMessage(locale, res.error.details?.reason) ?? tr("common.error"));
    else if (res.status === 429) setError(tr("common.rateLimited"));
    else setError(tr(res.status === 0 ? "common.network" : "common.error"));
  }

  if (expired) return <ResetExpired locale={locale} />;

  return (
    <form className="form-stack" onSubmit={onSubmit}>
      <ErrorStrip message={error} />
      <PasswordPair locale={locale} password={password} repeat={repeat} onPassword={setPassword} onRepeat={setRepeat} error={fieldError} />
      <Button type="submit" size="lg" className="w-full justify-between" disabled={pending || !passwordPairValid(password, repeat)}>
        {tr("reset.submit")}
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </form>
  );
}
