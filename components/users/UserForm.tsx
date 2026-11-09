"use client";

import { useState, type FormEvent } from "react";
import { ArrowRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ErrorStrip } from "@/components/forms/error-strip";
import { DateField, SelectField, TextField } from "@/components/forms/fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiFetch, fieldErrors, type ApiResult } from "@/lib/api/client";
import { translator, type Locale } from "@/lib/i18n";
import type { PublicUser } from "@/lib/users/dto";

type FormState = {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  surname: string;
  birthday: string;
  profession: string;
  phone: string;
  whatsapp: string;
  whatsappSameAsPhone: boolean;
  role: "SUPER_ADMIN" | "OWNER";
  houseResponsibility: string;
  locale: Locale;
};

function fromUser(u: PublicUser | null): FormState {
  return {
    username: u?.username ?? "",
    email: u?.email ?? "",
    firstName: u?.firstName ?? "",
    lastName: u?.lastName ?? "",
    surname: u?.surname ?? "",
    birthday: u?.birthday ?? "",
    profession: u?.profession ?? "",
    phone: u?.phone ?? "",
    whatsapp: u?.whatsapp ?? "",
    whatsappSameAsPhone: u?.whatsappSameAsPhone ?? false,
    role: u?.roles.includes("SUPER_ADMIN") ? "SUPER_ADMIN" : "OWNER",
    houseResponsibility: u?.houseResponsibility ?? "",
    locale: u?.locale ?? "bn",
  };
}

const CONFLICT_FIELD: Record<string, keyof FormState> = { USERNAME_TAKEN: "username", EMAIL_TAKEN: "email" };

/** New / edit user drawer (Auth PRD §4 A6). */
export function UserForm({
  locale,
  open,
  user,
  roleLocked,
  onClose,
  onSaved,
  onProfileSaved,
}: {
  locale: Locale;
  open: boolean;
  user: PublicUser | null;
  roleLocked: boolean;
  onClose: () => void;
  onSaved: (user: PublicUser, created: boolean) => void;
  /** Called when the profile saved but a follow-up step (role change) failed. */
  onProfileSaved?: (user: PublicUser) => void;
}) {
  const tr = translator(locale);
  const [form, setForm] = useState<FormState>(() => fromUser(user));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false);
  const isNew = !user;
  const currentRole = user?.roles.includes("SUPER_ADMIN") ? "SUPER_ADMIN" : "OWNER";
  // USR-02: the server revokes the user's sessions on any role change, so
  // both promotion and demotion ask first.
  const roleChanging = !isNew && !roleLocked && form.role !== currentRole;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function applyErrors(res: ApiResult<unknown>) {
    if (res.ok) return;
    const fields = fieldErrors(res);
    const conflict = CONFLICT_FIELD[res.error.code];
    if (conflict) fields[conflict] = res.error.message;
    setErrors(fields);
    if (Object.keys(fields).length === 0) setError(res.status === 0 ? tr("common.network") : res.error.message || tr("common.error"));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (roleChanging) {
      setRoleConfirmOpen(true);
      return;
    }
    void save();
  }

  async function save() {
    setPending(true);
    setErrors({});
    setError(null);
    const profile = {
      firstName: form.firstName,
      lastName: form.lastName,
      surname: form.surname,
      birthday: form.birthday || null,
      profession: form.profession,
      phone: form.phone,
      whatsapp: form.whatsappSameAsPhone ? form.phone : form.whatsapp,
      whatsappSameAsPhone: form.whatsappSameAsPhone,
      houseResponsibility: form.houseResponsibility,
      locale: form.locale,
      username: form.username,
      email: form.email,
    };

    if (isNew) {
      const res = await apiFetch<{ user: PublicUser }>("/users", { method: "POST", body: { ...profile, role: form.role } });
      setPending(false);
      if (res.ok) onSaved(res.data.user, true);
      else applyErrors(res);
      return;
    }

    const res = await apiFetch<{ user: PublicUser }>(`/users/${user.id}`, { method: "PATCH", body: profile });
    if (!res.ok) {
      setPending(false);
      setRoleConfirmOpen(false);
      applyErrors(res);
      return;
    }
    let saved = res.data.user;
    if (roleChanging) {
      // Promoting keeps an existing Owner role (one person can be both).
      const roles = form.role === "SUPER_ADMIN" ? [...(user.roles.includes("OWNER") ? ["OWNER"] : []), "SUPER_ADMIN"] : ["OWNER"];
      const r = await apiFetch<{ user: PublicUser }>(`/users/${user.id}/roles`, { method: "PUT", body: { roles } });
      if (!r.ok) {
        // The profile half already saved: show it in the table, keep the
        // drawer open with the role error so the admin can retry.
        setPending(false);
        setRoleConfirmOpen(false);
        setErrors({ role: r.error.message });
        onProfileSaved?.(saved);
        return;
      }
      saved = r.data.user;
    }
    setPending(false);
    onSaved(saved, false);
  }

  const title = isNew ? tr("users.drawer.new") : tr("users.drawer.edit", { name: user.name });
  const formId = "user-form";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-describedby={undefined}
        className="w-full gap-0 border-l-2 border-foreground bg-background p-0 sm:max-w-[540px]"
      >
        <SheetHeader className="flex-row items-center justify-between gap-3 border-b-2 border-foreground px-5 py-4">
          <SheetTitle className="text-[22px] font-extrabold tracking-[-0.015em]">{title}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label={tr("common.close")}>
              <XMarkIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <form id={formId} className="form-stack flex-1 overflow-y-auto p-5" onSubmit={onSubmit} noValidate>
          <ErrorStrip message={error} />
          {isNew ? (
            <Alert>
              <AlertDescription>{tr("users.drawer.inviteNote")}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid-2">
            <TextField id="u-username" label={`${tr("users.field.username")} *`} placeholder={tr("ph.username")} value={form.username} onChange={(e) => set("username", e.target.value.toLowerCase())} error={errors.username} autoCapitalize="none" required />
            <TextField id="u-email" type="email" label={`${tr("users.field.email")} *`} placeholder={tr("ph.email")} value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} required />
            <TextField id="u-first" label={tr("users.field.firstName")} placeholder={tr("ph.firstName")} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} error={errors.firstName} />
            <TextField id="u-last" label={tr("users.field.lastName")} placeholder={tr("ph.lastName")} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} error={errors.lastName} />
            <TextField id="u-surname" label={tr("users.field.surname")} placeholder={tr("ph.surname")} value={form.surname} onChange={(e) => set("surname", e.target.value)} error={errors.surname} />
            <DateField id="u-birthday" label={tr("users.field.birthday")} placeholder={tr("ph.birthday")} clearLabel={tr("common.clear")} locale={locale} disableFuture value={form.birthday} onChange={(v) => set("birthday", v)} error={errors.birthday} />
            <TextField id="u-profession" label={tr("users.field.profession")} placeholder={tr("ph.profession")} value={form.profession} onChange={(e) => set("profession", e.target.value)} error={errors.profession} />
            <TextField id="u-phone" type="tel" label={tr("users.field.phone")} placeholder={tr("ph.phone")} value={form.phone} onChange={(e) => set("phone", e.target.value)} error={errors.phone} />
          </div>
          <div className="flex flex-col gap-1">
            <TextField
              id="u-whatsapp"
              type="tel"
              label={tr("users.field.whatsapp")}
              placeholder={tr("ph.phone")}
              value={form.whatsappSameAsPhone ? form.phone : form.whatsapp}
              onChange={(e) => set("whatsapp", e.target.value)}
              disabled={form.whatsappSameAsPhone}
              error={errors.whatsapp}
            />
            <div className="flex min-h-11 items-center gap-2.5">
              <Checkbox id="u-same" checked={form.whatsappSameAsPhone} onCheckedChange={(v) => set("whatsappSameAsPhone", v === true)} />
              <Label htmlFor="u-same" className="text-sm font-normal">
                {tr("users.field.sameAsPhone")}
              </Label>
            </div>
          </div>
          <div className="grid-2">
            <SelectField
              id="u-role"
              label={`${tr("users.field.role")} *`}
              value={form.role}
              onChange={(e) => set("role", e.target.value as FormState["role"])}
              disabled={roleLocked}
              title={roleLocked ? tr("users.lastAdmin") : undefined}
              hint={roleLocked ? tr("users.lastAdmin") : undefined}
              error={errors.role}
              options={[
                { value: "OWNER", label: tr("role.OWNER") },
                { value: "SUPER_ADMIN", label: tr("role.SUPER_ADMIN") },
              ]}
            />
            <SelectField
              id="u-locale"
              label={tr("users.field.language")}
              value={form.locale}
              onChange={(e) => set("locale", e.target.value as Locale)}
              options={[
                { value: "bn", label: tr("lang.bn") },
                { value: "en", label: tr("lang.en") },
              ]}
            />
          </div>
          <TextField id="u-resp" label={tr("users.field.responsibility")} placeholder={tr("ph.responsibility")} value={form.houseResponsibility} onChange={(e) => set("houseResponsibility", e.target.value)} error={errors.houseResponsibility} />
        </form>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={pending || !form.username.trim() || !form.email.trim()}>
            {isNew ? tr("users.save.new") : tr("common.save")}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </SheetFooter>
      </SheetContent>
      {user ? (
        <ConfirmDialog
          open={roleConfirmOpen}
          onOpenChange={setRoleConfirmOpen}
          title={tr("users.dialog.roleChange", { name: user.name, role: tr(`role.${form.role}`) })}
          description={tr(form.role === "OWNER" ? "users.dialog.demoteBody" : "users.dialog.promoteBody")}
          confirmLabel={tr("users.action.changeRole")}
          cancelLabel={tr("common.cancel")}
          busy={pending}
          onConfirm={save}
        />
      ) : null}
    </Sheet>
  );
}
