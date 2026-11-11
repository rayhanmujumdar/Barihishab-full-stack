import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseAnalysisReport } from "./ExpenseAnalysisReport";
import { emptyYear, fundsOct, october, rentRoll2026, repairs, september, year2026 } from "./fixtures";
import { FundsReport } from "./FundsReport";
import { MonthlyReport } from "./MonthlyReport";
import { MonthPicker, YearPicker } from "./Pickers";
import { RentRollReport } from "./RentRollReport";
import { ReportsHeader } from "./ReportsHeader";
import { YearlyReport } from "./YearlyReport";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/en/reports/monthly" }));

beforeEach(() => push.mockReset());

describe("ReportsHeader (F1)", () => {
  it("shows house, title, tabs with the current one marked, and the actions", () => {
    render(<ReportsHeader locale="en" tab="monthly" houseName="Ahmed Villa" actions={{ print: "/p", pdf: "/p?pdf=1", csv: "/c.csv" }} />);
    expect(screen.getByText("Ahmed Villa")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Reports" })).toBeInTheDocument();
    const tabs = within(screen.getByRole("navigation", { name: "Report type" })).getAllByRole("link");
    expect(tabs.map((a) => a.textContent)).toEqual(["Monthly", "Yearly", "Rent roll", "Expenses", "Fund accounts"]);
    expect(tabs[0]).toHaveAttribute("aria-current", "page");
    expect(tabs[1]).toHaveAttribute("href", "/en/reports/yearly");
    expect(screen.getByRole("link", { name: /Print/ })).toHaveAttribute("href", "/p");
    expect(screen.getByRole("link", { name: /PDF/ })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: /CSV/ })).toHaveAttribute("download");
  });

  it("leaves out actions a tab doesn't offer", () => {
    render(<ReportsHeader locale="en" tab="rent-roll" houseName="Ahmed Villa" />);
    expect(screen.queryByRole("link", { name: /CSV/ })).toBeNull();
  });
});

describe("Pickers (F1, G3)", () => {
  it("steps between months and marks drafts", async () => {
    render(<MonthPicker locale="en" tab="monthly" months={october.months} current="2026-10" />);
    expect(screen.getByRole("link", { name: "Previous month" })).toHaveAttribute("href", "/en/reports/monthly?month=2026-09");
    expect(screen.queryByRole("link", { name: "Next month" })).toBeNull();
    const select = screen.getByRole("combobox", { name: "Month" });
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["October 2026 · Draft", "September 2026 · Final"]);
    await userEvent.selectOptions(select, "2026-09");
    expect(push).toHaveBeenCalledWith("/en/reports/monthly?month=2026-09");
  });

  it("offers only years with data", async () => {
    render(<YearPicker locale="en" tab="yearly" years={[2026, 2025]} current={2026} />);
    const select = screen.getByRole("combobox", { name: "Year" });
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["2026", "2025"]);
    await userEvent.selectOptions(select, "2025");
    expect(push).toHaveBeenCalledWith("/en/reports/yearly?year=2025");
  });
});

describe("MonthlyReport (F2, F8, G1, G4, G5, G7, G13, G14)", () => {
  it("labels a draft and shows the summary, categories and staircase", () => {
    render(<MonthlyReport locale="en" data={october} />);
    expect(screen.getByRole("heading", { level: 2, name: "Monthly report · October 2026" })).toBeInTheDocument();
    expect(screen.getByText("Draft — not closed yet")).toBeInTheDocument();
    expect(screen.getByText("Income ৳1,03,000")).toBeInTheDocument();
    expect(screen.getByText("Distributable ৳84,569", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /House rent · 5 entries/ })).toBeInTheDocument();
    expect(screen.getByText("৳88,000 · 85%")).toBeInTheDocument();
    expect(screen.getByText("of which paid from Reserve ৳0")).toBeInTheDocument();
    expect(screen.getByTestId("rpt-distributable")).toHaveTextContent("৳84,569");
    expect(screen.getByRole("figure", { name: "Income by category" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Expenses (all) by category" })).toBeInTheDocument();
  });

  it("expands a category to its entries with bills and Reserve tags", async () => {
    render(<MonthlyReport locale="en" data={october} />);
    const elec = screen.getByRole("button", { name: /Electricity · 1 entry/ });
    expect(elec).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("DESCO bill")).toBeNull();
    await userEvent.click(elec);
    expect(elec).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("DESCO bill")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /desco\.pdf/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Cleaning & maintenance/ }));
    expect(within(screen.getByRole("table", { name: "Entries of Cleaning & maintenance" })).getByText("Reserve")).toBeInTheDocument();
  });

  it("compares with last month in words and flags big category changes", () => {
    render(<MonthlyReport locale="en" data={october} />);
    expect(screen.getByText("vs September 2026: ▼ down −৳22,000 (−17.6%)")).toBeInTheDocument();
    expect(screen.getByText("▲ ৳2,300 vs last month")).toBeInTheDocument();
    expect(screen.queryByText(/৳100 vs last month/)).toBeNull();
  });

  it("shows the owner table with totals, balance words, notes and statement links", () => {
    render(<MonthlyReport locale="en" data={october} />);
    const table = screen.getByRole("table", { name: "Owners" });
    expect(within(table).getByText("Advance outstanding", { exact: false })).toBeInTheDocument();
    expect(within(table).getByText("Settled")).toBeInTheDocument();
    const total = within(table).getByRole("row", { name: /^Total/ });
    expect(total).toHaveTextContent("৳67,655.20");
    expect(screen.getByText("1 unit(s) didn't pay rent: Flat 3A (Nusrat Jahan)")).toBeInTheDocument();
    const links = within(screen.getByRole("navigation", { name: "Owner statements" })).getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/en/owners/o-nasrin?from=2026-10&to=2026-10");
  });

  it("shows a final month with its close date, the reopen note and an empty state", () => {
    render(<MonthlyReport locale="en" data={september} />);
    expect(screen.getByText("Final · closed 3 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("No entries in September 2026.")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("September 2026 was reopened on 5 Oct 2026: Plumber bill was missed")).toBeInTheDocument();
  });

  it("speaks Bangla", () => {
    render(<MonthlyReport locale="bn" data={october} />);
    expect(screen.getByRole("heading", { level: 2, name: "মাসিক রিপোর্ট · অক্টোবর ২০২৬" })).toBeInTheDocument();
    expect(screen.getByText("আয় ৳১,০৩,০০০")).toBeInTheDocument();
  });

  it("lists every entry in an appendix when printed", () => {
    render(<MonthlyReport locale="en" data={october} mode="print" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    const appendix = screen.getByRole("table", { name: "Entries" });
    expect(within(appendix).getAllByRole("row")).toHaveLength(1 + 6);
    expect(within(appendix).getByText("DESCO bill")).toBeInTheDocument();
  });
});

describe("YearlyReport (F3, F4, G2, G8)", () => {
  it("counts closed and draft months and adds draft amounts beside totals", () => {
    render(<YearlyReport locale="en" data={year2026} />);
    expect(screen.getByRole("heading", { level: 2, name: "Yearly report · 2026" })).toBeInTheDocument();
    expect(screen.getByText("9 months closed, 1 draft")).toBeInTheDocument();
    expect(screen.getByText("+ ৳1,03,000 draft")).toBeInTheDocument();
    expect(screen.getByTestId("rpt-year-distributable")).toHaveTextContent("৳6,40,000");
  });

  it("links each chart month to its monthly report with a text label, drafts marked", () => {
    render(<YearlyReport locale="en" data={year2026} />);
    expect(screen.getByRole("figure", { name: "Income and expenses by month" })).toBeInTheDocument();
    const april = screen.getByRole("link", { name: "April 2026: income ৳1,25,000, expenses ৳1,70,780" });
    expect(april).toHaveAttribute("href", "/en/reports/monthly?month=2026-04");
    expect(screen.getByRole("link", { name: /October 2026: .* · Draft/ })).toHaveAttribute("data-draft", "true");
    expect(screen.queryByRole("link", { name: /November 2026/ })).toBeNull();
  });

  it("shows the month table with draft headers and the owner year table with share changes", () => {
    render(<YearlyReport locale="en" data={year2026} />);
    const months = screen.getByRole("table", { name: "Month by month" });
    expect(within(months).getByRole("columnheader", { name: /Oct.*Draft/ })).toBeInTheDocument();
    expect(within(months).getByRole("row", { name: /^Deficit carried/ })).toHaveTextContent("৳45,780");
    const owners = screen.getByRole("table", { name: "Owners · 2026" });
    expect(within(owners).getByText("changed in June 2026: 50% → 40%")).toBeInTheDocument();
    expect(screen.getByText("Repairs")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Nasrin Ahmed/ })).toHaveAttribute("href", "/en/owners/o-nasrin?from=2026-01&to=2026-12");
  });

  it("says when a year has no data", () => {
    render(<YearlyReport locale="en" data={emptyYear} />);
    expect(screen.getByText("No data for 2025 yet.")).toBeInTheDocument();
  });
});

describe("RentRollReport (F9)", () => {
  it("shows paid, arrear and empty cells with totals", () => {
    render(<RentRollReport locale="en" data={rentRoll2026} />);
    expect(screen.getByRole("figure", { name: "Rent collected vs expected by month" })).toBeInTheDocument();
    expect(screen.getByText("Rent collected")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Rent roll · 2026" });
    const flat3a = within(table).getByRole("row", { name: /^Flat 3A/ });
    expect(within(flat3a).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(table).getByText("Arrear in October 2026")).toBeInTheDocument();
    // September's late rent and October's own rent both open October's entries, where they were booked.
    const links = within(table).getAllByRole("link", { name: "৳18,000" });
    expect(links).toHaveLength(2);
    for (const a of links) expect(a).toHaveAttribute("href", "/en/entries?period=2026-10&type=INCOME");
    expect(within(table).getByRole("row", { name: /^Collected/ })).toHaveTextContent("50%");
  });
});

describe("ExpenseAnalysisReport (F10)", () => {
  it("shows totals, vendors and the biggest expenses", () => {
    render(<ExpenseAnalysisReport locale="en" data={repairs} />);
    expect(screen.getByRole("figure", { name: "Expenses by month" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Expenses (all) by category" })).toBeInTheDocument();
    expect(screen.getByTestId("rpt-exp-total")).toHaveTextContent("৳1,75,700");
    expect(screen.getByText("of which paid from Reserve ৳18,000")).toBeInTheDocument();
    expect(screen.getByText("No vendor")).toBeInTheDocument();
    expect(screen.getByText("Roof waterproofing")).toBeInTheDocument();
  });

  it("pushes the chosen range and categories to the URL, refusing more than 36 months", async () => {
    render(<ExpenseAnalysisReport locale="en" data={repairs} />);
    const from = screen.getByLabelText("From");
    fireEvent.change(from, { target: { value: "2020-01" } });
    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose 36 months or fewer.");
    expect(push).not.toHaveBeenCalled();
    fireEvent.change(from, { target: { value: "2026-03" } });
    await userEvent.click(screen.getByRole("checkbox", { name: "Electricity" }));
    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(push).toHaveBeenCalledWith("/en/reports/expenses?from=2026-03&to=2026-12&category=c-rep&category=c-elec");
  });
});

describe("FundsReport (F11)", () => {
  it("rolls each account with totals and month/year switch", () => {
    render(<FundsReport locale="en" data={fundsOct} />);
    expect(screen.getByRole("figure", { name: "Money in and out by account" })).toBeInTheDocument();
    expect(screen.getByText("Money in")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Fund accounts · October 2026" });
    const cash = within(table).getByRole("row", { name: /^Cash — with Rayhan/ });
    expect(cash).toHaveTextContent("−৳35,000");
    expect(cash).toHaveTextContent("৳49,020");
    expect(within(table).getByText("inactive", { exact: false })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /^Total/ })).toHaveTextContent("৳49,020");
    expect(screen.getByRole("link", { name: "Year" })).toHaveAttribute("href", "/en/reports/funds?year=2026");
    expect(screen.getByRole("link", { name: "Month" })).toHaveAttribute("aria-current", "page");
  });
});

