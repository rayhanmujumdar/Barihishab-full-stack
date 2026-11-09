"use client";

import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ErrorStrip } from "@/components/forms/error-strip";
import { TextField } from "@/components/forms/fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";

export function ForgotForm({ locale }: { locale: Locale }) {
  const tr = translator(locale);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await apiFetch("/auth/forgot", { method: "POST", body: { email } });
    setPending(false);
    // PWD-01: the outcome never reveals whether the account exists.
    if (!res.ok && res.status === 429) setError(tr("common.rateLimited"));
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="form-stack">
        <Alert variant="success" role="status">
          <AlertDescription>{tr("forgot.sent")}</AlertDescription>
        </Alert>
        <p className="muted">{tr("forgot.sentHint")}</p>
        <Button asChild variant="outline" className="justify-between">
          <Link href={localePath(locale, "/login")}>{tr("common.backToLogin")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form className="form-stack" onSubmit={onSubmit}>
      <ErrorStrip message={error} />
      <p>{tr("forgot.intro")}</p>
      <TextField id="email" type="email" label={tr("forgot.email")} placeholder={tr("ph.email")} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Button type="submit" size="lg" className="w-full justify-between" disabled={pending || !email.trim()}>
        {tr("forgot.submit")}
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
      <Button asChild variant="link" className="self-start">
        <Link href={localePath(locale, "/login")}>{tr("common.backToLogin")}</Link>
      </Button>
    </form>
  );
}
