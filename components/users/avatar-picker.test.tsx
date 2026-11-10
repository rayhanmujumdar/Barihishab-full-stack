import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubImageLoading } from "@/tests/helpers/image";
import { AvatarPicker } from "./AvatarPicker";

beforeEach(() => {
  stubImageLoading();
});
afterEach(() => vi.unstubAllGlobals());

const png = () => new File([new Uint8Array(10)], "me.png", { type: "image/png" });
const input = () => screen.getByTestId("avatar-input") as HTMLInputElement;

function setup(props: Partial<React.ComponentProps<typeof AvatarPicker>> = {}) {
  const onPick = vi.fn();
  const onRemove = vi.fn();
  const onClearPick = vi.fn();
  const utils = render(<AvatarPicker locale="en" name="Karim Uddin" currentUrl={null} picked={null} onPick={onPick} onRemove={onRemove} onClearPick={onClearPick} {...props} />);
  return { ...utils, onPick, onRemove, onClearPick };
}

describe("AvatarPicker", () => {
  it("accepts only JPG, PNG and WebP", () => {
    setup();
    expect(input()).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(screen.getByRole("button", { name: "Choose photo" })).toBeInTheDocument();
  });

  it("passes a picked image up", async () => {
    const { onPick } = setup();
    await userEvent.upload(input(), png());
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: "me.png" }));
  });

  it("shows a square preview of the picked file", async () => {
    const { container } = setup({ picked: png() });
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", expect.stringMatching(/^data:image\/png;base64,/)));
    expect(screen.getByRole("button", { name: "Change photo" })).toBeInTheDocument();
  });

  it("rejects other types with a described error and never calls onPick", () => {
    const { onPick } = setup();
    fireEvent.change(input(), { target: { files: [new File(["%PDF"], "cv.pdf", { type: "application/pdf" })] } });
    expect(onPick).not.toHaveBeenCalled();
    const error = screen.getByText("Only JPG, PNG or WebP up to 2 MB.");
    expect(screen.getByRole("button", { name: "Choose photo" })).toHaveAttribute("aria-describedby", expect.stringContaining(error.id));
  });

  it("shows a parent error the same way", () => {
    setup({ error: "Photo upload failed. Try again." });
    const error = screen.getByText("Photo upload failed. Try again.");
    expect(screen.getByRole("button", { name: "Choose photo" })).toHaveAttribute("aria-describedby", expect.stringContaining(error.id));
  });

  it("asks before removing an existing photo", async () => {
    const { onRemove } = setup({ currentUrl: "/api/v1/attachments/a1/file" });
    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Remove photo?")).toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep photo" }));
    expect(onRemove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove photo" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("drops an unsaved pick without a dialog", async () => {
    const { onClearPick, onRemove } = setup({ picked: png(), currentUrl: "/api/v1/attachments/a1/file" });
    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onClearPick).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("disables the buttons while busy and says so", () => {
    setup({ busy: true, currentUrl: "/api/v1/attachments/a1/file" });
    expect(screen.getByRole("button", { name: "Change photo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeDisabled();
    expect(screen.getByText("Uploading photo…")).toBeInTheDocument();
  });
});
