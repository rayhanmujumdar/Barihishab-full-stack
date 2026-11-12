"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AttachmentPicker } from "@/components/entries/AttachmentPicker";
import { ErrorStrip } from "@/components/forms/error-strip";
import { DateField, TextAreaField, TextField } from "@/components/forms/fields";
import { Choice } from "@/components/owners/Choice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";
import { NoticeCard } from "./NoticeCard";
import type { NoticeDto } from "./types";

type Priority = "NORMAL" | "URGENT";
const MAX_FILES = 5;

/** N2 / N3: new notice (Publish & email) or edit (Save, optional Email the change), with Preview. */
export function NoticeDialog({
  locale,
  notice,
  reach,
  onClose,
  onDone,
}: {
  locale: Locale;
  notice?: NoticeDto;
  /** Members a normal notice emails (opt-outs excluded) and all active members (urgent). */
  reach: { normal: number; all: number };
  onClose: () => void;
  onDone: () => void;
}) {
  const tr = translator(locale);
  const editing = !!notice;
  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [priority, setPriority] = useState<Priority>(notice?.priority ?? "NORMAL");
  const [pinned, setPinned] = useState(notice?.pinned ?? false);
  const [pinUntil, setPinUntil] = useState(notice?.pinned ? (notice.pinUntil ?? "") : "");
  const [emailChange, setEmailChange] = useState<boolean | null>(null);
  const [files, setFiles] = useState<{ ids: string[]; busy: boolean }>({ ids: [], busy: false });
  const [preview, setPreview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const email = emailChange ?? priority === "URGENT";
  const save = useApiMutation(["notices", editing ? notice.id : "new"], (b: Record<string, unknown>) =>
    editing ? apiFetch<{ emailed: number }>(`/notices/${notice.id}`, { method: "PATCH", body: b }) : apiFetch<{ emailed: number }>("/notices", { method: "POST", body: b }),
  );

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (save.isPending || files.busy) return;
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = tr("nc.err.title");
    if (!body.trim()) e.body = tr("nc.err.message");
    setErrors(e);
    if (Object.keys(e).length) return;
    setError(null);
    const payload: Record<string, unknown> = {
      title: title.trim(),
      body: body.trim(),
      priority,
      pinned,
      pinUntil: pinned && pinUntil ? pinUntil : null,
      ...(files.ids.length ? { attachmentIds: files.ids } : {}),
      ...(editing ? { emailChange: email } : {}),
    };
    const res = await save.run(payload);
    if (!res.ok) {
      const fields = res.error.details?.fields ?? {};
      setErrors(fields);
      return setError(Object.keys(fields).length ? null : res.status === 0 ? tr("common.network") : res.error.message);
    }
    const n = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-GB").format(res.data.emailed);
    toast(editing ? (email ? tr("nc.toast.savedEmailed", { n }) : tr("nc.toast.saved")) : tr("nc.toast.published", { n }));
    onDone();
  }

  const reachN = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-GB").format(priority === "URGENT" ? reach.all : reach.normal);
  const draft: NoticeDto = {
    id: "preview",
    title: title || tr("nc.form.title"),
    body: body || "…",
    priority,
    pinned,
    pinUntil: pinUntil || null,
    publishedAt: notice?.publishedAt ?? new Date().toISOString(),
    authorName: "",
    editedAt: null,
    archivedAt: null,
    attachments: [],
    readCount: 0,
    memberCount: reach.all,
    read: true,
    remindedToday: false,
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto max-sm:h-[100dvh] max-sm:max-w-full sm:max-h-[90vh] sm:max-w-[600px]" lang={locale}>
        <DialogHeader>
          <DialogTitle>{tr(editing ? "nc.form.editTitle" : "nc.form.newTitle")}</DialogTitle>
          <DialogDescription>{tr("nc.form.sub")}</DialogDescription>
        </DialogHeader>
        <form id="notice-form" className="form-stack" onSubmit={onSubmit} noValidate>
          <ErrorStrip message={error} />
          <TextField id="notice-title" label={tr("nc.form.title")} required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
          <TextAreaField id="notice-body" label={tr("nc.form.message")} hint={tr("nc.form.formatHint")} required maxLength={3000} rows={6} value={body} onChange={(e) => setBody(e.target.value)} error={errors.body} />
          <Choice
            id="notice-priority"
            label={tr("nc.form.priority")}
            variant="seg"
            value={priority}
            onChange={setPriority}
            options={(["NORMAL", "URGENT"] as const).map((p) => ({ value: p, label: tr(`nc.priority.${p}`) }))}
          />
          <div className="flex min-h-11 items-center gap-2">
            <Checkbox id="notice-pin" checked={pinned} onCheckedChange={(c) => setPinned(c === true)} />
            <Label htmlFor="notice-pin">{tr("nc.form.pin")}</Label>
          </div>
          {pinned ? (
            <DateField
              id="notice-pin-until"
              label={tr("nc.form.pinUntil")}
              hint={tr("nc.form.pinUntilHint")}
              placeholder={tr("pay.datePh")}
              clearLabel={tr("common.clear")}
              locale={locale}
              disablePast
              value={pinUntil}
              onChange={setPinUntil}
              error={errors.pinUntil}
            />
          ) : null}
          <AttachmentPicker
            locale={locale}
            max={MAX_FILES}
            existing={notice?.attachments.length ?? 0}
            text={{ title: tr("nc.notices.files"), hint: tr("nc.files.hint"), tooMany: tr("nc.files.tooMany") }}
            onChange={(ids, busy) => setFiles({ ids, busy })}
          />
          {errors.attachmentIds ? (
            <p className="m-0 text-xs font-semibold text-destructive" role="alert">
              {errors.attachmentIds}
            </p>
          ) : null}
          {editing ? (
            <div className="flex min-h-11 items-center gap-2">
              <Checkbox id="notice-email" checked={email} onCheckedChange={(c) => setEmailChange(c === true)} />
              <Label htmlFor="notice-email">{tr("nc.form.emailChange")}</Label>
            </div>
          ) : (
            <p className="m-0 bg-[var(--color-surface)] p-3 text-sm font-semibold" aria-live="polite">
              {tr("nc.form.reach", { n: reachN })}
              {priority === "URGENT" ? tr("nc.form.reachUrgent") : ""}
            </p>
          )}
          <Button type="button" variant="ghost" className="self-start pl-0" aria-expanded={preview} onClick={() => setPreview((p) => !p)}>
            {tr(preview ? "nc.form.hidePreview" : "nc.form.preview")}
          </Button>
          {preview ? (
            <section aria-label={tr("nc.form.previewLabel")} className="border-t-2 border-foreground">
              <NoticeCard locale={locale} notice={draft} manage={false} onRead={() => undefined} onAction={() => undefined} />
            </section>
          ) : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form="notice-form" disabled={save.isPending || files.busy}>
            {tr(editing ? "common.save" : "nc.form.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
