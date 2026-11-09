"use client";

// The lightbox itself (Yet Another React Lightbox), loaded lazily by
// AttachmentGallery the first time someone opens a photo.
import { useEffect, useRef, useSyncExternalStore } from "react";
import Lightbox, { useLightboxState, type ControllerRef, type SlideImage } from "yet-another-react-lightbox";
import Download from "yet-another-react-lightbox/plugins/download";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import { toBanglaDigits, translator, type Locale } from "@/lib/i18n";

export type ViewerSlide = SlideImage & { alt: string };

type Props = {
  locale: Locale;
  slides: ViewerSlide[];
  index: number;
  /** The slide now shown — keep it as `index`, so new slides (a retry) don't jump back to the first-opened photo. */
  onView: (index: number) => void;
  onClose: () => void;
  /** Lightbox mount point: inside a modal drawer so its focus trap and pointer lock include the lightbox. */
  root: () => Element | null;
  /** False while a session refresh is under way: a failed slide waits for its retry instead of showing the message. */
  showLoadError: boolean;
};

const PLUGINS = [Zoom, Download];
const REDUCE = "(prefers-reduced-motion: reduce)";

function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(REDUCE);
      mq?.addEventListener?.("change", cb);
      return () => mq?.removeEventListener?.("change", cb);
    },
    () => window.matchMedia?.(REDUCE).matches ?? false,
    () => false,
  );
}

/** Counter + file name. Ours (not the Counter/Captions plugins) so বাংলা gets Bangla digits. */
function SlideInfo({ locale }: { locale: Locale }) {
  const { currentIndex, slides } = useLightboxState();
  const slide = slides[currentIndex] as ViewerSlide | undefined;
  if (!slide) return null;
  const digits = (n: number) => (locale === "bn" ? toBanglaDigits(String(n)) : String(n));
  return (
    <div className="bh-viewer-info">
      {slides.length > 1 ? <span className="bh-viewer-counter">{`${digits(currentIndex + 1)} / ${digits(slides.length)}`}</span> : null}
      <span className="bh-viewer-caption">{slide.alt}</span>
    </div>
  );
}

export default function Viewer({ locale, slides, index, onView, onClose, root, showLoadError }: Props) {
  const tr = translator(locale);
  const controller = useRef<ControllerRef>(null);
  const reduceMotion = useReducedMotion();

  // Esc must close only the lightbox. Radix (the drawer around us) listens for
  // Escape on the document in the capture phase, so catch it one level higher.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      controller.current?.close();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides}
      plugins={PLUGINS}
      className="bh-viewer"
      portal={{ root }}
      controller={{ ref: controller, closeOnBackdropClick: true }}
      on={{ view: ({ index: shown }) => onView(shown) }}
      carousel={{ finite: true, padding: "24px" }}
      animation={reduceMotion ? { fade: 0, swipe: 0, navigation: 0 } : { fade: 200, swipe: 300 }}
      zoom={{ scrollToZoom: true }}
      labels={{
        Lightbox: tr("viewer.title"),
        Carousel: tr("viewer.gallery"),
        "Photo gallery": tr("viewer.gallery"),
        Slide: tr("viewer.slide"),
        "{index} of {total}": tr("viewer.position", { index: "{index}", total: "{total}" }),
        Previous: tr("viewer.prev"),
        Next: tr("viewer.next"),
        Close: tr("viewer.close"),
        "Zoom in": tr("viewer.zoomIn"),
        "Zoom out": tr("viewer.zoomOut"),
        Download: tr("viewer.download"),
      }}
      render={{
        controls: () => <SlideInfo locale={locale} />,
        // One photo: no arrows (YARL would show them disabled).
        ...(slides.length > 1 ? {} : { buttonPrev: () => null, buttonNext: () => null }),
        iconError: () => (showLoadError ? <p className="bh-viewer-error">{tr("viewer.loadFailed")}</p> : null),
      }}
    />
  );
}
