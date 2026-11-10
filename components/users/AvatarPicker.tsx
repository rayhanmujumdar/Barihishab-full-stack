"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CameraIcon, TrashIcon } from "@heroicons/react/24/outline";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";
import { AVATAR_ACCEPT, isAvatarType } from "./avatar-upload";
import { UserAvatar } from "./UserAvatar";

/**
 * Profile photo field (add-profile-photo D7): square preview, a file picker
 * behind a labelled button, and "Remove photo". Removing a saved photo asks
 * first; dropping a not-yet-saved pick does not. Uploading is the parent's
 * job (`/me` saves at once, the user drawer uploads on Save).
 */
export function AvatarPicker({
  locale,
  name,
  currentUrl,
  picked,
  onPick,
  onClearPick,
  onRemove,
  error,
  busy = false,
  removeBody,
}: {
  locale: Locale;
  /** For the initials fallback and the preview's alt text. */
  name: string;
  /** The saved photo, if any. */
  currentUrl: string | null;
  /** A picked file not saved yet (drawer). */
  picked: File | null;
  onPick: (file: File) => void;
  onClearPick?: () => void;
  /** Called only after the user confirmed removing the saved photo. */
  onRemove: () => void | Promise<void>;
  error?: string | null;
  busy?: boolean;
  /** Dialog body; defaults to the self-service wording. */
  removeBody?: string;
}) {
  const tr = translator(locale);
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [typeError, setTypeError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const preview = usePreview(picked);
  const shown = preview ?? currentUrl;
  const message = typeError ? tr("photo.bad") : (error ?? null);

  function choose(files: FileList | null) {
    const file = files?.[0];
    if (input.current) input.current.value = "";
    if (!file) return;
    if (!isAvatarType(file)) return setTypeError(true);
    setTypeError(false);
    onPick(file);
  }

  function remove() {
    setTypeError(false);
    if (picked) return onClearPick?.();
    setConfirming(true);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground">{tr("photo.label")}</span>
      <div className="flex items-center gap-4">
        <UserAvatar name={name} avatarUrl={shown} className="size-24 text-2xl [&_[data-slot=avatar-fallback]]:text-2xl" />
        <div className="flex flex-col items-start gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => input.current?.click()}
            aria-describedby={message ? errorId : undefined}
          >
            <CameraIcon data-icon="inline-start" />
            {tr(shown ? "photo.change" : "photo.choose")}
          </Button>
          {shown ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={remove} className="pl-0">
              <TrashIcon data-icon="inline-start" />
              {tr("photo.remove")}
            </Button>
          ) : null}
          <input ref={input} type="file" accept={AVATAR_ACCEPT} hidden onChange={(e) => choose(e.target.files)} data-testid="avatar-input" />
        </div>
      </div>
      {busy ? (
        <p className="muted m-0" role="status">
          {tr("photo.uploading")}
        </p>
      ) : (
        <p className="muted m-0">{tr("photo.optional")}</p>
      )}
      {message ? (
        <p id={errorId} className="m-0 text-xs font-semibold text-destructive" role="alert">
          {message}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={tr("photo.removeTitle")}
        description={removeBody ?? tr("photo.removeBody")}
        confirmLabel={tr("photo.remove")}
        cancelLabel={tr("photo.cancel")}
        onConfirm={async () => {
          await onRemove();
          setConfirming(false);
        }}
      />
    </div>
  );
}

/** Data-URL preview of a local file; only state updates from the reader callback. */
function usePreview(file: File | null): string | null {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!file || typeof FileReader === "undefined") return;
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && setPreview({ file, url: reader.result });
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  return file && preview?.file === file ? preview.url : null;
}
