"use client";

import { useRef, useState } from "react";
import { CameraIcon, DocumentIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";
import { useMutation } from "@tanstack/react-query";
import { ACCEPT, uploadBill } from "./upload";
import Image from "next/image";

type Item = { key: string; name: string; status: "uploading" | "done" | "error"; id?: string; preview?: string };

/** Dashed "Add bill / receipt" box with thumbnails (Income & Expenses PRD §6.2). */
export function AttachmentPicker({
  locale,
  existing = 0,
  max = 5,
  text,
  onChange,
}: {
  locale: Locale;
  /** File limit for the record (5 per entry, 3 per money request). */
  max?: number;
  /** Overrides for the box title, hint and too-many message (requests: 3 files). */
  text?: { title: string; hint: string; tooMany: string };
  /** Files already on the entry (counts toward the 5-file limit). */
  existing?: number;
  /** Uploaded attachment ids + whether an upload is still running. */
  onChange: (ids: string[], busy: boolean) => void;
}) {
  const tr = translator(locale);
  // Presign + PUT to the bucket, tracked as a mutation (one per file).
  const upload = useMutation({ mutationKey: ["attachments", "upload"], mutationFn: uploadBill });
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  function publish(next: Item[]) {
    setItems(next);
    onChange(
      next.filter((i) => i.status === "done").map((i) => i.id!),
      next.some((i) => i.status === "uploading"),
    );
  }

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = max - existing - items.filter((i) => i.status !== "error").length;
    const chosen = [...files].slice(0, Math.max(0, room));
    if (chosen.length < files.length) setError(text?.tooMany ?? tr("entry.files.tooMany"));
    let current = [
      ...items,
      ...chosen.map((f, n) => ({
        key: `${Date.now()}-${n}`,
        name: f.name,
        status: "uploading" as const,
        preview: f.type.startsWith("image/") && typeof URL.createObjectURL === "function" ? URL.createObjectURL(f) : undefined,
      })),
    ];
    publish(current);
    const started = current.slice(current.length - chosen.length);
    await Promise.all(
      chosen.map(async (file, n) => {
        const r = await upload.mutateAsync(file);
        if (!r.ok) setError(tr(r.reason === "bad" ? "entry.files.bad" : "entry.files.failed"));
        current = current.map((i) => (i.key === started[n].key ? { ...i, status: r.ok ? "done" : "error", id: r.ok ? r.id : undefined } : i));
        publish(current);
      }),
    );
    if (input.current) input.current.value = "";
  }

  return (
    <div className="drop-box">
      <span className="text-xs font-semibold text-muted-foreground">{text?.title ?? tr("entry.files")}</span>
      {items.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {items.map((i) => (
            <li key={i.key} className="relative flex size-20 items-center justify-center border border-border bg-card" data-status={i.status}>
              {i.preview ? (
                // Local blob: preview (next/image serves blob:/data: unoptimized).
                <Image src={i.preview} alt={i.name} width={80} height={80} className="size-full object-cover" />
              ) : (
                <DocumentIcon className="size-8" aria-label={i.name} />
              )}
              {i.status === "uploading" ? <span className="absolute inset-x-0 bottom-0 bg-foreground/80 px-1 text-[10px] text-background">{tr("entry.files.uploading")}</span> : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute -top-2 -right-2 size-7 bg-background"
                aria-label={tr("entry.files.remove", { name: i.name })}
                onClick={() => publish(items.filter((x) => x.key !== i.key))}
              >
                <XMarkIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={existing + items.length >= max}>
          <CameraIcon data-icon="inline-start" />
          {tr("entry.files.add")}
        </Button>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => pick(e.target.files)} data-testid="bill-input" />
      </div>
      <p className="muted m-0">{text?.hint ?? tr("entry.files.hint")}</p>
      {error ? (
        <p className="m-0 text-xs font-semibold text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
