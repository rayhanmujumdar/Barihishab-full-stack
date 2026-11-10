import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { context, adminPage, ownerPage, req, tanvirApproved } from "./fixtures";
import { RequestsView } from "./RequestsView";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh }), usePathname: () => "/en/requests" }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), fieldErrors: () => ({}) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }) }));

const api = vi.mocked(apiFetch);
const formContext = { ownerId: "o-nasrin", ownerName: "Nasrin Ahmed", balancePaisa: -500000, advanceLimitPaisa: 3316300, advanceUsedPaisa: 500000, activeLoans: [], openMonth: "2026-10", grantPerTenPctPaisa: 57000, pendingNumbers: [] };

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  api.mockReset();
  api.mockImplementation(async (path: string) => (path.startsWith("/requests/form-context") ? { ok: true, status: 200, data: formContext } : { ok: true, status: 200, data: { request: req() } }));
});

describe("owner layout (F1, F12)", () => {
  it("shows two tabs, the empty state with Request money, and the paid-out tab", () => {
    const { unmount } = render(<RequestsView locale="en" data={ownerPage()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Requests" })).toBeInTheDocument();
    expect(screen.getByText("Advance · loan · special grant")).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Request sections" });
    expect(within(tabs).getAllByRole("link").map((l) => l.textContent)).toEqual(["My requests", "Paid out to owners"]);
    expect(within(tabs).getByRole("link", { name: "My requests" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Paid out to owners" })).toHaveAttribute("href", "/en/requests?tab=paid");
    expect(screen.getByText("No requests yet.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Request money" })).toHaveLength(2);
    expect(screen.queryByText("Needs your decision")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Owner")).not.toBeInTheDocument();
    unmount();
    render(<RequestsView locale="en" data={ownerPage({ tab: "paid" })} />);
    expect(screen.getByText("Nothing has been paid out through requests yet.")).toBeInTheDocument();
    expect(screen.queryByText("No requests yet.")).not.toBeInTheDocument();
  });

  it("never offers decision buttons to an owner", () => {
    const paid = req({ id: "p1", status: "DISBURSED", limited: true, ownerName: "Sabrina Ahmed", amountApprovedPaisa: 600000, decidedBy: "Rayhan Ahmed" });
    const mine = req({ mine: true, status: "PENDING" });
    const list = { scope: "own" as const, mine: [mine, { ...tanvirApproved(), mine: true }], paidOut: [paid], paidOutMore: false };
    const { unmount } = render(<RequestsView locale="en" data={ownerPage({ list })} />);
    for (const name of ["Approve", "Reject", "Withdraw approval", /Disburse/]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    const own = screen.getByRole("list", { name: "My requests" });
    expect(within(own).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(own).getAllByRole("button", { name: "Cancel request" })).toHaveLength(2);
    unmount();
    render(<RequestsView locale="en" data={ownerPage({ list, tab: "paid" })} />);
    for (const name of ["Approve", "Reject", "Withdraw approval", /Disburse/]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    const paidList = screen.getByRole("list", { name: "Paid out to owners" });
    expect(paidList).toHaveTextContent("Sabrina Ahmed");
    expect(paidList).toHaveTextContent("Approved by Rayhan Ahmed");
  });
});

describe("Super Admin layout (F1, F4)", () => {
  it("shows three tabs with counts, the decision queue with its context panel, and the approved tab", () => {
    const { unmount } = render(<RequestsView locale="en" data={adminPage()} />);
    const tabs = screen.getByRole("navigation", { name: "Request sections" });
    expect(within(tabs).getAllByRole("link").map((l) => l.textContent)).toEqual(["Needs your decision1", "Approved · awaiting cash1", "History"]);
    expect(within(tabs).getByRole("link", { name: /Needs your decision/ })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: /History/ })).toHaveAttribute("href", "/en/requests?tab=history");
    expect(screen.queryByRole("region", { name: "Approved · awaiting cash" })).not.toBeInTheDocument();
    const decide = screen.getByRole("region", { name: "Needs your decision" });
    expect(decide).toHaveTextContent("৳10,000 · Advance");
    expect(decide).toHaveTextContent("Their balance−৳5,000 advance outstanding");
    expect(decide).toHaveTextContent("Limit used ৳5,000 now → ৳15,000 after this request.");
    expect(within(decide).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(within(decide).getByRole("button", { name: "Reject" })).toBeInTheDocument();
    unmount();
    render(<RequestsView locale="en" data={adminPage({ tab: "approved" })} />);
    const approved = screen.getByRole("region", { name: "Approved · awaiting cash" });
    expect(approved).toHaveTextContent("Approved ৳6,000");
    expect(approved).toHaveTextContent("Admin: Reduced — bank balance is low until rent clears");
    expect(within(approved).getByRole("button", { name: "Disburse · posts an advance" })).toBeEnabled();
  });

  it("flags over-limit, overdue, other pending and above-fund", () => {
    const r = req({ overdue: true });
    render(
      <RequestsView
        locale="en"
        data={adminPage({
          list: { scope: "all", pending: [r], approved: [], history: [], historyMore: false, years: [] },
          contexts: { [r.id]: context({ advance: { usedBeforePaisa: 3000000, usedAfterPaisa: 4000000, limitPaisa: 3316300, overLimit: true }, pendingOthers: ["R-2026-013"], aboveHouseFund: true }) },
        })}
      />,
    );
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Above the advance limit — allowed, but flagged.")).toBeInTheDocument();
    expect(screen.getByText("You already have a pending request (R-2026-013).")).toBeInTheDocument();
    expect(screen.getByText(/more than the House Fund holds/)).toBeInTheDocument();
  });

  it("says nothing is waiting or approved, and filters history through the URL", async () => {
    const list = { scope: "all" as const, pending: [], approved: [], history: [], historyMore: false, years: [2026, 2025] };
    const { unmount } = render(<RequestsView locale="en" data={adminPage({ list })} />);
    expect(screen.getByText("No requests waiting. Owners' new requests land here and you get an email.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    unmount();
    const r = render(<RequestsView locale="en" data={adminPage({ list, tab: "approved" })} />);
    expect(screen.getByText("Nothing approved is waiting for cash.")).toBeInTheDocument();
    r.unmount();
    render(<RequestsView locale="en" data={adminPage({ list, tab: "history" })} />);
    await userEvent.selectOptions(screen.getByLabelText("Status"), "REJECTED");
    expect(replace).toHaveBeenCalledWith("/en/requests?tab=history&status=REJECTED", { scroll: false });
  });

  it("labels Disburse by type and disables it without an open month", () => {
    const loan = req({ id: "l", type: "LOAN", status: "APPROVED", amountApprovedPaisa: 1000000 });
    const grant = req({ id: "g", type: "GRANT", status: "APPROVED", amountApprovedPaisa: 1000000 });
    render(<RequestsView locale="en" data={adminPage({ tab: "approved", openMonth: null, list: { scope: "all", pending: [], approved: [loan, grant], history: [], historyMore: false, years: [] } })} />);
    expect(screen.getByRole("button", { name: "Disburse · opens a loan" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Disburse · books an expense" })).toBeDisabled();
    expect(screen.getAllByText("Open a month first — payouts are recorded in an open month.").length).toBeGreaterThan(0);
  });

  it("shows tags for self-approved, recorded and voided entries", () => {
    const r = req({ status: "DISBURSED", isSelf: true, recordedBy: "Rayhan Ahmed", linkedEntry: { kind: "ADVANCE", id: "e", label: "", loanNumber: null, month: "2026-10", ownerId: "o", voided: true } });
    render(<RequestsView locale="en" data={adminPage({ tab: "history", list: { scope: "all", pending: [], approved: [], history: [r], historyMore: false, years: [2026] } })} />);
    expect(screen.getByText("Self-approved")).toBeInTheDocument();
    expect(screen.getByText("Recorded by Rayhan Ahmed on behalf of Nasrin Ahmed")).toBeInTheDocument();
    expect(screen.getByText("Entry voided")).toBeInTheDocument();
  });
});

describe("request money dialog (F2)", () => {
  it("shows type help, the balance, plan only for loans, and live hints", async () => {
    render(<RequestsView locale="en" data={ownerPage()} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Request money" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Taken from your future entitlements automatically. No repayment needed.");
    expect(await within(dialog).findByText(/Your advance limit is about ৳33,163; you've used ৳5,000./)).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Your balance now:");
    expect(within(dialog).queryByLabelText("Repayment plan")).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByLabelText("Loan"));
    expect(within(dialog).getByLabelText("Repayment plan")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("A separate loan ledger.");
  });

  it("validates with the PRD messages before sending", async () => {
    render(<RequestsView locale="en" data={ownerPage()} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Request money" })[0]);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Submit request" }));
    expect(dialog).toHaveTextContent("Enter an amount greater than zero.");
    expect(dialog).toHaveTextContent("Tell everyone what it is for.");
    expect(api).not.toHaveBeenCalledWith("/requests", expect.anything());
  });

  it("submits and refreshes", async () => {
    render(<RequestsView locale="en" data={ownerPage()} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Request money" })[0]);
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Amount (৳)"), "10000");
    await userEvent.type(within(dialog).getByLabelText("What is it for?"), "Cataract surgery deposit");
    await userEvent.click(within(dialog).getByRole("button", { name: "Submit request" }));
    expect(api).toHaveBeenCalledWith("/requests", { method: "POST", body: expect.objectContaining({ type: "ADVANCE", amountPaisa: 1000000, reason: "Cataract surgery deposit", repaymentPlan: null }) });
    expect(refresh).toHaveBeenCalled();
  });

  it("asks for the owner when recording on someone's behalf", async () => {
    render(<RequestsView locale="en" data={adminPage()} />);
    await userEvent.click(screen.getByRole("button", { name: "More request actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Record request for…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Record request for an owner" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Owner")).toBeInTheDocument();
  });
});

describe("decision dialogs (F5, F6, F7, F8)", () => {
  it("approve: lower needs a note; the self text shows for own requests", async () => {
    const own = req({ isSelf: true });
    render(<RequestsView locale="en" data={adminPage({ list: { scope: "all", pending: [own], approved: [], history: [], historyMore: false, years: [] }, contexts: { [own.id]: context() } })} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Nasrin Ahmed asked for ৳10,000 (Advance). You may approve a lower amount.");
    expect(dialog).toHaveTextContent("This is your own request");
    const amount = within(dialog).getByLabelText("Approved amount (৳)");
    expect(amount).toHaveValue("10000");
    await userEvent.clear(amount);
    await userEvent.type(amount, "6000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(dialog).toHaveTextContent("Explain why the amount is lower.");
    await userEvent.clear(amount);
    await userEvent.type(amount, "12000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(dialog).toHaveTextContent("Approve between ৳1 and ৳10,000.");
  });

  it("approve and disburse now opens the disburse dialog", async () => {
    api.mockImplementation(async () => ({ ok: true, status: 200, data: { request: { ...req(), status: "APPROVED", amountApprovedPaisa: 1000000 } } }));
    render(<RequestsView locale="en" data={adminPage()} />);
    await userEvent.click(within(screen.getByRole("region", { name: "Needs your decision" })).getByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByLabelText("Approve and disburse now"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("heading", { name: "Disburse · posts an advance" })).toBeInTheDocument();
  });

  it("reject needs a reason", async () => {
    render(<RequestsView locale="en" data={adminPage()} />);
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Reject this request? Nasrin Ahmed is emailed with your reason.");
    expect(within(dialog).getByRole("button", { name: "Reject request" })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Reason"), "Existing loan L2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reject request" }));
    expect(api).toHaveBeenCalledWith(`/requests/${req().id}/reject`, { method: "POST", body: { reason: "Existing loan L2" } });
  });

  it("disburse: reference required except Cash, instalment pre-filled from the plan, fund-short warning", async () => {
    const loan = req({ id: "l", type: "LOAN", status: "APPROVED", amountApprovedPaisa: 5000000, amountRequestedPaisa: 5000000, repaymentPlan: "৳4,000 per month" });
    render(<RequestsView locale="en" data={adminPage({ tab: "approved", list: { scope: "all", pending: [], approved: [loan], history: [], historyMore: false, years: [] } })} />);
    await userEvent.click(screen.getByRole("button", { name: "Disburse · opens a loan" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Monthly instalment (৳)")).toHaveValue("4000");
    expect(dialog).toHaveTextContent("This is more than Cash holds (৳31,000).");
    await userEvent.click(within(dialog).getByLabelText("bKash"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Disburse" }));
    expect(dialog).toHaveTextContent("Add the bKash TrxID, Nagad TrxID or cheque number.");
    await userEvent.type(within(dialog).getByLabelText(/Reference/), "TrxID 8K2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Disburse" }));
    expect(api).toHaveBeenCalledWith("/requests/l/disburse", expect.objectContaining({ method: "POST", body: expect.objectContaining({ method: "BKASH", referenceNo: "TrxID 8K2", installmentPaisa: 400000 }) }));
  });

  it("cancel goes through a confirmation", async () => {
    const mine = req({ mine: true });
    render(<RequestsView locale="en" data={ownerPage({ list: { scope: "own", mine: [mine], paidOut: [], paidOutMore: false } })} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Cancel R-2026-014? The Admin is told.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel request" }));
    expect(api).toHaveBeenCalledWith(`/requests/${mine.id}/cancel`, { method: "POST", body: {} });
  });
});

describe("badge, paging and editing files (F1, F3)", () => {
  it("marks an unseen decision as seen and refreshes; does nothing when all are seen", async () => {
    const { unmount } = render(<RequestsView locale="en" data={ownerPage({ list: { scope: "own", mine: [req({ mine: true })], paidOut: [], paidOutMore: false } })} />);
    expect(api).not.toHaveBeenCalledWith("/requests/seen", expect.anything());
    unmount();
    render(<RequestsView locale="en" data={ownerPage({ list: { scope: "own", mine: [{ ...tanvirApproved(), mine: true, unseen: true }], paidOut: [], paidOutMore: false } })} />);
    await vi.waitFor(() => expect(api).toHaveBeenCalledWith("/requests/seen", { method: "POST" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows older history on demand and resets paging when a filter changes", async () => {
    render(<RequestsView locale="en" data={adminPage({ tab: "history", filters: { owner: "", type: "", status: "", year: null, limit: 50 }, list: { scope: "all", pending: [], approved: [], history: [req({ status: "REJECTED" })], historyMore: true, years: [2026] } })} />);
    await userEvent.click(screen.getByRole("button", { name: "Show older" }));
    expect(replace).toHaveBeenLastCalledWith("/en/requests?tab=history&limit=100", { scroll: false });
    await userEvent.selectOptions(screen.getByLabelText("Type"), "LOAN");
    expect(replace).toHaveBeenLastCalledWith("/en/requests?tab=history&type=LOAN", { scroll: false });
  });

  it("lists the request's files when editing and sends the removed ones", async () => {
    const mine = req({ mine: true, attachmentCount: 1 });
    api.mockImplementation(async (path: string) => {
      if (path.startsWith("/requests/form-context")) return { ok: true, status: 200, data: formContext };
      if (path === `/requests/${mine.id}`) return { ok: true, status: 200, data: { request: mine, attachments: [{ id: "f1", fileName: "estimate.jpg", mime: "image/jpeg", sizeBytes: 9, isPrivate: true }], timeline: [], context: null } };
      return { ok: true, status: 200, data: { request: mine, warnings: [] } };
    });
    render(<RequestsView locale="en" data={ownerPage({ list: { scope: "own", mine: [mine], paidOut: [], paidOutMore: false } })} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    const files = await within(dialog).findByRole("list", { name: "Files on this request" });
    expect(files).toHaveTextContent("estimate.jpg · Private");
    await userEvent.click(within(files).getByRole("button", { name: "Remove estimate.jpg" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(api).toHaveBeenCalledWith(`/requests/${mine.id}`, { method: "PATCH", body: expect.objectContaining({ removeAttachmentIds: ["f1"] }) });
  });

  it("asks for at least ৳1", async () => {
    render(<RequestsView locale="en" data={ownerPage()} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Request money" })[0]);
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Amount (৳)"), "0.50");
    await userEvent.click(within(dialog).getByRole("button", { name: "Submit request" }));
    expect(dialog).toHaveTextContent("Ask for at least ৳1.");
  });

  it("shows another owner's paid-out request with its paid date only", () => {
    const paid = req({ status: "DISBURSED", limited: true, askedOn: "2026-10-26", neededBy: "2026-10-26", amountRequestedPaisa: 600000, amountApprovedPaisa: 600000 });
    render(<RequestsView locale="en" data={ownerPage({ tab: "paid", list: { scope: "own", mine: [], paidOut: [paid], paidOutMore: false } })} />);
    const list = screen.getByRole("list", { name: "Paid out to owners" });
    expect(list).toHaveTextContent("Paid out 26 Oct 2026");
    expect(list).not.toHaveTextContent("Needed by");
  });
});

describe("detail sheet (F9)", () => {
  it("shows the linked entry and the timeline", () => {
    const r = req({ status: "DISBURSED", linkedEntry: { kind: "LOAN", id: "loan-3", label: "Loan L3", loanNumber: 3, month: "2026-10", ownerId: "o-nasrin", voided: false } });
    render(
      <RequestsView
        locale="en"
        data={ownerPage({
          detail: {
            request: r,
            attachments: [],
            context: null,
            timeline: [
              { kind: "SUBMITTED", at: "2026-10-19T04:00:00.000Z", by: "Nasrin Ahmed", amountPaisa: 1000000, note: null, date: null, method: null, referenceNo: null },
              { kind: "DISBURSED", at: "2026-10-20T04:00:00.000Z", by: "Rayhan Ahmed", amountPaisa: 1000000, note: null, date: "2026-10-20", method: "BKASH", referenceNo: "TrxID 8K2" },
            ],
          },
        })}
      />,
    );
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("link", { name: "L3" })).toHaveAttribute("href", "/en/advances?loan=loan-3");
    expect(sheet).toHaveTextContent("Submitted · ৳10,000");
    expect(sheet).toHaveTextContent("Disbursed · ৳10,000 · 20 Oct 2026 · bKash · TrxID 8K2");
  });
});

describe("Bangla", () => {
  it("renders labels and digits in Bangla", () => {
    render(<RequestsView locale="bn" data={adminPage()} />);
    expect(screen.getByRole("heading", { level: 1, name: "অনুরোধ" })).toBeInTheDocument();
    expect(screen.getByText("R-২০২৬-০১৪")).toBeInTheDocument();
    expect(screen.getAllByText(/৳১০,০০০/).length).toBeGreaterThan(0);
  });
});
