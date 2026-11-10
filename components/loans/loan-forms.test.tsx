import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { l2, nasrin, pageData, standing } from "./fixtures";
import { InstalmentDialog } from "./InstalmentDialog";
import { LoanActionDialog } from "./LoanActionDialog";
import { LoanDrawer } from "./LoanDrawer";
import { RepaymentDialog } from "./RepaymentDialog";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), fieldErrors: () => ({}) }));
const toast = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign((...a: unknown[]) => toast(...a), { error: vi.fn(), warning: vi.fn() }) }));
const api = vi.mocked(apiFetch);

beforeEach(() => {
  api.mockReset();
  toast.mockReset();
});

const type = (label: RegExp | string, text: string) => userEvent.type(screen.getByLabelText(label), text);

// Many keystrokes across six fields: give jsdom headroom on a busy machine.
describe("New loan drawer (F4)", { timeout: 15_000 }, () => {
  it("shows the existing-loan, payoff, above-share and fund hints", async () => {
    render(<LoanDrawer locale="en" mode="loan" data={{ ...pageData(), openMonth: "2026-06" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/^Owner/), "o-tanvir");
    await type(/^Amount/, "50000");
    await type(/^Monthly instalment/, "15000");
    const drawer = screen.getByRole("dialog");
    expect(drawer).toHaveTextContent("Tanvir Ahmed already has L2 with ৳35,000 left.");
    expect(drawer).toHaveTextContent("Instalment is more than Tanvir Ahmed's average monthly share (৳12,435.95).");
    await userEvent.clear(screen.getByLabelText(/^Monthly instalment/));
    await type(/^Monthly instalment/, "5000");
    expect(drawer).toHaveTextContent(/Paid back in about 10 months — finishing/);
    await userEvent.clear(screen.getByLabelText(/^Amount/));
    await type(/^Amount/, "200000");
    expect(drawer).toHaveTextContent("This is more than the House Fund holds (৳1,00,000).");
  });

  it("validates before sending and posts the loan with an Idempotency-Key", async () => {
    api.mockResolvedValue({ ok: true, status: 201, data: { loan: { number: 3 }, warnings: [] } } as never);
    const onSaved = vi.fn();
    render(<LoanDrawer locale="en" mode="loan" data={pageData()} onClose={vi.fn()} onSaved={onSaved} />);
    await userEvent.click(screen.getByRole("button", { name: "Record loan" }));
    const drawer = screen.getByRole("dialog");
    expect(drawer).toHaveTextContent("Pick an owner.");
    expect(drawer).toHaveTextContent("Enter an amount greater than zero.");
    expect(drawer).toHaveTextContent("A reason is required — every owner can see it.");
    expect(api).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText(/^Owner/), "o-nasrin");
    await type(/^Amount/, "20000");
    await userEvent.click(screen.getByRole("radio", { name: "Bank" }));
    await type(/^Reason/, "Laptop for work");
    await userEvent.click(screen.getByRole("button", { name: "Record loan" }));
    expect(drawer).toHaveTextContent("Add the bKash TrxID");
    await type(/^Reference/, "TRX-1");
    await userEvent.click(screen.getByRole("button", { name: "Record loan" }));
    expect(api).toHaveBeenCalledWith("/loans", expect.objectContaining({ method: "POST", body: expect.objectContaining({ ownerId: "o-nasrin", amountPaisa: 2000000, method: "BANK", referenceNo: "TRX-1", reason: "Laptop for work" }) }));
    expect((api.mock.calls[0][1] as { headers: Record<string, string> }).headers["Idempotency-Key"]).toBeTruthy();
    expect(toast).toHaveBeenCalledWith("Loan L3 recorded · ৳20,000 to Nasrin Ahmed");
    expect(onSaved).toHaveBeenCalled();
  });
});

describe("Advance drawer (F12, F14, G11)", () => {
  it("shows the limit panel and its warnings without blocking", async () => {
    render(<LoanDrawer locale="en" mode="advance" data={{ ...pageData(), standing: [nasrin(), standing({ balancePaisa: 805585, advanceOutstandingPaisa: 0 })] }} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/^Owner/), "o-nasrin");
    await type(/^Amount/, "5000");
    const panel = screen.getByTestId("advance-limit-panel");
    expect(panel).toHaveTextContent("৳33,162.53");
    expect(panel).toHaveTextContent("15% of the limit");
    await userEvent.clear(screen.getByLabelText(/^Amount/));
    await type(/^Amount/, "40000");
    expect(panel).toHaveTextContent("Above the advance limit — allowed, but flagged.");
    await userEvent.selectOptions(screen.getByLabelText(/^Owner/), "o-tanvir");
    expect(screen.getByTestId("advance-limit-panel")).toHaveTextContent("Tanvir Ahmed is owed ৳8,055.85 — pay that first; an advance is for money beyond what is owed.");
    expect(screen.getByRole("button", { name: "Record advance" })).toBeEnabled();
  });

  it("says there is no limit before any month is closed", async () => {
    render(<LoanDrawer locale="en" mode="advance" data={{ ...pageData(), standing: [nasrin({ limitPaisa: null })] }} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/^Owner/), "o-nasrin");
    expect(screen.getByTestId("advance-limit-panel")).toHaveTextContent("No limit yet — no closed months.");
  });
});

describe("Record repayment dialog (F5, G1, G2)", () => {
  const open = (over = {}) =>
    render(<RepaymentDialog locale="en" loan={l2(over)} standing={standing({ balancePaisa: 300000 })} funds={pageData().funds} onClose={vi.fn()} onDone={vi.fn()} />);

  it("defaults to the instalment, offers the full outstanding and explains each mode", async () => {
    open();
    expect(screen.getByRole("heading", { name: "Record repayment · L2" })).toBeInTheDocument();
    expect(screen.getByText("Tanvir Ahmed · outstanding ৳35,000")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Amount/)).toHaveValue("5000");
    expect(screen.getByText(/Cash comes back into the House Fund/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use full outstanding" }));
    expect(screen.getByLabelText(/^Amount/)).toHaveValue("35000");
    await userEvent.click(screen.getByRole("radio", { name: "Deduct from entitlement" }));
    expect(screen.getByText(/Creates a loan deduction on the owner ledger/)).toBeInTheDocument();
    expect(screen.getByText("Tanvir Ahmed's balance: ৳3,000. Deduction can be up to ৳3,000.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Record repayment" }));
    expect(screen.getByText("Tanvir Ahmed's balance is ৳3,000 — you can deduct up to that. Use cash for the rest.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("refuses above the outstanding and toasts on success", async () => {
    api.mockResolvedValue({ ok: true, status: 201, data: { loan: { status: "ACTIVE", outstandingPaisa: 3000000 } } } as never);
    open({ installmentPaisa: null, outstandingPaisa: 1000000 });
    expect(screen.getByLabelText(/^Amount/)).toHaveValue("10000");
    await userEvent.clear(screen.getByLabelText(/^Amount/));
    await type(/^Amount/, "12000");
    await userEvent.click(screen.getByRole("button", { name: "Record repayment" }));
    expect(screen.getByText("Only ৳10,000 is outstanding on L2.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use full outstanding" }));
    await userEvent.click(screen.getByRole("button", { name: "Record repayment" }));
    expect(api).toHaveBeenCalledWith("/loans/l-2/repayments", expect.objectContaining({ body: expect.objectContaining({ mode: "CASH", amountPaisa: 1000000, fundAccountId: "f-cash", method: "CASH" }) }));
    expect(toast).toHaveBeenCalledWith("Repayment recorded · ৳30,000 left on L2");
  });

  it("shows a server refusal on the amount field", async () => {
    api.mockResolvedValue({ ok: false, status: 422, error: { code: "VALIDATION_FAILED", message: "x", details: { fields: { amountPaisa: "Only ৳1 is outstanding on L2." } } } } as never);
    open();
    await userEvent.click(screen.getByRole("button", { name: "Record repayment" }));
    expect(screen.getByText("Only ৳1 is outstanding on L2.")).toBeInTheDocument();
  });
});

describe("Change instalment (F7)", () => {
  it("previews the finish month and needs a reason", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: {} } as never);
    render(<InstalmentDialog locale="en" loan={{ ...l2(), outstandingPaisa: 3000000 }} openMonth="2026-11" onClose={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByText("New expected finish: April 2027")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/^New monthly instalment/));
    await type(/^New monthly instalment/, "3000");
    expect(screen.getByText("New expected finish: August 2027")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("A reason is required — every owner can see it.")).toBeInTheDocument();
    await type(/^Reason/, "Reduced until March at owner's request");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api).toHaveBeenCalledWith("/loans/l-2", { method: "PATCH", body: { installmentPaisa: 300000, reason: "Reduced until March at owner's request" } });
    await userEvent.click(screen.getByLabelText("Manual (no automatic deduction)"));
    expect(screen.getByText("No schedule — Manual")).toBeInTheDocument();
  });
});

describe("Void / cancel / write off (F8–F10)", () => {
  it("cancel needs a reason and shows the server refusal", async () => {
    api.mockResolvedValue({ ok: false, status: 409, error: { code: "LOAN_HAS_REPAYMENTS", message: "This loan has repayments, so it can't be cancelled. Void the repayments first or write it off." } } as never);
    render(<LoanActionDialog locale="en" action={{ kind: "cancel", loan: l2() }} onClose={vi.fn()} onDone={vi.fn()} />);
    const dialog = screen.getByRole("alertdialog", { name: "Cancel L2?" });
    expect(within(dialog).getByRole("button", { name: "Cancel loan" })).toBeDisabled();
    await type(/^Reason/, "Wrong owner");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel loan" }));
    expect(api).toHaveBeenCalledWith("/loans/l-2/cancel", { method: "POST", body: { reason: "Wrong owner" } });
    expect(dialog).toHaveTextContent("This loan has repayments, so it can't be cancelled.");
  });

  it("write off shows the outstanding; void posts to the repayment", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: {} } as never);
    const { unmount } = render(<LoanActionDialog locale="en" action={{ kind: "writeoff", loan: l2() }} onClose={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("৳35,000 is still outstanding. It becomes a house expense in the open month, shared by all owners.");
    unmount();
    const onDone = vi.fn();
    render(<LoanActionDialog locale="en" action={{ kind: "void", loan: l2(), row: l2().recentMovements[0] }} onClose={vi.fn()} onDone={onDone} />);
    await type(/^Reason/, "Wrong loan");
    await userEvent.click(screen.getByRole("button", { name: "Post reversal" }));
    expect(api).toHaveBeenCalledWith("/loans/l-2/repayments/d1/void", { method: "POST", body: { reason: "Wrong loan" } });
    expect(onDone).toHaveBeenCalled();
  });
});
