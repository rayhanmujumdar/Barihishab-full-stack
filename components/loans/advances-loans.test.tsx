import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdvancesLoansView } from "./AdvancesLoansView";
import { advanceRow, detail, nasrin, ownerPerms, pageData, standing } from "./fixtures";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/en/advances" }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), fieldErrors: () => ({}) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }) }));

beforeEach(() => replace.mockReset());

describe("header and tiles (F1)", () => {
  it("shows the four tiles and both create buttons for the Super Admin", () => {
    render(<AdvancesLoansView locale="en" data={pageData()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Advances & loans" })).toBeInTheDocument();
    expect(screen.getByText("Separate loan ledger")).toBeInTheDocument();
    const tiles = screen.getByRole("region", { name: "Summary" });
    expect(tiles).toHaveTextContent("Loans outstanding৳35,000");
    expect(tiles).toHaveTextContent("Active loans1");
    expect(tiles).toHaveTextContent("Advances outstanding৳5,000");
    expect(tiles).toHaveTextContent("Advances paid 2026");
    expect(screen.getByRole("button", { name: "Advance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New loan" })).toBeInTheDocument();
  });

  it("switches the year and filters through the URL", async () => {
    render(<AdvancesLoansView locale="en" data={pageData({ summary: { ...pageData().summary, years: [2026, 2025] } })} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Year" }), "2025");
    expect(replace).toHaveBeenCalledWith("/en/advances?tab=loans&year=2025", { scroll: false });
    await userEvent.selectOptions(screen.getByLabelText("Status"), "ACTIVE");
    expect(replace).toHaveBeenLastCalledWith("/en/advances?tab=loans&status=ACTIVE&year=2026", { scroll: false });
  });

  it("links the three tabs and marks the current one", () => {
    render(<AdvancesLoansView locale="en" data={pageData({ tab: "advances", advances: [advanceRow()] })} />);
    const tabs = screen.getByRole("navigation", { name: "Sections" });
    expect(within(tabs).getByRole("link", { name: "Advances" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "By owner" })).toHaveAttribute("href", "/en/advances?tab=owners&year=2026");
  });
});

describe("Loans tab (F2, F6)", () => {
  it("shows L2 with progress, schedule and its last movements; Repaid is a neutral word", () => {
    render(<AdvancesLoansView locale="en" data={pageData()} />);
    const card = screen.getByRole("article", { name: "L2 · Tanvir Ahmed" });
    expect(card).toHaveTextContent("Active");
    expect(card).toHaveTextContent("Daughter's school admission");
    expect(card).toHaveTextContent("Disbursed 10 Jun 2026 · ৳5,000 / month · Direct");
    expect(card).toHaveTextContent("Repaid ৳15,000 of ৳50,000");
    expect(card).toHaveTextContent("৳35,000 left");
    expect(card).toHaveTextContent("Expected to finish April 2027");
    expect(card).toHaveTextContent("Next deduction ৳5,000 when October 2026 closes.");
    expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
    expect(card).toHaveTextContent("31 Jul 2026 · Deducted from entitlement");
    const repaid = screen.getByRole("article", { name: "L1 · Farzana Haque" });
    expect(repaid).toHaveTextContent("Repaid");
    expect(repaid).toHaveTextContent("Manual");
    expect(within(repaid).queryByRole("button", { name: "Record repayment" })).toBeNull();
    expect(within(card).getByRole("button", { name: "Record repayment" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "More actions for L2" })).toBeInTheDocument();
  });

  it("opens the detail through the URL", async () => {
    render(<AdvancesLoansView locale="en" data={pageData()} />);
    await userEvent.click(within(screen.getByRole("article", { name: "L2 · Tanvir Ahmed" })).getByRole("button", { name: "See all" }));
    expect(replace).toHaveBeenCalledWith("/en/advances?tab=loans&year=2026&loan=l-2", { scroll: false });
  });

  it("gives an Owner no create, repay or menu controls", () => {
    render(<AdvancesLoansView locale="en" data={pageData({ perms: ownerPerms })} />);
    for (const name of ["Advance", "New loan", "Record repayment", "More actions for L2"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("shows the empty state with New loan for the Super Admin only", () => {
    const { unmount } = render(<AdvancesLoansView locale="en" data={pageData({ loans: [] })} />);
    expect(screen.getByText("No loans yet. Loans are for amounts bigger than a month's share.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New loan" })).toHaveLength(2);
    unmount();
    render(<AdvancesLoansView locale="en" data={pageData({ loans: [], perms: ownerPerms })} />);
    expect(screen.queryByRole("button", { name: "New loan" })).toBeNull();
  });
});

describe("Loan detail (F3, F8)", () => {
  it("lists movements oldest first, strikes voided ones and offers Void only on voidable rows", () => {
    render(<AdvancesLoansView locale="en" data={pageData({ detail: detail() })} />);
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveTextContent("DBBL savings");
    expect(sheet).toHaveTextContent("TRX-88");
    const rows = within(sheet).getAllByRole("listitem").filter((li) => li.closest("ol"));
    const kinds = ["10 Jun 2026 · Disbursed", "Repaid in cash", "Reversal", "Deducted from entitlement", "Instalment skipped — no entitlement in September 2026."];
    expect(rows).toHaveLength(kinds.length);
    kinds.forEach((k, i) => expect(rows[i]).toHaveTextContent(k));
    expect(rows[0]).toHaveTextContent("Outstanding ৳50,000");
    expect(rows[1]).toHaveAttribute("data-void", "true");
    expect(rows[1]).toHaveTextContent("Void · Recorded on the wrong loan");
    expect(within(sheet).getAllByRole("button", { name: /^Void / })).toHaveLength(1);
    expect(within(sheet).getByRole("button", { name: "Void Deducted from entitlement of ৳1,000" })).toBeInTheDocument();
    expect(sheet).toHaveTextContent("Instalment ৳3,000 / month → ৳5,000 / month");
    expect(sheet).toHaveTextContent("Back to normal");
    expect(within(sheet).getByRole("link", { name: /Print statement/ })).toHaveAttribute("href", "/en/loans/l-2/statement/print");
  });

  it("hides Void from Owners", () => {
    render(<AdvancesLoansView locale="en" data={pageData({ detail: detail(), perms: ownerPerms })} />);
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: /^Void / })).toBeNull();
  });
});

describe("Advances tab (F11, F14)", () => {
  it("shows status words, balance now with its word, struck voids and the limit rule", () => {
    const rows = [
      advanceRow({ id: "a-3", ownerId: "o-tanvir", ownerName: "Tanvir Ahmed", status: "OUTSTANDING", recoveredMonth: null, ownerBalancePaisa: -200000, flagged: true }),
      advanceRow({ id: "a-2", status: "VOID", recoveredMonth: null, voidReason: "Duplicate" }),
      advanceRow(),
    ];
    render(<AdvancesLoansView locale="en" data={pageData({ tab: "advances", advances: rows, multiplierPct: 150 })} />);
    const list = screen.getByRole("region", { name: "Advance history" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Outstanding");
    expect(items[0]).toHaveTextContent("Balance now −৳2,000 · Advance outstanding");
    expect(items[0]).toHaveTextContent("Flagged");
    expect(items[1]).toHaveAttribute("data-void", "true");
    expect(items[1]).toHaveTextContent("Void · Duplicate");
    expect(items[2]).toHaveTextContent("Recovered in October 2026");
    expect(items[2]).toHaveTextContent("Balance now +৳28,827.60 · Owed");
    expect(within(items[2]).getByRole("link")).toHaveAttribute("href", "/en/owners/o-nasrin?from=2026-10");
    expect(list).toHaveTextContent("Advance limit: 1.5× each owner's average entitlement over the last 3 closed months.");
  });

  it("has a single Year control, shared by the tile and the list (a11y)", async () => {
    render(<AdvancesLoansView locale="en" data={pageData({ tab: "advances", advances: [advanceRow()], summary: { ...pageData().summary, years: [2026, 2025] } })} />);
    expect(screen.getAllByRole("combobox", { name: "Year" })).toHaveLength(1);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Year" }), "2025");
    expect(replace).toHaveBeenCalledWith("/en/advances?tab=advances&year=2025", { scroll: false });
  });

  it("says when there are no advances", () => {
    render(<AdvancesLoansView locale="en" data={pageData({ tab: "advances", advances: [] })} />);
    expect(screen.getByText("No advances yet.")).toBeInTheDocument();
  });
});

describe("By owner tab (F13)", () => {
  it("shows loans, advance outstanding, limit and use per owner", () => {
    render(<AdvancesLoansView locale="en" data={pageData({ tab: "owners", standing: [nasrin({ limitPaisa: null, limitUsedPct: null, averageEntitlementPaisa: null, lastAdvanceDate: null }), standing()] })} />);
    const rows = within(screen.getByRole("region", { name: "Standing by owner" })).getAllByRole("link");
    expect(rows[1]).toHaveTextContent("৳35,000 · 1 active");
    expect(rows[1]).toHaveTextContent("৳2,000");
    expect(rows[1]).toHaveTextContent("৳12,435.95");
    expect(rows[1]).toHaveTextContent("16%");
    expect(rows[1]).toHaveAttribute("href", "/en/owners/o-tanvir");
    expect(rows[0]).toHaveTextContent("No limit yet");
    expect(rows[0]).toHaveTextContent("None");
  });
});

describe("বাংলা", () => {
  it("uses Bangla digits and words", () => {
    render(<AdvancesLoansView locale="bn" data={pageData()} />);
    expect(screen.getByRole("heading", { level: 1, name: "অগ্রিম ও ঋণ" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "সারসংক্ষেপ" })).toHaveTextContent("৳৩৫,০০০");
    expect(screen.getByRole("article", { name: "L২ · Tanvir Ahmed" })).toHaveTextContent("চলমান");
  });
});
