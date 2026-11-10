import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubImageLoading } from "@/tests/helpers/image";
import { OwnerAvatar } from "./OwnerAvatar";

beforeEach(() => stubImageLoading());
afterEach(() => vi.unstubAllGlobals());

describe("OwnerAvatar", () => {
  it("shows the linked user's photo instead of the initials box", async () => {
    const { container } = render(<OwnerAvatar initials="Ray" avatarUrl="/api/v1/attachments/r1/file" />);
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "/api/v1/attachments/r1/file"));
    expect(screen.queryByText("Ray")).toBeNull();
  });

  it("shows the owner's own initials (not derived from the name) without a photo", () => {
    const { container } = render(<OwnerAvatar initials="Ray" avatarUrl={null} />);
    expect(screen.getByText("Ray")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to initials when the photo fails to load", async () => {
    const { container } = render(<OwnerAvatar initials="NA" avatarUrl="/api/v1/attachments/broken/file" />);
    await waitFor(() => expect(screen.getByText("NA")).toBeInTheDocument());
    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps the square owner-avatar box, decorative, with size overrides", () => {
    const { container } = render(<OwnerAvatar initials="NA" avatarUrl={null} className="size-12!" style={{ width: 28 }} />);
    const box = container.firstElementChild as HTMLElement;
    expect(box).toHaveClass("owner-avatar", "size-12!");
    expect(box).toHaveAttribute("aria-hidden", "true");
    expect(box.style.width).toBe("28px");
  });
});
