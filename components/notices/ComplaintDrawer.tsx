"use client";

import { useEffect, useState } from "react";
import { ArrowRightIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { toast } from "sonner";
import { AttachmentGallery } from "@/components/attachments/AttachmentGallery";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { formatDay } from "@/components/distribution/format";
import { AttachmentPicker } from "@/components/entries/AttachmentPicker";
import { ErrorStrip } from "@/components/forms/error-strip";
import { TextAreaField, TextField } from "@/components/forms/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiFetch, type ApiResult } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import { formatDateTime, translator, type Locale } from "@/lib/i18n";
import { AdminOnlyTag, ComplaintStatusTag } from "./ComplaintCard";
import { linkCard, linkHref } from "./format";
import { LinkPicker } from "./LinkPicker";
import type { ComplaintDetailDto, LinkItem, LinkOption, ThreadItem } from "./types";

type Comment = Extract<ThreadItem, { kind: "comment" }>;
type Ask = { kind: "withdraw" } | { kind: "publish" } | { kind: "reopen" } | { kind: "hide"; comment: Comment } | null;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function LinkedItem({ locale, item }: { locale: Locale; item: LinkItem }) {
  const href = linkHref(locale, item);
  const text = linkCard(locale, item);
  return href ? (
    <Button asChild variant="outline" className="w-full justify-between">
      <Link href={href}>
        <span className="truncate">{text}</span>
        <ArrowRightIcon data-icon="inline-end" />
      </Link>
    </Button>
  ) : (
    <p className="m-0 bg-[var(--color-surface)] p-3 text-sm font-semibold">{text}</p>
  );
}

/** One comment: initials, name, Admin tag, date, "edited", text or the hide reason, files; Edit (15 min) / Hide (Admin). */
function CommentRow({ locale, c, canHide, onEdit, onHide }: { locale: Locale; c: Comment; canHide: boolean; onEdit: (body: string) => Promise<boolean>; onHide: () => void }) {
  const tr = translator(locale);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body ?? "");
  // The server computes the 15-minute window when it renders; it refuses late edits either way.
  const editable = c.editableUntil !== null;
  return (
    <li className="flex gap-3 border-b border-[var(--color-divider)] py-3">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center bg-foreground text-xs font-extrabold text-background">
        {initials(c.authorName)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="m-0 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="font-bold">{c.authorName}</span>
          {c.isAdmin ? <Badge variant="neutral">{tr("nc.d.adminTag")}</Badge> : null}
          <span className="muted text-xs">{formatDateTime(locale, c.createdAt)}</span>
          {c.editedAt ? <span className="muted text-xs">· {tr("nc.d.edited")}</span> : null}
        </p>
        {c.body === null ? (
          <p className="muted m-0 text-sm italic">{tr("nc.d.hidden", { reason: c.hiddenReason ?? "" })}</p>
        ) : editing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (text.trim() && (await onEdit(text.trim()))) setEditing(false);
            }}
          >
            <TextAreaField id={`edit-${c.id}`} label={tr("nc.d.edit")} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
            <span className="flex gap-2">
              <Button type="submit" size="sm">
                {tr("common.save")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                {tr("common.cancel")}
              </Button>
            </span>
          </form>
        ) : (
          <p className="m-0 text-sm whitespace-pre-line">{c.body}</p>
        )}
        {c.attachments.length ? <AttachmentGallery locale={locale} variant="links" items={c.attachments} /> : null}
        {(editable && !editing && c.body !== null) || (canHide && c.body !== null) ? (
          <span className="flex gap-1">
            {editable && !editing ? (
              <Button variant="ghost" size="sm" className="pl-0" onClick={() => setEditing(true)}>
                {tr("nc.d.edit")}
              </Button>
            ) : null}
            {canHide ? (
              <Button variant="ghost" size="sm" className="pl-0" onClick={onHide}>
                {tr("nc.d.hide")}
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
    </li>
  );
}

/** C3–C7: the complaint as a right drawer (full screen on phones) with its thread and actions. */
export function ComplaintDrawer({ locale, complaint: c, onClose, onChanged }: { locale: Locale; complaint: ComplaintDetailDto; onClose: () => void; onChanged: () => void }) {
  const tr = translator(locale);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<{ ids: string[]; busy: boolean; key: number }>({ ids: [], busy: false, key: 0 });
  const [commentError, setCommentError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");
  const [fix, setFix] = useState<LinkOption | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [reason, setReason] = useState("");
  const [askError, setAskError] = useState<string | null>(null);
  const call = useApiMutation(["complaints", c.id], (v: { path: string; method?: "POST" | "PATCH"; body?: Record<string, unknown> }) =>
    apiFetch<{ complaint: ComplaintDetailDto }>(`/complaints/${c.id}${v.path}?locale=${locale}`, { method: v.method ?? "POST", body: v.body ?? {} }),
    // Status, withdraw and reopen change which items read "Questioned" on other screens.
    { invalidate: [["complaints", "questioned"]] },
  );

  // Opening the drawer marks the thread seen — an explicit write, never a side effect of a read (D8).
  useEffect(() => {
    if (c.unseen) void apiFetch(`/complaints/${c.id}/seen`, { method: "POST" }).then((r) => r.ok && onChanged());
  }, [c.id, c.unseen, onChanged]);

  const message = (res: Extract<ApiResult<unknown>, { ok: false }>) => (res.status === 0 ? tr("common.network") : res.error.message);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim() || call.isPending || files.busy) return;
    const res = await call.run({ path: "/comments", body: { body: comment.trim(), ...(files.ids.length ? { attachmentIds: files.ids } : {}) } });
    if (!res.ok) return setCommentError(res.error.details?.fields?.body ?? res.error.details?.fields?.attachmentIds ?? message(res));
    setComment("");
    setFiles((f) => ({ ids: [], busy: false, key: f.key + 1 }));
    setCommentError(null);
    toast(tr("nc.toast.comment"));
    onChanged();
  }

  async function setStatus(status: "IN_REVIEW" | "RESOLVED" | "REJECTED") {
    if (status !== "IN_REVIEW" && !explanation.trim()) return setStatusError(tr("nc.err.explain"));
    setStatusError(null);
    const res = await call.run({
      path: "/status",
      method: "PATCH",
      body: { status, explanation: explanation.trim() || null, ...(status === "RESOLVED" && fix ? { fix: { type: fix.type, id: fix.id } } : {}) },
    });
    if (!res.ok) return setStatusError(res.error.details?.fields?.explanation ?? message(res));
    setExplanation("");
    toast(tr("nc.toast.status", { status: tr(`nc.status.${status}`) }));
    onChanged();
  }

  async function confirmAsk() {
    if (!ask) return;
    setAskError(null);
    const req =
      ask.kind === "hide"
        ? { path: `/comments/${ask.comment.id}/hide`, body: { reason: reason.trim() } }
        : ask.kind === "reopen"
          ? { path: "/reopen", body: { comment: reason.trim() } }
          : { path: `/${ask.kind}` };
    if ((ask.kind === "reopen" || ask.kind === "hide") && !reason.trim()) return setAskError(ask.kind === "reopen" ? tr("nc.reopen.err") : tr("nc.hide.reason"));
    const res = await call.run(req);
    if (!res.ok) return setAskError(res.error.details?.fields?.comment ?? res.error.details?.fields?.reason ?? message(res));
    toast(tr(ask.kind === "withdraw" ? "nc.toast.withdrawn" : ask.kind === "publish" ? "nc.toast.public" : ask.kind === "reopen" ? "nc.toast.reopened" : "nc.toast.hidden"));
    setAsk(null);
    setReason("");
    onChanged();
  }

  async function editComment(commentId: string, body: string): Promise<boolean> {
    const res = await call.run({ path: `/comments/${commentId}`, method: "PATCH", body: { body } });
    if (!res.ok) {
      toast.error(message(res));
      return false;
    }
    toast(tr("nc.toast.commentEdited"));
    onChanged();
    return true;
  }

  const comments = c.thread.filter((i): i is Comment => i.kind === "comment");
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-full gap-0 overflow-y-auto border-l-2 border-foreground bg-background p-0 data-[side=right]:w-full sm:max-w-[600px] data-[side=right]:sm:max-w-[600px]">
        <SheetHeader className="flex-row items-start justify-between gap-3 border-b-2 border-foreground px-5 py-4">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="flex flex-wrap items-center gap-1.5">
              <ComplaintStatusTag locale={locale} status={c.status} />
              {c.visibility === "ADMIN" ? <AdminOnlyTag locale={locale} /> : <Badge variant="outline">{tr("nc.tag.everyone")}</Badge>}
              {c.reopened && c.status === "OPEN" ? <Badge variant="outline" className="border-foreground">{tr("nc.tag.reopened")}</Badge> : null}
            </span>
            <SheetTitle className="text-[22px] font-extrabold tracking-[-0.015em]">{c.title}</SheetTitle>
            <p className="muted m-0 text-sm">{tr("nc.c.byLine", { name: c.authorName, date: formatDay(locale, c.createdAt) })}</p>
            {c.aboutAdmin ? <p className="m-0 flex items-center gap-1.5 text-sm font-semibold">
                <ExclamationTriangleIcon aria-hidden className="size-4 shrink-0" />
                {tr("nc.d.aboutAdmin")}
              </p> : null}
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label={tr("common.close")}>
              <XMarkIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-5" lang={locale}>
          <p className="m-0 whitespace-pre-line">{c.body}</p>
          {c.attachments.length ? <AttachmentGallery locale={locale} variant="thumbnails" items={c.attachments} /> : null}
          {c.link ? (
            <section className="flex flex-col gap-1">
              <h3 className="m-0 text-xs font-semibold text-muted-foreground">{tr("nc.d.linked")}</h3>
              <LinkedItem locale={locale} item={c.link} />
            </section>
          ) : null}
          {c.status === "IN_REVIEW" ? <p className="m-0 border-t-2 border-[var(--signal)] bg-[var(--color-surface)] p-3 font-semibold">{tr("nc.d.inReview")}</p> : null}
          {c.resolution ? (
            <section aria-labelledby="resolution" className="flex flex-col gap-2 border-t-2 border-foreground pt-3">
              <h3 id="resolution" className="m-0 text-base font-extrabold">
                {tr("nc.d.resolution")}
              </h3>
              <p className="m-0 whitespace-pre-line">{c.resolution.note}</p>
              <p className="muted m-0 text-xs">{tr("nc.c.byLine", { name: c.resolution.byName, date: formatDay(locale, c.resolution.at) })}</p>
              {c.resolution.fix ? (
                <>
                  <span className="text-xs font-semibold text-muted-foreground">{tr("nc.d.fix")}</span>
                  <LinkedItem locale={locale} item={c.resolution.fix} />
                </>
              ) : null}
            </section>
          ) : null}

          <section aria-labelledby="thread" className="flex flex-col">
            <h3 id="thread" className="section-head m-0 text-base font-extrabold">
              {tr("nc.d.thread")}
            </h3>
            {c.thread.length ? (
              <ol className="m-0 list-none p-0">
                {c.thread.map((i) =>
                  i.kind === "status" ? (
                    <li key={i.id} className="muted border-b border-[var(--color-divider)] py-2 text-xs">
                      {tr(`nc.line.${i.status}`, { name: i.actorName })} · {formatDay(locale, i.at)}
                      {i.note ? <span className="mt-1 block text-sm text-foreground">“{i.note}”</span> : null}
                    </li>
                  ) : (
                    <CommentRow key={i.id} locale={locale} c={i} canHide={c.actions.hide} onEdit={(b) => editComment(i.id, b)} onHide={() => setAsk({ kind: "hide", comment: i })} />
                  ),
                )}
              </ol>
            ) : null}
            {!comments.length ? <p className="muted m-0 pt-2 text-sm">{tr("nc.d.noComments")}</p> : null}
          </section>

          {c.actions.comment ? (
            <form className="flex flex-col gap-2" onSubmit={send} noValidate>
              <ErrorStrip message={commentError} />
              <TextAreaField id="complaint-comment" label={tr("nc.d.addComment")} rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
              <AttachmentPicker key={files.key} locale={locale} max={3} text={{ title: tr("nc.notices.files"), hint: tr("nc.d.commentFiles"), tooMany: tr("nc.d.commentTooMany") }} onChange={(ids, busy) => setFiles((f) => ({ ...f, ids, busy }))} />
              <Button type="submit" className="self-start" disabled={!comment.trim() || call.isPending || files.busy}>
                {tr("nc.d.send")}
              </Button>
            </form>
          ) : null}

          {c.actions.withdraw || c.actions.publish || c.actions.reopen ? (
            <div className="flex flex-wrap gap-2">
              {c.actions.reopen ? (
                <Button variant="outline" onClick={() => setAsk({ kind: "reopen" })}>
                  {tr("nc.d.reopen")}
                </Button>
              ) : null}
              {c.actions.publish ? (
                <Button variant="outline" onClick={() => setAsk({ kind: "publish" })}>
                  {tr("nc.d.publish")}
                </Button>
              ) : null}
              {c.actions.withdraw ? (
                <Button variant="ghost" onClick={() => setAsk({ kind: "withdraw" })}>
                  {tr("nc.d.withdraw")}
                </Button>
              ) : null}
            </div>
          ) : null}

          {c.actions.decide ? (
            <section aria-labelledby="admin-status" className="flex flex-col gap-3 border-t-2 border-foreground pt-3">
              <h3 id="admin-status" className="m-0 text-base font-extrabold">
                {tr("nc.admin.title")}
              </h3>
              <ErrorStrip message={statusError} />
              <TextAreaField id="complaint-explanation" label={tr("nc.admin.explanation")} rows={3} maxLength={2000} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
              <LinkPicker locale={locale} id="complaint-fix" label={tr("nc.admin.fix")} value={fix} onChange={setFix} />
              <div className="flex flex-wrap gap-2">
                {c.status === "OPEN" ? (
                  <Button variant="outline" disabled={call.isPending} onClick={() => setStatus("IN_REVIEW")}>
                    {tr("nc.admin.inReview")}
                  </Button>
                ) : null}
                <Button disabled={call.isPending} onClick={() => setStatus("RESOLVED")}>
                  {tr("nc.admin.resolve")}
                </Button>
                <Button variant="outline" disabled={call.isPending} onClick={() => setStatus("REJECTED")}>
                  {tr("nc.admin.reject")}
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      </SheetContent>
      {ask ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setAsk(null);
              setReason("");
              setAskError(null);
            }
          }}
          tone={ask.kind === "publish" || ask.kind === "reopen" ? "default" : "destructive"}
          title={tr(`nc.${ask.kind}.title`)}
          description={tr(`nc.${ask.kind}.body`)}
          confirmLabel={tr(`nc.${ask.kind}.confirm`)}
          cancelLabel={tr("common.cancel")}
          busy={call.isPending}
          confirmDisabled={(ask.kind === "reopen" || ask.kind === "hide") && !reason.trim()}
          onConfirm={confirmAsk}
        >
          <ErrorStrip message={askError} />
          {ask.kind === "reopen" ? (
            <TextAreaField id="reopen-comment" label={tr("nc.reopen.label")} required rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
          ) : ask.kind === "hide" ? (
            <TextField id="hide-reason" label={tr("nc.hide.reason")} required maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          ) : null}
        </ConfirmDialog>
      ) : null}
    </Sheet>
  );
}
