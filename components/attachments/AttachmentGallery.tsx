"use client";

// Bills & receipts on any screen (attachment-viewer spec): images open an
// in-app lightbox, PDFs open in a new tab — both from the app's own origin
// (GET /api/v1/attachments/:id/file), never from a storage URL.
import { DocumentIcon } from "@heroicons/react/24/outline";
import { lazy, Suspense, useCallback, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";
import { refreshSession } from "@/lib/api/client";
import { attachmentFileUrl } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";
import type { ViewerSlide } from "./Viewer";
import Image from "next/image";

const Viewer = lazy(() => import("./Viewer"));

export type GalleryItem = { id: string; fileName: string; mime: string };

type Props = {
  locale: Locale;
  items: GalleryItem[];
  /** `thumbnails`: 96px tiles (entry detail). `links`: file names (statement row detail). */
  variant: "thumbnails" | "links";
  /** Extra controls on a tile, e.g. the remove ✕. */
  tileExtra?: (item: GalleryItem) => ReactNode;
};

const isImage = (a: GalleryItem) => a.mime.startsWith("image/");

/**
 * `<img>` requests can't renew an expired access token the way apiFetch does.
 * When an image fails, renew the session (one request however many images
 * fail) and reload every image with a new URL. Each failure gets one retry:
 * an image that fails again on its retry URL is final, but one that loaded
 * and fails later (the next token expiry) is retried again.
 */
function useImageRetry() {
  const [rev, setRev] = useState(0);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const pendingRef = useRef(false);
  /** id → the revision its retry loads at. */
  const retryRev = useRef(new Map<string, number>());

  const src = useCallback((id: string) => attachmentFileUrl(id) + (rev ? `?r=${rev}` : ""), [rev]);
  const onLoad = useCallback((id: string) => {
    retryRev.current.delete(id);
  }, []);
  const onError = useCallback(
    (id: string) => {
      if (retryRev.current.get(id) === rev) {
        setFailed((f) => new Set(f).add(id));
        return;
      }
      retryRev.current.set(id, rev + 1);
      if (pendingRef.current) return; // the refresh under way reloads this image too
      pendingRef.current = true;
      setPending(true);
      void refreshSession()
        .catch(() => false)
        .finally(() => {
          pendingRef.current = false;
          setPending(false);
          setRev((r) => r + 1);
        });
    },
    [rev],
  );
  return { src, onLoad, onError, failed, pending };
}

export function AttachmentGallery({ locale, items, variant, tileExtra }: Props) {
  const tr = translator(locale);
  const anchor = useRef<HTMLDivElement>(null);
  const [openAt, setOpenAt] = useState<number | null>(null);
  const images = useMemo(() => items.filter(isImage), [items]);
  const { src, onLoad, onError, failed, pending } = useImageRetry();

  const slides: ViewerSlide[] = useMemo(
    () => images.map((a) => ({ src: src(a.id), alt: a.fileName, download: { url: attachmentFileUrl(a.id, { download: true }), filename: a.fileName } })),
    [images, src],
  );
  // Inside a modal drawer, mount the lightbox in the drawer itself so the
  // drawer's focus trap and pointer lock include it.
  const root = useCallback(() => anchor.current?.closest('[role="dialog"]') ?? document.body, []);
  // Image load/error events from the lightbox bubble here through the React tree.
  const slideImage = (e: SyntheticEvent) => {
    const img = e.target as HTMLElement;
    if (img.tagName !== "IMG") return undefined;
    return images.find((a) => img.getAttribute("src")?.startsWith(attachmentFileUrl(a.id)));
  };
  const onSlideError = (e: SyntheticEvent) => {
    const hit = slideImage(e);
    if (hit) onError(hit.id);
  };
  const onSlideLoad = (e: SyntheticEvent) => {
    const hit = slideImage(e);
    if (hit) onLoad(hit.id);
  };

  const open = (a: GalleryItem) => setOpenAt(images.findIndex((i) => i.id === a.id));
  const pdfLink = (a: GalleryItem, children: ReactNode, className: string) => (
    <a href={attachmentFileUrl(a.id)} target="_blank" rel="noopener noreferrer" className={className} aria-label={tr("viewer.openPdf", { name: a.fileName })}>
      {children}
    </a>
  );

  return (
    <div ref={anchor} className="contents">
      {variant === "thumbnails" ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {items.map((a) => (
            <li key={a.id} className="relative">
              {isImage(a) ? (
                <button
                  type="button"
                  className="flex size-24 items-center justify-center border border-border bg-card"
                  aria-label={failed.has(a.id) ? `${tr("detail.open", { name: a.fileName })} — ${tr("viewer.loadFailed")}` : tr("detail.open", { name: a.fileName })}
                  onClick={() => open(a)}
                >
                  {failed.has(a.id) ? (
                    <span aria-hidden className="p-1 text-center text-[11px] leading-tight text-[var(--color-neutral-700)]">
                      {tr("viewer.loadFailed")}
                    </span>
                  ) : (
                    // Private file from the same-origin proxy: the optimizer can't send the user's cookies, so serve it as-is.
                    <Image src={src(a.id)} alt="" width={96} height={96} unoptimized className="size-full object-cover" onLoad={() => onLoad(a.id)} onError={() => onError(a.id)} />
                  )}
                </button>
              ) : (
                pdfLink(a, <DocumentIcon className="size-9" aria-hidden />, "flex size-24 items-center justify-center border border-border bg-card")
              )}
              {tileExtra?.(a)}
            </li>
          ))}
        </ul>
      ) : (
        <span className="flex flex-col items-start gap-1">
          {items.map((a) =>
            isImage(a) ? (
              <Button key={a.id} variant="link" className="h-auto p-0" onClick={() => open(a)}>
                {a.fileName}
              </Button>
            ) : (
              <span key={a.id}>{pdfLink(a, a.fileName, "font-extrabold underline underline-offset-4")}</span>
            ),
          )}
        </span>
      )}
      {openAt !== null && openAt >= 0 ? (
        <span onError={onSlideError} onLoad={onSlideLoad} className="contents">
          <Suspense fallback={null}>
            <Viewer locale={locale} slides={slides} index={openAt} onView={setOpenAt} onClose={() => setOpenAt(null)} root={root} showLoadError={!pending} />
          </Suspense>
        </span>
      ) : null}
    </div>
  );
}
