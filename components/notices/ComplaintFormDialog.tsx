"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AttachmentPicker } from "@/components/entries/AttachmentPicker";
import { ErrorStrip } from "@/components/forms/error-strip";
import { TextAreaField, TextField } from "@/components/forms/fields";
import { Choice } from "@/components/owners/Choice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";
import { LinkPicker } from "./LinkPicker";
import type { ComplaintDetailDto, LinkOption } from "./types";

type Visibility = "ALL" | "ADMIN";

/** C2: title, what's wrong, linked item, who can see it, files → Post complaint. */
export function ComplaintFormDialog({ locale, link, onClose, onDone }: { locale: Locale; link: LinkOption | null; onClose: () => void; onDone: (id: string) => void }) {
  const tr = translator(locale);
  const [title, setTitle] = useState(link?.prefill ?? "");
  const [body, setBody] = useState("");
  const [linked, setLinked] = useState<LinkOption | null>(link);
  const [visibility, setVisibility] = useState<Visibility>("ALL");
  const [files, setFiles] = useState<{ ids: string[]; busy: boolean }>({ ids: [], busy: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const post = useApiMutation(["complaints", "raise"], (b: Record<string, unknown>) => apiFetch<{ complaint: ComplaintDetailDto }>(`/complaints?locale=${locale}`, { method: "POST", body: b }), {
    invalidate: [["complaints", "questioned"]],
  });

  function pick(v: LinkOption | null) {
    setLinked(v);
    if (v && !title.trim()) setTitle(v.prefill);
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (post.isPending || files.busy) return;
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = tr("nc.err.cTitle");
    if (body.trim().length < 10) e.body = tr("nc.err.cBody");
    setErrors(e);
    if (Object.keys(e).length) return;
    setError(null);
    const res = await post.run({
      title: title.trim(),
      body: body.trim(),
      visibility,
      link: linked ? { type: linked.type, id: linked.id } : null,
      ...(files.ids.length ? { attachmentIds: files.ids } : {}),
    });
    if (!res.ok) {
      const fields = res.error.details?.fields ?? {};
      setErrors(fields);
      return setError(Object.keys(fields).length ? null : res.status === 0 ? tr("common.network") : res.error.message);
    }
    toast(tr(visibility === "ALL" ? "nc.toast.postedAll" : "nc.toast.postedAdmin"));
    onDone(res.data.complaint.id);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !post.isPending && onClose()}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto max-sm:h-[100dvh] max-sm:max-w-full sm:max-h-[90vh] sm:max-w-[600px]" lang={locale}>
        <DialogHeader>
          <DialogTitle>{tr("nc.cf.title")}</DialogTitle>
          <DialogDescription>{tr("nc.cf.sub")}</DialogDescription>
        </DialogHeader>
        <form id="complaint-form" className="form-stack" onSubmit={onSubmit} noValidate>
          <ErrorStrip message={error} />
          <TextField id="complaint-title" label={tr("nc.cf.titleLabel")} required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
          <TextAreaField id="complaint-body" label={tr("nc.cf.body")} required maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} error={errors.body} />
          <LinkPicker locale={locale} id="complaint-link" label={tr("nc.cf.link")} value={linked} onChange={pick} />
          {errors.link ? (
            <p className="m-0 text-xs font-semibold text-destructive" role="alert">
              {errors.link}
            </p>
          ) : null}
          <Choice
            id="complaint-visibility"
            label={tr("nc.cf.visibility")}
            variant="seg"
            value={visibility}
            onChange={setVisibility}
            options={(["ALL", "ADMIN"] as const).map((v) => ({ value: v, label: tr(`nc.vis.${v}`) }))}
          />
          <p className="muted m-0 text-xs">{tr("nc.cf.adminHelp")}</p>
          <AttachmentPicker locale={locale} max={5} text={{ title: tr("nc.notices.files"), hint: tr("nc.cf.filesHint"), tooMany: tr("nc.files.tooMany") }} onChange={(ids, busy) => setFiles({ ids, busy })} />
          {errors.attachmentIds ? (
            <p className="m-0 text-xs font-semibold text-destructive" role="alert">
              {errors.attachmentIds}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={post.isPending}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form="complaint-form" disabled={post.isPending || files.busy}>
            {tr("nc.cf.post")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
