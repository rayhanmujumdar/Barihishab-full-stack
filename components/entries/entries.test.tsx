import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntriesView } from "./EntriesView";
import { entriesData, ownerPerms } from "./fixtures";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh: vi.fn() }), usePathname: () => "/en/entries" }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(async () => ({ ok: true, status: 200, data: { period: "2026-10", rows: [] } })), fieldErrors: () => ({}) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }) }));

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
});

describe("EntriesView deep links (Home PRD §4 + New entry, F8 activity rows)", () => {
  it("opens the new-expense drawer for ?new=EXPENSE and drops the param on close", async () => {
    render(<EntriesView locale="en" data={entriesData()} autoOpen={{ create: "EXPENSE" }} />);
    expect(screen.getByRole("dialog", { name: "New expense" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(replace).toHaveBeenCalledWith("/en/entries?period=2026-10&type=EXPENSE&category=ALL", { scroll: false });
  });

  it("does not open the drawer for someone who cannot add entries", () => {
    render(<EntriesView locale="en" data={entriesData({ perms: ownerPerms })} autoOpen={{ create: "EXPENSE" }} />);
    expect(screen.queryByRole("dialog", { name: "New expense" })).toBeNull();
  });

  it("opens the drawer when ?new= arrives while Entries is already open (top-bar + New entry / bottom-nav +)", async () => {
    const data = entriesData();
    const { rerender } = render(<EntriesView locale="en" data={data} autoOpen={{ create: null }} />);
    expect(screen.queryByRole("dialog", { name: "New expense" })).toBeNull();
    rerender(<EntriesView locale="en" data={data} autoOpen={{ create: "EXPENSE" }} />);
    expect(screen.getByRole("dialog", { name: "New expense" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(replace).toHaveBeenCalledTimes(1);
    // The param is gone (router.replace); a second click brings it back and reopens.
    rerender(<EntriesView locale="en" data={data} autoOpen={{ create: null }} />);
    rerender(<EntriesView locale="en" data={data} autoOpen={{ create: "EXPENSE" }} />);
    expect(screen.getByRole("dialog", { name: "New expense" })).toBeInTheDocument();
  });

  it("opens an entry's detail for ?entry=<id>", () => {
    const data = entriesData();
    render(<EntriesView locale="en" data={data} autoOpen={{ entry: data.items[1].id }} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("EntriesView Questioned rows (Notices & Complaints C8)", () => {
  it("asks which visible entries are questioned and tags those rows", async () => {
    const { apiFetch } = await import("@/lib/api/client");
    const data = entriesData();
    const first = data.items[0];
    vi.mocked(apiFetch).mockImplementation(async (path: string) =>
      path.startsWith("/complaints/questioned") ? { ok: true, status: 200, data: { items: { [first.id]: "c-1" } } } : { ok: true, status: 200, data: { period: "2026-10", rows: [] } },
    );
    render(<EntriesView locale="en" data={{ ...data, perms: { ...data.perms, complaints: true } }} />);
    const row = await screen.findByText("Questioned");
    expect(row.closest("button")).toHaveTextContent(first.vendor ?? "");
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(expect.stringMatching(/^\/complaints\/questioned\?type=ENTRY&ids=/), undefined);
    expect(screen.getAllByText("Questioned")).toHaveLength(1);
  });
});

describe("EntriesView (LST-01..05)", () => {
  it("shows both tabs with counts and totals; the active one is pressed", () => {
    render(<EntriesView locale="en" data={entriesData()} />);
    const income = screen.getByRole("button", { name: /Income.*1 entry.*৳18,000/ });
    const expense = screen.getByRole("button", { name: /Expense.*3 entries.*৳9,900/ });
    expect(expense).toHaveAttribute("aria-pressed", "true");
    expect(income).toHaveAttribute("aria-pressed", "false");
  });

  it("switching tab updates the URL and resets the category", async () => {
    render(<EntriesView locale="en" data={entriesData({ category: "WATER" })} />);
    await userEvent.click(screen.getByRole("button", { name: /^Income/ }));
    expect(push).toHaveBeenCalledWith("/en/entries?period=2026-10&type=INCOME&category=ALL", { scroll: false });
  });

  it("shows chips only for categories used in this tab", () => {
    render(<EntriesView locale="en" data={entriesData()} />);
    const chips = within(screen.getByRole("group", { name: "Category" })).getAllByRole("button").map((b) => b.textContent);
    expect(chips).toEqual(["All", "Electricity", "Water"]);
  });

  it("marks voided, corrected and attached rows and totals without the void", () => {
    render(<EntriesView locale="en" data={entriesData()} />);
    const rows = within(screen.getByRole("list", { name: "Entries" })).getAllByRole("button");
    expect(rows[0]).toHaveAttribute("data-void", "true");
    expect(rows[0]).toHaveTextContent("Void");
    expect(rows[1]).toHaveTextContent("Corrected");
    expect(within(rows[1]).getByLabelText("2 files attached")).toBeInTheDocument();
    expect(screen.getByText("Total · Expense").parentElement).toHaveTextContent("৳9,900");
  });

  it("labels the footer by category", () => {
    render(<EntriesView locale="en" data={entriesData({ category: "WATER", totalPaisa: 360000 })} />);
    expect(screen.getByText("Total · Water")).toBeInTheDocument();
  });

  it("gives admins Generate rent / Income / Expense in an Open month", () => {
    render(<EntriesView locale="en" data={entriesData()} />);
    expect(screen.getAllByRole("button", { name: /Generate rent/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Add expense|Expense$/ }).length).toBeGreaterThan(0);
  });

  it("is read-only for owners", () => {
    render(<EntriesView locale="en" data={entriesData({ perms: ownerPerms })} />);
    expect(screen.queryByRole("button", { name: /Generate rent/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add expense/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add income/ })).toBeNull();
  });

  it("locks a Closed month with the banner and no create buttons", () => {
    render(<EntriesView locale="en" data={entriesData({ month: "2026-09", status: "CLOSED" })} />);
    expect(screen.getByText(/September 2026 is closed and locked/)).toBeInTheDocument();
    expect(screen.getByText(/reopen it from Distribution/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate rent/ })).toBeNull();
  });

  it("hides the reopen hint from owners", () => {
    render(<EntriesView locale="en" data={entriesData({ month: "2026-09", status: "CLOSED", perms: ownerPerms })} />);
    expect(screen.queryByText(/reopen it from Distribution/)).toBeNull();
  });

  it("shows the empty states per tab", () => {
    const { unmount } = render(<EntriesView locale="en" data={entriesData({ type: "INCOME", items: [], chips: [] })} />);
    expect(screen.getByText("No income added for October 2026 yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate this month's rent" })).toBeInTheDocument();
    unmount();
    render(<EntriesView locale="en" data={entriesData({ items: [], chips: [] })} />);
    expect(screen.getByText("No expenses recorded for October 2026 yet.")).toBeInTheDocument();
  });

  it("renders Bangla month and digits", () => {
    render(<EntriesView locale="bn" data={entriesData()} />);
    expect(screen.getAllByText("অক্টোবর ২০২৬").length).toBeGreaterThan(0);
    expect(screen.getByText("মোট · ব্যয়").parentElement).toHaveTextContent("৳৯,৯০০");
  });

  it("links the month picker to neighbouring periods", () => {
    render(<EntriesView locale="en" data={entriesData()} />);
    expect(screen.getByRole("link", { name: "Previous month" })).toHaveAttribute("href", "/en/entries?period=2026-09&type=EXPENSE&category=ALL");
    expect(screen.getByRole("link", { name: "Next month" })).toHaveAttribute("href", "/en/entries?period=2026-11&type=EXPENSE&category=ALL");
  });
});
