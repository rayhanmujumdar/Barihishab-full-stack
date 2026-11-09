import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { PayDrawer } from "./PayDrawer";
import { ownerPage } from "./fixtures";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), fieldErrors: () => ({}) }));
const toast = vi.fn();
const warning = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign((...a: unknown[]) => toast(...a), { error: vi.fn(), warning: (...a: unknown[]) => warning(...a) }) }));
const api = vi.mocked(apiFetch);

function setup(mode: "pay" | "advance" = "pay", ownerExtra: Record<string, unknown> = {}) {
  const data = ownerPage();
  const onSaved = vi.fn();
  render(<PayDrawer locale="en" mode={mode} data={{ ...data, owner: { ...data.owner, ...ownerExtra } }} onClose={vi.fn()} onSaved={onSaved} />);
  return { onSaved, drawer: screen.getByRole("dialog") };
}

const amount = () => screen.getByLabelText(/^Amount/);
const save = (name = "Record payment") => userEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  api.mockReset();
  toast.mockReset();
  warning.mockReset();
});

describe("PayDrawer — pay (F11)", () => {
  it("shows the balance panel and fills the full balance", async () => {
    const { drawer } = setup();
    expect(drawer).toHaveAccessibleName("Pay Tanvir Ahmed");
    expect(drawer).toHaveTextContent("Tanvir Ahmed · balance ৳8,055.85");
    expect(drawer).toHaveTextContent("Against: October 2026");
    expect(amount()).toHaveValue("8055.85");
    await userEvent.clear(amount());
    await userEvent.click(screen.getByRole("button", { name: "Use full balance ৳8,055.85" }));
    expect(amount()).toHaveValue("8055.85");
  });

  it("starts empty with a warning when nothing is owed", () => {
    setup("pay", { balancePaisa: -500000, balanceLabel: "ADVANCE", oldestDueMonth: null });
    expect(amount()).toHaveValue("");
    expect(screen.getByText("Nothing is owed — anything you pay becomes an advance or loan")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Use full balance/ })).toBeNull();
  });

  it("needs a reference number for bKash, Bank and Nagad", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: "bKash" }));
    await save();
    expect(screen.getByText("Add the bKash TrxID, Nagad TrxID or cheque number.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("warns about a short fund and the House Fund without blocking", async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText(/^Fund account/), "f-small");
    expect(screen.getByText("Petty cash would go to −৳7,055.85.")).toBeInTheDocument();
    await userEvent.clear(amount());
    await userEvent.type(amount(), "30000");
    expect(screen.getByText("This is more than the House Fund holds (৳21,000).")).toBeInTheDocument();
  });

  it("asks advance or loan above the balance and re-sends with the same key", async () => {
    const { onSaved } = setup();
    await userEvent.clear(amount());
    await userEvent.type(amount(), "13000");
    api.mockResolvedValueOnce({ ok: false, status: 409, error: { code: "EXCEEDS_BALANCE", message: "x", details: { balancePaisa: 805585, payoutPaisa: 805585, excessPaisa: 494415 } } });
    await save();
    const dialog = await screen.findByRole("alertdialog", { name: "More than the balance" });
    expect(dialog).toHaveTextContent("Payout৳8,055.85");
    expect(dialog).toHaveTextContent("Excess৳4,944.15");
    expect(dialog).toHaveTextContent("৳4,944.15 more than Tanvir Ahmed's balance");
    api.mockResolvedValueOnce({ ok: true, status: 201, data: { entries: [{ type: "PAYOUT" }, { type: "ADVANCE" }], loan: null, balancePaisa: -494415, warnings: [] } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Record excess as an advance" }));
    const [first, second] = api.mock.calls;
    expect(first[0]).toBe("/payouts");
    expect((second[1]!.body as { splitExcessAs: string }).splitExcessAs).toBe("ADVANCE");
    expect(second[1]!.headers).toEqual(first[1]!.headers);
    expect(toast).toHaveBeenCalledWith("Payment of ৳13,000 recorded for Tanvir Ahmed");
    expect(onSaved).toHaveBeenCalled();
  });

  it("lets the bookkeeper change the amount instead", async () => {
    setup();
    await userEvent.clear(amount());
    await userEvent.type(amount(), "13000");
    api.mockResolvedValueOnce({ ok: false, status: 409, error: { code: "EXCEEDS_BALANCE", message: "x", details: { balancePaisa: 805585, payoutPaisa: 805585, excessPaisa: 494415 } } });
    await save();
    await userEvent.click(await screen.findByRole("button", { name: "Change the amount" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("only announces the loan when nothing was paid out", async () => {
    setup("pay", { balancePaisa: 0, balanceLabel: "SETTLED", oldestDueMonth: null });
    await userEvent.type(amount(), "1000");
    api.mockResolvedValueOnce({ ok: false, status: 409, error: { code: "EXCEEDS_BALANCE", message: "x", details: { balancePaisa: 0, payoutPaisa: 0, excessPaisa: 100000 } } });
    await save();
    api.mockResolvedValueOnce({ ok: true, status: 201, data: { entries: [], loan: { principalPaisa: 100000 }, balancePaisa: 0, warnings: [] } });
    await userEvent.click(await screen.findByRole("button", { name: "Record excess as a loan" }));
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("Loan of ৳1,000 recorded for Tanvir Ahmed");
  });

  it("records a full payment with a toast", async () => {
    const { onSaved } = setup();
    api.mockResolvedValueOnce({ ok: true, status: 201, data: { entries: [{ type: "PAYOUT" }], loan: null, balancePaisa: 0, warnings: [] } });
    await save();
    expect(api).toHaveBeenCalledWith("/payouts", expect.objectContaining({ method: "POST", body: expect.objectContaining({ ownerId: "o-tanvir", amountPaisa: 805585, method: "CASH", fundAccountId: "f-cash" }) }));
    expect(toast).toHaveBeenCalledWith("Payment of ৳8,055.85 recorded for Tanvir Ahmed");
    expect(onSaved).toHaveBeenCalled();
  });
});

describe("PayDrawer — advance (F12)", () => {
  it("requires a reason and flags over-limit advances", async () => {
    setup("advance");
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Record advance for Tanvir Ahmed");
    expect(amount()).toHaveValue("");
    await userEvent.type(amount(), "5000");
    await save("Record advance");
    expect(screen.getByText("Please write a reason — everyone can see it.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Reason/), "Eye check-up");
    api.mockResolvedValueOnce({ ok: true, status: 201, data: { entry: {}, balancePaisa: 0, warnings: [{ code: "ADVANCE_OVER_LIMIT", limitPaisa: 100 }] } });
    await save("Record advance");
    expect(api).toHaveBeenCalledWith("/advances", expect.objectContaining({ body: expect.objectContaining({ reason: "Eye check-up", amountPaisa: 500000 }) }));
    expect(toast).toHaveBeenCalledWith("Advance of ৳5,000 recorded for Tanvir Ahmed");
    expect(warning).toHaveBeenCalledWith("Above the advance limit — allowed, but flagged.");
  });
});
