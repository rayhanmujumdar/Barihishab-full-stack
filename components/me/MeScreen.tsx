"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PasswordPair, passwordPairValid, policyMessage } from "@/components/auth/PasswordPair";
import { hardNavigate } from "@/components/auth/navigate";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { ErrorStrip } from "@/components/forms/error-strip";
import { DateField, PasswordField, RequiredLegend, TextField } from "@/components/forms/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { apiFetch, fieldErrors } from "@/lib/api/client";
import { formatDateTime, translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { can, type Permission } from "@/lib/permissions";
import type { PublicUser } from "@/lib/users/dto";

export type SessionItem = { id: string; device: string; browser: string; ip: string | null; createdAt: string; lastSeenAt: string; current: boolean };

/** Profile & security (Auth PRD §4 A7). */
export function MeScreen({
  locale,
  profile,
  permissions,
  sessions: initialSessions,
  navigate = hardNavigate,
}: {
  locale: Locale;
  profile: PublicUser;
  permissions: Permission[];
  sessions: SessionItem[];
  navigate?: (path: string) => void;
}) {
  const tr = translator(locale);
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const canIdentity = can({ permissions }, "profile.identity.self");
  const [form, setForm] = useState({
    username: profile.username,
    email: profile.email,
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    surname: profile.surname ?? "",
    birthday: profile.birthday ?? "",
    profession: profile.profession ?? "",
    phone: profile.phone ?? "",
    whatsapp: profile.whatsapp ?? "",
    whatsappSameAsPhone: profile.whatsappSameAsPhone,
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [pwErrors, setPwErrors] = useState<{ current?: string; next?: string }>({});
  const [changing, setChanging] = useState(false);

  const [sessions, setSessions] = useState(initialSessions);
  const [confirmAll, setConfirmAll] = useState(false);
  // AUTH-07: revoking a device asks first, naming it.
  // Target kept separate from `open` so the title doesn't blank during the close animation.
  const [revoking, setRevoking] = useState<SessionItem | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const set = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErrors({});
    setProfileError(null);
    const body: Record<string, unknown> = {
      firstName: form.firstName,
      lastName: form.lastName,
      surname: form.surname,
      birthday: form.birthday || null,
      profession: form.profession,
      phone: form.phone,
      whatsapp: form.whatsappSameAsPhone ? form.phone : form.whatsapp,
      whatsappSameAsPhone: form.whatsappSameAsPhone,
    };
    if (canIdentity) {
      body.username = form.username;
      body.email = form.email;
    }
    const res = await apiFetch("/me", { method: "PATCH", body });
    setSavingProfile(false);
    if (res.ok) {
      toast(tr("me.saved"));
      router.refresh(); // sidebar name/initials come from the server layout
      return;
    }
    const fields = fieldErrors(res);
    if (res.error.code === "USERNAME_TAKEN") fields.username = res.error.message;
    if (res.error.code === "EMAIL_TAKEN") fields.email = res.error.message;
    setProfileErrors(fields);
    if (Object.keys(fields).length === 0) setProfileError(res.error.message || tr("common.error"));
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setChanging(true);
    setPwErrors({});
    const res = await apiFetch("/me/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
    setChanging(false);
    if (res.ok) {
      setCurrent("");
      setNext("");
      setRepeat("");
      setSessions((s) => s.filter((x) => x.current));
      toast(tr("me.changed"));
      return;
    }
    if (res.status === 401) setPwErrors({ current: tr("me.wrongCurrent") });
    else if (res.status === 423) setPwErrors({ current: tr("login.error.locked") });
    else if (res.status === 422) setPwErrors({ next: policyMessage(locale, res.error.details?.reason) ?? tr("common.error") });
    else setPwErrors({ current: tr("common.error") });
  }

  async function revoke(session: SessionItem) {
    setRevokeBusy(true);
    const res = await apiFetch(`/me/sessions/${session.id}`, { method: "DELETE" });
    setRevokeBusy(false);
    setRevokeOpen(false);
    if (!res.ok) {
      toast.error(res.status === 0 ? tr("common.network") : res.error.message || tr("common.error"));
      return;
    }
    if (session.current) navigate(localePath(locale, "/login"));
    else setSessions((s) => s.filter((x) => x.id !== session.id));
  }

  async function logoutAll() {
    setLoggingOut(true);
    const res = await apiFetch("/auth/logout-all", { method: "POST" });
    if (res.ok) {
      navigate(localePath(locale, "/login"));
      return;
    }
    setLoggingOut(false);
    setConfirmAll(false);
    toast.error(tr("common.logoutFailed"));
  }

  const locked = canIdentity ? undefined : tr("me.identityLocked");

  return (
    <div className="page-stack" lang={locale}>
      <div>
        <p className="kicker">{tr("me.kicker")}</p>
        <h1 className="page-title">{tr("me.title")}</h1>
      </div>

      <section aria-labelledby="me-profile">
        <div className="section-head">
          <h2 id="me-profile">{tr("me.profile")}</h2>
        </div>
        <form className="form-stack max-w-[760px]" onSubmit={saveProfile} noValidate>
          <ErrorStrip message={profileError} />
          {canIdentity ? <RequiredLegend text={tr("common.required")} /> : null}
          <div className="grid-2">
            <TextField id="me-username" label={tr("users.field.username")} placeholder={tr("ph.username")} value={form.username} readOnly={!canIdentity} required={canIdentity} hint={locked} onChange={(e) => set("username", e.target.value.toLowerCase())} error={profileErrors.username} />
            <TextField id="me-email" type="email" label={tr("users.field.email")} placeholder={tr("ph.email")} value={form.email} readOnly={!canIdentity} required={canIdentity} hint={locked} onChange={(e) => set("email", e.target.value)} error={profileErrors.email} />
            <TextField id="me-first" label={tr("users.field.firstName")} placeholder={tr("ph.firstName")} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} error={profileErrors.firstName} />
            <TextField id="me-last" label={tr("users.field.lastName")} placeholder={tr("ph.lastName")} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} error={profileErrors.lastName} />
            <TextField id="me-surname" label={tr("users.field.surname")} placeholder={tr("ph.surname")} value={form.surname} onChange={(e) => set("surname", e.target.value)} error={profileErrors.surname} />
            <DateField id="me-birthday" label={tr("users.field.birthday")} placeholder={tr("ph.birthday")} clearLabel={tr("common.clear")} locale={locale} disableFuture value={form.birthday} onChange={(v) => set("birthday", v)} error={profileErrors.birthday} />
            <TextField id="me-profession" label={tr("users.field.profession")} placeholder={tr("ph.profession")} value={form.profession} onChange={(e) => set("profession", e.target.value)} error={profileErrors.profession} />
            <TextField id="me-phone" type="tel" label={tr("users.field.phone")} placeholder={tr("ph.phone")} value={form.phone} onChange={(e) => set("phone", e.target.value)} error={profileErrors.phone} />
            <div className="flex flex-col gap-1">
              <TextField id="me-whatsapp" type="tel" label={tr("users.field.whatsapp")} placeholder={tr("ph.phone")} value={form.whatsappSameAsPhone ? form.phone : form.whatsapp} disabled={form.whatsappSameAsPhone} onChange={(e) => set("whatsapp", e.target.value)} error={profileErrors.whatsapp} />
              <div className="flex min-h-11 items-center gap-2.5">
                <Checkbox id="me-same" checked={form.whatsappSameAsPhone} onCheckedChange={(v) => set("whatsappSameAsPhone", v === true)} />
                <Label htmlFor="me-same" className="text-sm font-normal">
                  {tr("users.field.sameAsPhone")}
                </Label>
              </div>
            </div>
          </div>
          <div>
            <Button type="submit" disabled={savingProfile}>
              {tr("common.save")}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="me-security">
        <div className="section-head">
          <h2 id="me-security">{tr("me.security")}</h2>
        </div>
        <form className="form-stack max-w-[520px]" onSubmit={changePassword}>
          <PasswordField
            id="me-current"
            label={tr("me.current")}
            placeholder={tr("ph.currentPassword")}
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            error={pwErrors.current}
            showLabel={tr("common.showPassword")}
            hideLabel={tr("common.hidePassword")}
          />
          <PasswordPair locale={locale} password={next} repeat={repeat} onPassword={setNext} onRepeat={setRepeat} error={pwErrors.next} idPrefix="me" newLabelKey="me.new" repeatLabelKey="me.repeat" />
          <div>
            <Button type="submit" disabled={changing || !current || !passwordPairValid(next, repeat)}>
              {tr("me.changeSubmit")}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="me-sessions">
        <div className="section-head">
          <h2 id="me-sessions">{tr("me.sessions")}</h2>
        </div>
        <ul className="m-0 list-none p-0">
          {sessions.map((s) => (
            <li key={s.id} className="list-row">
              <div>
                <div className="flex flex-wrap items-center gap-2 font-bold">
                  {s.device} · {s.browser} {s.current ? <Badge variant="accent">{tr("me.session.current")}</Badge> : null}
                </div>
                <div className="muted">
                  {[s.ip, tr("me.session.lastActive", { time: formatDateTime(locale, s.lastSeenAt) ?? "" })].filter(Boolean).join(" · ")}
                </div>
              </div>
              {s.current ? null : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setRevoking(s);
                    setRevokeOpen(true);
                  }}
                >
                  {tr("me.session.logout")}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <Button id="me-logout-all" variant="destructive" className="mt-4" onClick={() => setConfirmAll(true)}>
          {tr("me.logoutAll")}
        </Button>
      </section>

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={tr("me.logoutAll")}
        description={tr("me.logoutAllConfirm")}
        confirmLabel={tr("me.logoutAll")}
        cancelLabel={tr("common.cancel")}
        busy={loggingOut}
        onConfirm={logoutAll}
      />

      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title={tr("me.session.confirm.title", { device: revoking ? `${revoking.device} · ${revoking.browser}` : "" })}
        description={tr("me.session.confirm.body")}
        confirmLabel={tr("me.session.logout")}
        cancelLabel={tr("common.cancel")}
        busy={revokeBusy}
        onConfirm={() => (revoking ? revoke(revoking) : undefined)}
        // The revoked row (and its button) disappears; land on the next useful control.
        returnFocusTo={() => document.getElementById("me-logout-all")}
      />
    </div>
  );
}
