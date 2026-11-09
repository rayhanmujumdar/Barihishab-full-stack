import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";

type HarnessProps = Partial<ConfirmDialogProps> & { onConfirm?: ConfirmDialogProps["onConfirm"] };

/** Trigger button + dialog, so focus-return can be asserted like real call sites. */
function Harness(props: HarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          props.onOpenChange?.(o);
        }}
        title="Log out?"
        description="You'll need your password to come back."
        confirmLabel="Log out"
        cancelLabel="Cancel"
        onConfirm={props.onConfirm ?? vi.fn()}
        {...props}
      />
    </>
  );
}

async function openDialog() {
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  return screen.findByRole("alertdialog");
}

describe("ConfirmDialog", () => {
  it("renders as an alertdialog named by its title and described by its body", async () => {
    render(<Harness />);
    const dialog = await openDialog();
    expect(dialog).toHaveAccessibleName("Log out?");
    expect(dialog).toHaveAccessibleDescription("You'll need your password to come back.");
  });

  it("focuses Cancel on open (the safe choice)", async () => {
    render(<Harness />);
    await openDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
  });

  it("Cancel closes without confirming and returns focus to the trigger", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await openDialog();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toHaveFocus());
  });

  it("Escape closes without confirming", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await openDialog();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm once even when the confirm button is double-clicked", async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    render(<Harness onConfirm={onConfirm} />);
    await openDialog();
    await userEvent.dblClick(screen.getByRole("button", { name: "Log out" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    resolve();
  });

  it("allows confirming again after a previous attempt settled", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<Harness onConfirm={onConfirm} />);
    await openDialog();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("busy disables both buttons and blocks Escape", async () => {
    const onOpenChange = vi.fn();
    render(<Harness busy onOpenChange={onOpenChange} />);
    await openDialog();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Log out" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("confirmDisabled disables only the confirm button", async () => {
    render(<Harness confirmDisabled />);
    await openDialog();
    expect(screen.getByRole("button", { name: "Log out" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("marks destructive confirms (default tone) and not default-tone ones", async () => {
    const { unmount } = render(<Harness />);
    await openDialog();
    expect(screen.getByRole("button", { name: "Log out" })).toHaveAttribute("data-tone", "destructive");
    unmount();
    render(<Harness tone="default" confirmLabel="Reactivate" />);
    await openDialog();
    expect(screen.getByRole("button", { name: "Reactivate" })).toHaveAttribute("data-tone", "default");
  });

  it("renders extra body content (e.g. a reason field)", async () => {
    render(<Harness>{<label>Reason<input /></label>}</Harness>);
    await openDialog();
    expect(screen.getByLabelText("Reason")).toBeInTheDocument();
  });

  it("falls back to returnFocusTo when the opener left the page", async () => {
    function Gone() {
      const [open, setOpen] = useState(false);
      const [showOpener, setShowOpener] = useState(true);
      return (
        <>
          <button type="button" id="fallback">
            Fallback
          </button>
          {showOpener ? (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
              }}
            >
              Open
            </button>
          ) : null}
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Log out Android?"
            description="x"
            confirmLabel="Log out"
            cancelLabel="Cancel"
            returnFocusTo={() => document.getElementById("fallback")}
            onConfirm={() => {
              setShowOpener(false); // e.g. the revoked session's row disappears
              setOpen(false);
            }}
          />
        </>
      );
    }
    render(<Gone />);
    await openDialog();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Fallback" })).toHaveFocus());
  });
});
