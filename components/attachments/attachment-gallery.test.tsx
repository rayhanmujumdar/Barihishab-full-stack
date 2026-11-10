import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { refreshSession } from "@/lib/api/client";
import { AttachmentGallery, type GalleryItem } from "./AttachmentGallery";

vi.mock("@/lib/api/client", async (orig) => ({ ...(await orig<typeof import("@/lib/api/client")>()), refreshSession: vi.fn(async () => true) }));
const refresh = vi.mocked(refreshSession);

const files: GalleryItem[] = [
  { id: "a1", fileName: "desco-oct.jpg", mime: "image/jpeg" },
  { id: "a2", fileName: "wasa.png", mime: "image/png" },
  { id: "p1", fileName: "bill.pdf", mime: "application/pdf" },
  { id: "a3", fileName: "gas.webp", mime: "image/webp" },
];

let openSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  refresh.mockClear();
  openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => openSpy.mockRestore());

/**
 * next/image re-assigns `img.src` after mount (to catch pre-hydration errors),
 * which makes the attribute absolute. What matters: same origin + the proxy path.
 */
const sameOriginPath = (url: string | null) => {
  const u = new URL(url ?? "", window.location.href);
  expect(u.origin).toBe(window.location.origin);
  return u.pathname + u.search;
};

const lightbox = () => screen.findByRole("dialog", { name: /viewer|দেখুন/i });
const slideImg = async (name: string) => within(await lightbox()).findByRole("img", { name });

describe("AttachmentGallery — thumbnails", () => {
  it("loads thumbnails from the app's own origin", () => {
    render(<AttachmentGallery locale="en" items={files} variant="thumbnails" />);
    const thumbs = screen.getAllByRole("button", { name: /^Open / });
    expect(thumbs).toHaveLength(3); // images only; the PDF is a link
    for (const img of document.querySelectorAll("img")) expect(sameOriginPath(img.getAttribute("src"))).toMatch(/^\/api\/v1\/attachments\/a\d\/file$/);
  });

  it("opens the lightbox at the tapped image, images only, without a new tab", async () => {
    render(<AttachmentGallery locale="en" items={files} variant="thumbnails" />);
    await userEvent.click(screen.getByRole("button", { name: "Open wasa.png" }));
    const img = await slideImg("wasa.png");
    expect(img.getAttribute("src")).toBe("/api/v1/attachments/a2/file");
    expect(within(await lightbox()).getByText("2 / 3")).toBeInTheDocument();
    expect(within(await lightbox()).queryByRole("img", { name: "bill.pdf" })).toBeNull();
    expect(openSpy).not.toHaveBeenCalled();
    const urls = [...document.querySelectorAll("[src], [href]")].map((el) => el.getAttribute("src") ?? el.getAttribute("href"));
    for (const url of urls) expect(sameOriginPath(url)).toMatch(/^\/api\/v1\/attachments\/[\w-]+\/file(\?|$)/);
  });

  it("shows no arrows for a single photo", async () => {
    render(<AttachmentGallery locale="en" items={files.slice(0, 1)} variant="thumbnails" />);
    await userEvent.click(screen.getByRole("button", { name: "Open desco-oct.jpg" }));
    const box = await lightbox();
    expect(within(box).queryByRole("button", { name: "Next" })).toBeNull();
    expect(within(box).queryByRole("button", { name: "Previous" })).toBeNull();
    expect(within(box).queryByText("1 / 1")).toBeNull();
  });

  it("opens PDFs from the app's origin in a new tab via a plain link", () => {
    render(<AttachmentGallery locale="en" items={files} variant="thumbnails" />);
    const link = screen.getByRole("link", { name: "Open bill.pdf (PDF, new tab)" });
    expect(link).toHaveAttribute("href", "/api/v1/attachments/p1/file");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("navigates with the keyboard, closes on Esc and returns focus to the thumbnail", async () => {
    render(<AttachmentGallery locale="en" items={files} variant="thumbnails" />);
    const thumb = screen.getByRole("button", { name: "Open desco-oct.jpg" });
    await userEvent.click(thumb);
    await slideImg("desco-oct.jpg");
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(async () => expect(within(await lightbox()).getByText("2 / 3")).toBeInTheDocument());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(thumb).toHaveFocus();
  });

  it("offers a Download that saves the original from the app's origin", async () => {
    render(<AttachmentGallery locale="en" items={files} variant="thumbnails" />);
    await userEvent.click(screen.getByRole("button", { name: "Open desco-oct.jpg" }));
    const box = await lightbox();
    expect(within(box).getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(within(box).getByText("desco-oct.jpg")).toBeInTheDocument(); // caption
  });

  it("speaks Bangla with Bangla digits", async () => {
    render(<AttachmentGallery locale="bn" items={files} variant="thumbnails" />);
    await userEvent.click(screen.getByRole("button", { name: "wasa.png খুলুন" }));
    const box = await lightbox();
    expect(within(box).getByText("২ / ৩")).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "বন্ধ করুন" })).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "ডাউনলোড" })).toBeInTheDocument();
  });
});

describe("AttachmentGallery — motion", () => {
  it("opens without fade or swipe animation when the user prefers reduced motion", async () => {
    const mm = vi.spyOn(window, "matchMedia").mockImplementation(
      (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
    );
    render(<AttachmentGallery locale="en" items={files} variant="thumbnails" />);
    await userEvent.click(screen.getByRole("button", { name: "Open desco-oct.jpg" }));
    expect((await lightbox()).getAttribute("style")).toContain("--yarl__fade_animation_duration: 0ms");
    mm.mockRestore();
  });
});

describe("AttachmentGallery — links", () => {
  it("lists file names; images open the lightbox, PDFs are links", async () => {
    render(<AttachmentGallery locale="en" items={files} variant="links" />);
    expect(screen.getByRole("link", { name: "Open bill.pdf (PDF, new tab)" })).toHaveAttribute("href", "/api/v1/attachments/p1/file");
    await userEvent.click(screen.getByRole("button", { name: "gas.webp" }));
    expect(await slideImg("gas.webp")).toHaveAttribute("src", "/api/v1/attachments/a3/file");
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe("AttachmentGallery — load failures", () => {
  it("refreshes the session once and retries, then shows a message", async () => {
    render(<AttachmentGallery locale="en" items={files.slice(0, 1)} variant="thumbnails" />);
    const first = screen.getByRole("button", { name: "Open desco-oct.jpg" }).querySelector("img")!;
    fireEvent.error(first);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    const retried = await waitFor(() => {
      const img = screen.getByRole("button", { name: "Open desco-oct.jpg" }).querySelector("img");
      expect(img?.getAttribute("src")).toBe("/api/v1/attachments/a1/file?r=1");
      return img!;
    });
    fireEvent.error(retried);
    expect(await screen.findByText("Couldn't load this file.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("shows the message in the lightbox when a slide can't load, and keeps navigating", async () => {
    render(<AttachmentGallery locale="en" items={files} variant="thumbnails" />);
    await userEvent.click(screen.getByRole("button", { name: "Open desco-oct.jpg" }));
    fireEvent.error(await slideImg("desco-oct.jpg"));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    const retried = await waitFor(async () => {
      const img = within(await lightbox()).getByRole("img", { name: "desco-oct.jpg" });
      expect(img.getAttribute("src")).toBe("/api/v1/attachments/a1/file?r=1");
      return img;
    });
    fireEvent.error(retried);
    expect(await within(await lightbox()).findByText("Couldn't load this file.")).toBeInTheDocument();
    await userEvent.click(within(await lightbox()).getByRole("button", { name: "Next" }));
    await waitFor(async () => expect(within(await lightbox()).getByText("2 / 3")).toBeInTheDocument());
  });
});

describe("AttachmentGallery — retries stay put and recover from later expiries", () => {
  it("keeps the photo being viewed after a retry reloads the slides", async () => {
    render(<AttachmentGallery locale="en" items={files} variant="thumbnails" />);
    await userEvent.click(screen.getByRole("button", { name: "Open desco-oct.jpg" }));
    await userEvent.click(within(await lightbox()).getByRole("button", { name: "Next" }));
    await waitFor(async () => expect(within(await lightbox()).getByText("2 / 3")).toBeInTheDocument());
    fireEvent.error(await slideImg("wasa.png"));
    await waitFor(async () => expect(within(await lightbox()).getByRole("img", { name: "wasa.png" })).toHaveAttribute("src", "/api/v1/attachments/a2/file?r=1"));
    expect(within(await lightbox()).getByText("2 / 3")).toBeInTheDocument();
  });

  it("refreshes again when the session expires a second time after a successful retry", async () => {
    render(<AttachmentGallery locale="en" items={files.slice(0, 1)} variant="thumbnails" />);
    const img = () => screen.getByRole("button", { name: /desco-oct\.jpg/ }).querySelector("img")!;
    fireEvent.error(img());
    await waitFor(() => expect(img().getAttribute("src")).toBe("/api/v1/attachments/a1/file?r=1"));
    fireEvent.load(img()); // the retry worked
    await act(async () => {}); // next/image calls onLoad after img.decode()
    fireEvent.error(img()); // …and much later the token expires again
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(img().getAttribute("src")).toBe("/api/v1/attachments/a1/file?r=2"));
    expect(screen.queryByText("Couldn't load this file.")).toBeNull();
  });

  it("tells screen readers a thumbnail failed", async () => {
    render(<AttachmentGallery locale="en" items={files.slice(0, 1)} variant="thumbnails" />);
    const img = () => screen.getByRole("button", { name: /desco-oct\.jpg/ }).querySelector("img")!;
    fireEvent.error(img());
    await waitFor(() => expect(img().getAttribute("src")).toContain("?r=1"));
    fireEvent.error(img());
    expect(await screen.findByRole("button", { name: "Open desco-oct.jpg — Couldn't load this file." })).toBeInTheDocument();
  });
});

describe("AttachmentGallery inside a modal drawer", () => {
  function InSheet({ onOpenChange = () => {} }: { onOpenChange?: (o: boolean) => void }) {
    return (
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Entry</SheetTitle>
          <AttachmentGallery locale="en" items={files} variant="thumbnails" />
        </SheetContent>
      </Sheet>
    );
  }

  it("is operable over the drawer, and Esc closes only the lightbox", async () => {
    const onOpenChange = vi.fn();
    render(<InSheet onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Open desco-oct.jpg" }));
    const box = await lightbox();
    await userEvent.click(within(box).getByRole("button", { name: "Next" }));
    await waitFor(() => expect(within(box).getByText("2 / 3")).toBeInTheDocument());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /viewer/i })).toBeNull());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Entry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open desco-oct.jpg" })).toHaveFocus();
  });
});
