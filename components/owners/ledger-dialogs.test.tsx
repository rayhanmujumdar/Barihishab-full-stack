import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { entry } from "./fixtures";
import { AdjustmentDialog, VoidLedgerDialog } from "./LedgerDialogs";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), fieldErrors: () => ({}) }));
const toast = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign((...a: unknown[]) => toast(...a), { error: vi.fn(), warning: vi.fn() }) }));
const api = vi.mocked(apiFetch);

beforeEach(() => {
  api.mockReset();
  toast.mockReset();
});

describe("VoidLedgerDialog (F13)", () => {
  it("explains the reversal, needs a reason, then posts it", async () => {
    const onDone = vi.fn();
    render(<VoidLedgerDialog locale="en" entry={entry()} month="2026-10" onClose={vi.fn()} onDone={onDone} />);
    const dialog = screen.getByRole("alertdialog", { name: "Void this payout?" });
    expect(dialog).toHaveTextContent("A reversal of ৳5,000 is posted in October 2026.");
    const confirm = within(dialog).getByRole("button", { name: "Post reversal" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Recorded for the wrong owner");
    api.mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    await userEvent.click(confirm);
    expect(api).toHaveBeenCalledWith("/ledger/e-1/void", { method: "POST", body: { reason: "Recorded for the wrong owner" } });
    expect(toast).toHaveBeenCalledWith("Reversal posted · balance and fund restored");
    expect(onDone).toHaveBeenCalled();
  });
});

describe("AdjustmentDialog (F14)", () => {
  it("posts a signed adjustment with a reference month", async () => {
    const onDone = vi.fn();
    render(<AdjustmentDialog locale="en" ownerId="o-tanvir" month="2026-10" periodMonths={["2026-09", "2026-10"]} onClose={vi.fn()} onDone={onDone} />);
    const dialog = screen.getByRole("dialog", { name: "Balance adjustment" });
    expect(dialog).toHaveTextContent("Posted in October 2026");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Reduce (−)" }));
    await userEvent.type(within(dialog).getByLabelText(/^Amount/), "5000");
    await userEvent.selectOptions(within(dialog).getByLabelText(/Reference month/), "2026-09");
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), "June payout recorded against the wrong owner");
    api.mockResolvedValueOnce({ ok: true, status: 201, data: {} });
    await userEvent.click(within(dialog).getByRole("button", { name: "Post adjustment" }));
    expect(api).toHaveBeenCalledWith("/adjustments", {
      method: "POST",
      body: { ownerId: "o-tanvir", amountPaisa: -500000, referenceMonth: "2026-09", reason: "June payout recorded against the wrong owner" },
      headers: { "Idempotency-Key": expect.any(String) },
    });
    expect(toast).toHaveBeenCalledWith("Adjustment posted");
    expect(onDone).toHaveBeenCalled();
  });
});
