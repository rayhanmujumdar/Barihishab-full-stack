import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubImageLoading } from "@/tests/helpers/image";
import { UserAvatar } from "./UserAvatar";

beforeEach(() => stubImageLoading());
afterEach(() => vi.unstubAllGlobals());

describe("UserAvatar", () => {
  it("shows the photo once it loads", async () => {
    const { container } = render(<UserAvatar name="Karim Uddin" avatarUrl="/api/v1/attachments/a1/file" />);
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "/api/v1/attachments/a1/file"));
    expect(screen.queryByText("KU")).not.toBeInTheDocument();
  });

  it("shows initials without a photo", () => {
    const { container } = render(<UserAvatar name="Karim Uddin" avatarUrl={null} />);
    expect(screen.getByText("KU")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to initials when the photo fails to load", async () => {
    const { container } = render(<UserAvatar name="Karim Uddin" avatarUrl="/api/v1/attachments/broken/file" />);
    await waitFor(() => expect(screen.getByText("KU")).toBeInTheDocument());
    expect(container.querySelector("img")).toBeNull();
  });

  it("is square (zero radius) and hidden from assistive tech when decorative", () => {
    const { container } = render(<UserAvatar name="Karim Uddin" avatarUrl={null} />);
    const root = container.querySelector("[data-slot=avatar]")!;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.className).toContain("rounded-none");
    expect(root.className).not.toMatch(/rounded-(full|md|lg|sm)\b/);
  });

  it("can be labelled when it stands alone", async () => {
    render(<UserAvatar name="Karim Uddin" avatarUrl="/api/v1/attachments/a1/file" decorative={false} />);
    await waitFor(() => expect(screen.getByRole("img", { name: "Karim Uddin" })).toBeInTheDocument());
  });
});
