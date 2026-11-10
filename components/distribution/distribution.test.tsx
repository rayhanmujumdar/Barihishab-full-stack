import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api/client";
import { DistributionView } from "./DistributionView";
import { ADMIN, closedOctober, october, OWNER, preview } from "./fixtures";
import { stubImageLoading } from "@/tests/helpers/image";
import type { DistPerms, DistributionResult } from "./types";

const refresh = vi.fn();
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push, refresh }), usePathname: () => "/en/distribution" }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), fieldErrors: () => ({}) }));
const toast = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign((...a: unknown[]) => toast(...a), { error: vi.fn(), warning: vi.fn() }) }));
const api = vi.mocked(apiFetch);

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;
const show = (data: DistributionResult, perms: DistPerms = ADMIN, locale: "en" | "bn" = "en") =>
  render(<DistributionView locale={locale} data={data} perms={perms} funds={[{ id: "f1", name: "Cash", isActive: true, balancePaisa: 5000000 }]} houseFundPaisa={5000000} />, { wrapper });
const table = () => screen.getByRole("table");

beforeEach(() => {
  api.mockReset();
  toast.mockReset();
  refresh.mockReset();
  push.mockReset();
});

describe("header and staircase (F1, F2)", () => {
  it("shows the open month as a live preview with the October staircase", () => {
    show(october());
    expect(screen.getByRole("heading", { level: 1, name: "Distribution" })).toBeInTheDocument();
    expect(screen.getByText("Draft — not closed yet")).toBeInTheDocument();
    expect(screen.getByText("Live preview — entitlements post when you close the month.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Income ৳1,03,000/ })).toHaveAttribute("href", "/en/entries?period=2026-10&type=INCOME");
    expect(screen.getByRole("link", { name: /^Expense ৳13,980/ })).toHaveAttribute("href", "/en/entries?period=2026-10&type=EXPENSE");
    expect(screen.getByRole("button", { name: /^Reserve ৳4,451/ })).toHaveTextContent("5% of ৳89,020");
    expect(screen.getByTestId("distributable")).toHaveTextContent("৳84,569");
  });

  it("shows closed-by, the reopen count, history and the before → after table", async () => {
    show(
      closedOctober({
        month: { ...closedOctober().month, reopenCount: 1 },
        reopens: [{ at: "2026-11-03T05:00:00.000Z", by: "Rayhan Ahmed", reason: "Plumber bill was missed" }],
        changes: { lines: [{ key: "expensePaisa", beforePaisa: 1398000, afterPaisa: 1898000, diffPaisa: 500000 }], owners: [{ ownerId: "o-n", displayName: "Nasrin Ahmed", beforePaisa: 3382760, afterPaisa: 3192760, diffPaisa: -190000 }] },
      }),
    );
    expect(screen.getByText("Closed by Rayhan Ahmed on 2 Nov 2026 · reopened 1×")).toBeInTheDocument();
    expect(screen.getByText("Reopened 3 Nov 2026 by Rayhan Ahmed · Plumber bill was missed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "See changes" }));
    const changes = screen.getAllByRole("table")[0];
    expect(within(changes).getByRole("row", { name: /Expense/ })).toHaveTextContent("৳13,980৳18,980+৳5,000");
    expect(within(changes).getByRole("row", { name: /Nasrin/ })).toHaveTextContent("−৳1,900");
  });

  it("shows the deficit, reserve-paid and override notes only when they apply", () => {
    const { unmount } = show(october());
    expect(screen.queryByText(/deficit of/)).toBeNull();
    unmount();
    show(
      october({
        staircase: { ...october().staircase, reserveSpentPaisa: 300000, deficitCarriedPaisa: 4578000, distributablePaisa: 0, reserveSource: "OVERRIDE", reservePaisa: 1000000 },
        reserve: { ...october().reserve, overridePaisa: 1000000, overrideReason: "Pump next month" },
      }),
    );
    expect(screen.getByText("Expenses exceeded income — a deficit of ৳45,780 carries into next month.")).toBeInTheDocument();
    expect(screen.getByText("৳3,000 was paid from the Reserve, so it is not counted as an expense here.")).toBeInTheDocument();
    expect(screen.getByText("Reserve set to ৳10,000 for this month · Pump next month")).toBeInTheDocument();
  });

  it("links the previous deficit to the month it came from", () => {
    show(october({ staircase: { ...october().staircase, previousDeficitPaisa: 4578000 } }));
    expect(screen.getByRole("link", { name: /Previous deficit/ })).toHaveAttribute("href", "/en/distribution?month=2026-09");
  });

  it("navigates months through the URL", async () => {
    show(october());
    expect(screen.getByRole("link", { name: "Previous month" })).toHaveAttribute("href", "/en/distribution?month=2026-09");
    expect(screen.getByRole("link", { name: "Next month" })).toHaveAttribute("href", "/en/distribution?month=2026-11");
    await userEvent.selectOptions(screen.getByLabelText("Go to month"), "2026-09");
    expect(push).toHaveBeenCalledWith("/en/distribution?month=2026-09");
  });
});

describe("owner board and footer (F3, F4)", () => {
  it("shows preview columns, after close, the You tag and totals", () => {
    show(october());
    const t = table();
    expect(within(t).getByRole("columnheader", { name: "Entitlement (preview)" })).toBeInTheDocument();
    expect(within(t).getByRole("columnheader", { name: "Balance now" })).toBeInTheDocument();
    expect(within(t).queryByRole("columnheader", { name: /Other/ })).toBeNull();
    const farzana = within(t).getByRole("row", { name: /Farzana Haque/ });
    expect(farzana).toHaveTextContent("You");
    expect(farzana).toHaveTextContent("৳8,456.90");
    expect(farzana).toHaveTextContent("after close ৳17,160.80");
    expect(within(farzana).getByRole("link", { name: /Farzana Haque/ })).toHaveAttribute("href", "/en/owners/o-f?from=2026-10&to=2026-10");
    const tanvir = within(t).getByRole("row", { name: /Tanvir Ahmed/ });
    expect(tanvir).toHaveTextContent("৳8,055.85 · Owed");
    expect(tanvir).toHaveTextContent("৳5,000");
    expect(within(t).getByRole("row", { name: /^Total/ })).toHaveTextContent("৳84,569");
  });

  it("shows the Other column with its tip only when not zero, and the closed headings", () => {
    const c = closedOctober();
    show({ ...c, rows: c.rows.map((r, i) => (i === 0 ? { ...r, otherPaisa: 2000 } : r)), totals: { ...c.totals, otherPaisa: 2000 } });
    expect(within(table()).getByRole("columnheader", { name: /Other/ })).toBeInTheDocument();
    expect(within(table()).getByRole("columnheader", { name: "Entitlement" })).toBeInTheDocument();
    expect(within(table()).getByRole("columnheader", { name: "Balance" })).toBeInTheDocument();
  });

  it("renders mobile cards with the same numbers", () => {
    show(october());
    const cards = screen.getByRole("list", { name: "Every owner's share" });
    const tanvir = within(cards).getAllByRole("listitem").find((li) => li.textContent?.includes("Tanvir Ahmed"))!;
    expect(tanvir).toHaveTextContent("৳12,685.35");
    expect(tanvir).toHaveTextContent("after close ৳15,741.20");
    expect(within(tanvir).getByRole("button", { name: "Pay ৳8,055.85" })).toBeInTheDocument();
  });

  it("states the accuracy footer, or a red warning when it doesn't add up", () => {
    const { unmount } = show(october());
    expect(screen.getByText("Σ entitlements ৳84,569 = distributable ৳84,569")).toBeInTheDocument();
    expect(screen.getByText("Shares used · Nasrin 40 · Rayhan 25 · Tanvir 15 · Farzana 10 · Sabrina 10")).toBeInTheDocument();
    expect(screen.getByText("Rounding · largest remainder, in paisa")).toBeInTheDocument();
    unmount();
    show(october({ footer: { ...october().footer, balanced: false, sumEntitlementsPaisa: 1 } }));
    expect(screen.getByRole("alert")).toHaveTextContent("Entitlements don't add up to the distributable");
  });

  it("speaks Bangla", () => {
    show(october(), OWNER, "bn");
    expect(screen.getByRole("heading", { level: 1, name: "বণ্টন" })).toBeInTheDocument();
    expect(screen.getByTestId("distributable")).toHaveTextContent("৳৮৪,৫৬৯");
  });
});

describe("role-aware actions (§4)", () => {
  it("gives an Owner no Close, Reopen, override or Pay controls", async () => {
    show(october(), OWNER);
    expect(screen.queryByRole("button", { name: /Close month/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pay/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Reserve/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Reserve balance now ৳0");
    expect(screen.queryByLabelText(/^Amount/)).toBeNull();
  });

  it("replaces Close with a link to the month that must close first", () => {
    show(october({ month: { ...october().month, key: "2026-11", mustCloseFirst: "2026-10" } }));
    expect(screen.queryByRole("button", { name: /Close month/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Close October 2026 first — months close in order." })).toHaveAttribute("href", "/en/distribution?month=2026-10");
  });

  it("offers Reopen only on the latest closed month", () => {
    const { unmount } = show(closedOctober());
    expect(screen.getByRole("button", { name: /Reopen/ })).toBeInTheDocument();
    unmount();
    show(closedOctober({ month: { ...closedOctober().month, isLatestClosed: false } }));
    expect(screen.queryByRole("button", { name: /Reopen/ })).toBeNull();
    expect(screen.getByText(/Only the latest closed month can be reopened/)).toBeInTheDocument();
  });

  it("shows empty states", () => {
    const { unmount } = show({ month: null });
    expect(screen.getByText("Your first month opens when setup is finished.")).toBeInTheDocument();
    unmount();
    show(october({ rows: [] }));
    expect(screen.getByText("No owners have shares for October 2026.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set shares" })).toHaveAttribute("href", "/en/owners");
  });
});

describe("Close month dialog (F5, G2, G12)", () => {
  it("lists checks, warnings and what happens, then closes with the version", async () => {
    api.mockImplementation(async (path: string) =>
      path.endsWith("close-preview") ? { ok: true, status: 200, data: preview({ reopenCount: 2 }) } : { ok: true, status: 200, data: closedOctober() },
    );
    show(october());
    await userEvent.click(screen.getByRole("button", { name: /Close month/ }));
    const dialog = await screen.findByRole("dialog", { name: "Close month · October 2026" });
    await waitFor(() => expect(dialog).toHaveTextContent("Shares add up to 100% · 5 owners"));
    expect(dialog).toHaveTextContent("September 2026 is closed");
    // Status is spoken, not only shown by icon colour.
    expect(within(dialog).getAllByText("Passed:", { exact: false })).toHaveLength(4);
    expect(within(dialog).getByText("Warning:", { exact: false })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("1 unit(s) unpaid: Flat 3A (Nusrat Jahan)");
    expect(dialog).toHaveTextContent("5 entitlement entries totalling ৳84,569");
    expect(dialog).toHaveTextContent("Loan instalment ৳5,000 deducted from Tanvir Ahmed");
    expect(dialog).toHaveTextContent("October 2026 locks — later fixes need a reopen or an Adjustment");
    await userEvent.click(within(dialog).getByRole("button", { name: /Close & lock/ }));
    expect(api).toHaveBeenCalledWith("/periods/2026-10/close", { method: "POST", body: { reopenCount: 2 } });
    expect(toast).toHaveBeenCalledWith("October 2026 closed · entitlements posted");
    expect(replace).toHaveBeenCalledWith("/en/distribution?month=2026-10");
    expect(refresh).toHaveBeenCalled();
  });

  it("disables Close & lock when a must-pass check fails", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: preview({ canClose: false, mustPass: [{ code: "SHARES", ok: false }] }) });
    show(october());
    await userEvent.click(screen.getByRole("button", { name: /Close month/ }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toHaveTextContent("No shares set for October 2026. Set shares in Owners first."));
    expect(within(dialog).getByRole("button", { name: /Close & lock/ })).toBeDisabled();
  });

  it("names who closed it first", async () => {
    api.mockImplementation(async (path: string) =>
      path.endsWith("close-preview")
        ? { ok: true, status: 200, data: preview() }
        : { ok: false, status: 409, error: { code: "PERIOD_ALREADY_CLOSED", message: "x", details: { month: "2026-10", closedBy: "Nasrin Ahmed" } } },
    );
    show(october());
    await userEvent.click(screen.getByRole("button", { name: /Close month/ }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /Close & lock/ })).toBeEnabled());
    await userEvent.click(within(dialog).getByRole("button", { name: /Close & lock/ }));
    expect(await within(dialog).findByText("October 2026 was just closed by Nasrin Ahmed.")).toBeInTheDocument();
  });

  it("shows the changes since the last close", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: preview({ changes: { lines: [{ key: "distributablePaisa", beforePaisa: 8456900, afterPaisa: 7981900, diffPaisa: -475000 }], owners: [] } }) });
    show(october());
    await userEvent.click(screen.getByRole("button", { name: /Close month/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Changes since last close")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("−৳4,750");
  });
});

describe("Reopen and reserve dialogs (F7, F9)", () => {
  it("needs a reason and lists payouts made after the close", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: october() });
    show(closedOctober({ paidAfterClose: { items: [{ ownerId: "o-f", displayName: "Farzana Haque", type: "PAYOUT", amountPaisa: 845690, date: "2026-11-02" }], totalPaisa: 845690 } }));
    await userEvent.click(screen.getByRole("button", { name: /Reopen/ }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Reopen October 2026?");
    expect(dialog).toHaveTextContent("All 5 entitlement entries and any loan deductions are reversed.");
    expect(dialog).toHaveTextContent("৳8,456.90 was paid out after October 2026 closed.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reopen month" }));
    expect(api).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent("Please write a reason — everyone can see it.");
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), "Plumber bill was missed");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reopen month" }));
    expect(api).toHaveBeenCalledWith("/periods/2026-10/reopen", { method: "POST", body: { reason: "Plumber bill was missed" } });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("October 2026 reopened · entitlements reversed · owners notified"));
  });

  it("overrides and resets the reserve for an open month", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: {} });
    const { unmount } = show(october());
    await userEvent.click(screen.getByRole("button", { name: /^Reserve/ }));
    let dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/^Amount/), "10000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save reserve" }));
    expect(dialog).toHaveTextContent("Please write a reason — everyone can see it.");
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), "Pump next month");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save reserve" }));
    expect(api).toHaveBeenCalledWith("/periods/2026-10/reserve", { method: "PUT", body: { amountPaisa: 1000000, reason: "Pump next month" } });
    unmount();
    api.mockClear();
    show(october({ reserve: { ...october().reserve, overridePaisa: 1000000, overrideReason: "Pump" }, staircase: { ...october().staircase, reserveSource: "OVERRIDE", reservePaisa: 1000000 } }));
    await userEvent.click(screen.getByRole("button", { name: /^Reserve/ }));
    dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reset to rule" }));
    expect(api).toHaveBeenCalledWith("/periods/2026-10/reserve", { method: "PUT", body: { amountPaisa: null } });
  });

  it("accepts 0.00 as a zero reserve override", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: {} });
    show(october());
    await userEvent.click(screen.getByRole("button", { name: /^Reserve/ }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/^Amount/), "0.00");
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), "No holdback this month");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save reserve" }));
    expect(api).toHaveBeenCalledWith("/periods/2026-10/reserve", { method: "PUT", body: { amountPaisa: 0, reason: "No holdback this month" } });
  });

  it("opens the pay drawer pre-filled from a row (F12)", async () => {
    show(october());
    await userEvent.click(within(table()).getByRole("button", { name: "Pay Tanvir Ahmed" }));
    const drawer = screen.getByRole("dialog", { name: "Pay Tanvir Ahmed" });
    expect(within(drawer).getByLabelText(/^Amount/)).toHaveValue("8055.85");
  });
});

describe("DistributionView owner photos", () => {
  it("shows the linked user's photo in the board table and cards, initials otherwise", async () => {
    stubImageLoading();
    const d = october();
    show({ ...d, rows: d.rows.map((r) => (r.ownerId === "o-r" ? { ...r, avatarUrl: "/api/v1/attachments/ray/file" } : r)) } as never);
    await waitFor(() => expect(document.querySelectorAll('img[src="/api/v1/attachments/ray/file"]').length).toBeGreaterThanOrEqual(1));
    expect(within(table()).queryByText("RA")).toBeNull();
    expect(within(table()).getByText("NA")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
