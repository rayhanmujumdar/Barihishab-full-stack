"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ErrorStrip } from "@/components/forms/error-strip";
import { RequiredLegend, SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";
import { Choice } from "./Choice";
import type { OwnerDto, UserLite } from "./types";

type Mode = "link" | "name";

/** Add owner (F7) or Edit owner (F8). Owners are never deleted, so there is no delete control. */
export function OwnerFormDialog({
  locale,
  owner,
  users,
  onClose,
  onSaved,
  onGiveShares,
}: {
  locale: Locale;
  owner?: OwnerDto & { userName?: string | null };
  users: UserLite[];
  onClose: () => void;
  onSaved: () => void;
  onGiveShares: () => void;
}) {
  const tr = translator(locale);
  const editing = !!owner;
  const [mode, setMode] = useState<Mode>(users.length ? "link" : "name");
  const [userId, setUserId] = useState(owner?.userId ?? "");
  const [name, setName] = useState(owner?.displayName ?? "");
  const [initials, setInitials] = useState(owner?.initials ?? "");
  const [order, setOrder] = useState(owner ? String(owner.sortOrder) : "");
  const [note, setNote] = useState(owner?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saveOwner = useApiMutation(["owners", "save"], (v: { id?: string; body: Record<string, unknown> }) =>
    apiFetch<{ owner: OwnerDto }>(v.id ? `/owners/${v.id}` : "/owners", { method: v.id ? "PATCH" : "POST", body: v.body }), { invalidate: [qk.owners.all] });
  const [added, setAdded] = useState<string | null>(null);

  const loginOptions = [
    { value: "", label: tr("of.noLogin") },
    ...(owner?.userId ? [{ value: owner.userId, label: owner.userName ?? owner.displayName }] : []),
    ...users.map((u) => ({ value: u.id, label: u.name })),
  ];

  function pickUser(id: string) {
    const prev = users.find((u) => u.id === userId)?.name;
    setUserId(id);
    if (!name || name === prev) setName(users.find((u) => u.id === id)?.name ?? "");
    setErrors((e) => ({ ...e, userId: "", displayName: "" }));
  }

  function body(): Record<string, unknown> {
    const extra = {
      ...(initials.trim() && initials.trim() !== owner?.initials ? { initials: initials.trim() } : {}),
      ...(order.trim() && Number(order) !== owner?.sortOrder ? { sortOrder: Number(order) } : {}),
    };
    if (!owner) return { ...(mode === "link" ? { userId } : {}), displayName: name.trim(), ...extra };
    return {
      ...(name.trim() !== owner.displayName ? { displayName: name.trim() } : {}),
      ...extra,
      ...((note.trim() || null) !== owner.note ? { note: note.trim() || null } : {}),
      ...((userId || null) !== owner.userId ? { userId: userId || null } : {}),
    };
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!editing && mode === "link" && !userId) e.userId = tr("of.err.user");
    if (!name.trim()) e.displayName = tr("of.err.name");
    setErrors(e);
    if (Object.keys(e).length) return;
    const b = body();
    if (editing && !Object.keys(b).length) return onClose();
    setBusy(true);
    setError(null);
    const res = await saveOwner.run({ id: owner?.id, body: b });
    setBusy(false);
    if (!res.ok) {
      setError(res.status === 0 ? tr("common.network") : res.error.message);
      return;
    }
    onSaved();
    if (editing) {
      toast(tr("of.toast"));
      onClose();
    } else setAdded(res.data.owner.displayName);
  }

  if (added) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="gap-4 rounded-none sm:max-w-[480px]" lang={locale}>
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold">{tr("of.savedTitle")}</DialogTitle>
            <DialogDescription>{tr("of.savedBody", { name: added })}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {tr("of.later")}
            </Button>
            <Button onClick={onGiveShares}>{tr("of.giveShares")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto rounded-none sm:max-w-[520px]" lang={locale} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">{tr(editing ? "of.editTitle" : "of.addTitle")}</DialogTitle>
        </DialogHeader>
        <form id="owner-form" className="form-stack" onSubmit={onSubmit} noValidate>
          <ErrorStrip message={error} />
          <RequiredLegend text={tr("common.required")} />
          {!editing ? (
            <Choice
              id="of-mode"
              label={tr("of.mode")}
              value={mode}
              onChange={setMode}
              options={[
                { value: "link", label: tr("of.mode.link") },
                { value: "name", label: tr("of.mode.name") },
              ]}
            />
          ) : null}
          {!editing && mode === "link" ? (
            <SelectField
              id="of-user"
              label={tr("of.user")}
              required
              value={userId}
              onChange={(e) => pickUser(e.target.value)}
              error={errors.userId}
              options={users.length ? [{ value: "", label: "—" }, ...users.map((u) => ({ value: u.id, label: u.name }))] : [{ value: "", label: tr("of.user.none") }]}
            />
          ) : null}
          <TextField id="of-name" label={tr("of.name")} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} error={errors.displayName} />
          <div className="grid-2">
            <TextField id="of-initials" label={tr("of.initials")} maxLength={3} value={initials} onChange={(e) => setInitials(e.target.value)} />
            <TextField id="of-order" label={tr("of.order")} inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value.replace(/\D/g, ""))} />
          </div>
          {editing ? (
            <>
              <TextField id="of-note" label={tr("of.note")} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
              <SelectField id="of-login" label={tr("of.login")} value={userId} onChange={(e) => setUserId(e.target.value)} options={loginOptions} />
            </>
          ) : null}
        </form>
        <DialogFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form="owner-form" disabled={busy}>
            {tr("of.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
