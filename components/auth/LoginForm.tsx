"use client";

import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ErrorStrip } from "@/components/forms/error-strip";
import { PasswordField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api/client";
import { translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { hardNavigate } from "./navigate";

export function LoginForm({ locale, next, navigate = hardNavigate }: { locale: Locale; next: string; navigate?: (path: string) => void }) {
  const tr = translator(locale);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await apiFetch("/auth/login", { method: "POST", body: { identifier, password, remember } });
    if (res.ok) {
      navigate(next);
      return;
    }
    setPending(false);
    setPassword("");
    if (res.status === 423) setError(tr("login.error.locked"));
    else if (res.status === 429) setError(tr("common.rateLimited"));
    else if (res.status === 401) {
      const left = res.error.details?.attemptsLeft;
      setError(typeof left === "number" ? `${tr("login.error.invalid")} ${tr("login.attemptsLeft", { count: left })}` : tr("login.error.invalid"));
    } else if (res.status === 0) setError(tr("common.network"));
    else setError(tr("common.error"));
  }

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate>
      <ErrorStrip message={error} id="login-error" />
      <TextField
        id="identifier"
        label={tr("login.identifier")}
        placeholder={tr("ph.identifier")}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "login-error" : undefined}
      />
      <PasswordField
        id="password"
        label={tr("login.password")}
        placeholder={tr("ph.password")}
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "login-error" : undefined}
        showLabel={tr("common.showPassword")}
        hideLabel={tr("common.hidePassword")}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-h-11 items-center gap-2.5">
          <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
          <Label htmlFor="remember" className="text-sm font-normal">
            {tr("login.remember")}
          </Label>
        </div>
        <Button asChild variant="link">
          <Link href={localePath(locale, "/forgot")}>{tr("login.forgot")}</Link>
        </Button>
      </div>
      <Button type="submit" size="lg" className="w-full justify-between" disabled={pending || !identifier.trim() || !password}>
        {pending ? tr("login.submitting") : tr("login.submit")}
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
      <p className="muted">{tr("login.inviteOnly")}</p>
    </form>
  );
}
