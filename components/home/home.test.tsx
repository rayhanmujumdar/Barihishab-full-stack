import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BalanceHero, ThisMonth } from "./BalanceHero";
import { BlockBoundary } from "./BlockBoundary";
import { Desk } from "./Desk";
import { HomeHeader } from "./HomeHeader";
import { HouseThisMonth } from "./HouseThisMonth";
import { LatestActivity } from "./LatestActivity";
import { MyRequestStrip } from "./MyRequestStrip";
import { PinnedNotices } from "./PinnedNotices";
import { Reminders } from "./Reminders";
import { SetupChecklist } from "./SetupChecklist";
import { activity, closeReminder, desk, formData, house, me, mismatch, notices, october, OWNER_ID, overdueReminder, pendingRequest, rentReminder, setup } from "./fixtures";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }), usePathname: () => "/en" }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(async () => ({ ok: true, status: 200, data: { period: "2026-10", rows: [] } })), fieldErrors: () => ({}) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }) }));

// The drawers are next/dynamic imports; warm them so a cold transform under load can't time a test out.
beforeAll(async () => {
  await Promise.all([import("@/components/entries/EntryDrawer"), import("@/components/entries/GenerateRentDialog")]);
}, 30_000);

beforeEach(() => {
  refresh.mockReset();
  document.cookie = "bh_home_hidden=; max-age=0; path=/";
});

describe("HomeHeader (F1, G1)", () => {
  it("names the house and month, greets the viewer and offers the admin quick actions", () => {
    render(<HomeHeader locale="en" houseName="Ahmed Villa" month={october} name="Rayhan" quick={{ actions: { monthOpen: true, generateRent: true }, form: formData() }} />);
    expect(screen.getByText("Ahmed Villa · October 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Hello, Rayhan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate this month's rent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Income" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expense" })).toBeInTheDocument();
  });

  it("opens the expense drawer over Home", async () => {
    render(<HomeHeader locale="en" houseName="Ahmed Villa" month={october} name="Rayhan" quick={{ actions: { monthOpen: true, generateRent: false }, form: formData() }} />);
    expect(screen.queryByRole("button", { name: "Generate this month's rent" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Expense" }));
    expect(await screen.findByRole("dialog", { name: "New expense" }, { timeout: 5000 })).toBeInTheDocument();
  });

  it("shows no buttons to owners and 'No open month' to admins when none is open", () => {
    const { unmount } = render(<HomeHeader locale="en" houseName="Ahmed Villa" month={october} name="Nasrin" quick={null} />);
    expect(screen.queryByRole("button")).toBeNull();
    unmount();
    render(<HomeHeader locale="en" houseName="Ahmed Villa" month={{ ...october, open: false }} name="Rayhan" quick={{ actions: { monthOpen: false, generateRent: false }, form: formData() }} />);
    expect(screen.getByText("No open month — open one from Distribution.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Distribution/ })).toHaveAttribute("href", "/en/distribution");
    expect(screen.queryByRole("button", { name: "Expense" })).toBeNull();
  });

  it("tells owners there is no open month too (F12)", () => {
    render(<HomeHeader locale="en" houseName="Ahmed Villa" month={{ ...october, open: false }} name="Nasrin" quick={null} />);
    expect(screen.getByText("No open month.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Distribution/ })).toBeNull();
  });

  it("greets in Bangla", () => {
    render(<HomeHeader locale="bn" houseName="Ahmed Villa" month={october} name="নাসরিন" quick={null} />);
    expect(screen.getByRole("heading", { level: 1, name: "স্বাগতম, নাসরিন" })).toBeInTheDocument();
  });
});

describe("BalanceHero (F2, G14, Rule 3)", () => {
  it("shows an advance outstanding in red with its word, share and sentence", () => {
    render(<BalanceHero locale="en" me={me()} month={october} />);
    const amount = screen.getByTestId("hero-amount");
    expect(amount).toHaveTextContent("−৳5,000");
    expect(amount).toHaveClass("bal-neg");
    expect(screen.getByText("Advance outstanding")).toBeInTheDocument();
    expect(screen.getByText("Share 40%")).toBeInTheDocument();
    expect(screen.getByText("You have taken more than your entitlement. Your next entitlement fills this first.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /My statement/ })).toHaveAttribute("href", `/en/owners/${OWNER_ID}`);
  });

  it("shows settled in ink and owed in green", () => {
    const { unmount } = render(<BalanceHero locale="en" me={me({ balancePaisa: 0, balanceLabel: "SETTLED", sharePercent: 25 })} month={october} />);
    expect(screen.getByTestId("hero-amount")).toHaveTextContent("৳0");
    expect(screen.getByTestId("hero-amount")).toHaveClass("bal-zero");
    expect(screen.getByText("Nothing is owed either way.")).toBeInTheDocument();
    unmount();
    render(<BalanceHero locale="en" me={me({ balancePaisa: 805585, balanceLabel: "OWED" })} month={october} />);
    expect(screen.getByTestId("hero-amount")).toHaveClass("bal-pos");
    expect(screen.getByText("Owed")).toBeInTheDocument();
    expect(screen.getByText("The house owes you this. Pay-outs follow the month close.")).toBeInTheDocument();
  });

  it("adds the loan line and the first-month note", () => {
    render(<BalanceHero locale="en" me={me({ loan: { number: 2, outstandingPaisa: 3500000, nextDeductionPaisa: 500000, nextDeductionMonth: "2026-10" } })} month={{ ...october, firstMonth: true }} />);
    expect(screen.getByText("Loan L2: ৳35,000 left, next deduction ৳5,000 on October 2026 close.")).toBeInTheDocument();
    expect(screen.getByText("Your first entitlement arrives when October 2026 closes.")).toBeInTheDocument();
  });

  it("uses Bangla digits in বাংলা", () => {
    render(<BalanceHero locale="bn" me={me()} month={october} />);
    expect(screen.getByTestId("hero-amount")).toHaveTextContent("−৳৫,০০০");
    expect(screen.getByText("অগ্রিম বাকি")).toBeInTheDocument();
  });
});

describe("ThisMonth (F3, G3)", () => {
  it("lists entitlement preview, received, advances and loan, each linked", () => {
    render(<ThisMonth locale="en" me={me()} month={october} />);
    const rows = within(screen.getByRole("list", { name: "This month for me" })).getAllByRole("link");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Entitlement · October 2026 (preview)৳33,827.60",
      "Received this month৳34,815.60",
      "Advances this month৳5,000",
      "Loan outstandingNone",
    ]);
    expect(rows[0]).toHaveAttribute("href", "/en/distribution?month=2026-10");
    expect(rows[3]).toHaveAttribute("href", "/en/advances");
  });

  it("hides the advances row when there are none and says when there is no share", () => {
    render(<ThisMonth locale="en" me={me({ advancesPaisa: 0, sharePercent: null, entitlementPreviewPaisa: null })} month={october} />);
    expect(screen.queryByText("Advances this month")).toBeNull();
    expect(screen.getByText("You have no share this month.")).toBeInTheDocument();
  });
});

describe("MyRequestStrip (F4)", () => {
  it("tells the owner their pending request and links to it", () => {
    render(<MyRequestStrip locale="en" request={pendingRequest()} />);
    expect(screen.getByText("Your advance request for ৳10,000 is pending.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View request/ })).toHaveAttribute("href", "/en/requests?request=00000000-0000-4000-8000-0000000000r1");
  });

  it("mentions a lower approved amount, and shows a decided request once", () => {
    const { unmount } = render(<MyRequestStrip locale="en" request={pendingRequest({ status: "APPROVED", amountApprovedPaisa: 800000 })} />);
    expect(screen.getByText(/is approved · awaiting cash\./)).toBeInTheDocument();
    expect(screen.getByText("Approved ৳8,000")).toBeInTheDocument();
    unmount();
    render(<MyRequestStrip locale="en" request={pendingRequest({ status: "REJECTED", once: true })} />);
    expect(screen.getByText("Your request was rejected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View/ })).toBeInTheDocument();
  });
});

describe("Desk (F5, G8, G9)", () => {
  it("shows the fund, Balanced, pending in a yellow box, complaints and invites", () => {
    render(<Desk locale="en" desk={desk()} />);
    const region = screen.getByRole("region", { name: "Bookkeeper's desk" });
    expect(within(region).getByText("Super Admin only")).toBeInTheDocument();
    expect(within(region).getByTestId("fund-total")).toHaveTextContent("৳1,24,508.75");
    expect(within(region).getByText("Cash — with Rayhan")).toBeInTheDocument();
    expect(within(region).getByText("৳93,508.75")).toBeInTheDocument();
    expect(within(region).getByText("Balanced")).toHaveClass("bal-pos");
    expect(within(region).getByText("Fund matches the ledgers to the paisa")).toBeInTheDocument();
    expect(within(region).getByText("Fund = owner balances + reserve + open month − deficit − loans")).toBeInTheDocument();
    expect(within(region).getByTestId("pending-count")).toHaveAttribute("data-signal", "true");
    expect(within(region).getByTestId("complaints-count")).toHaveTextContent("2");
    expect(within(region).getByTestId("invites-count")).toHaveTextContent("2");
    expect(within(region).getByText("1 invite expired")).toHaveClass("bal-neg");
    expect(within(region).getByRole("link", { name: /Review queue/ })).toHaveAttribute("href", "/en/requests?tab=decide");
  });

  it("shows 0 pending without the yellow box", () => {
    render(<Desk locale="en" desk={desk({ pending: { count: 0, over3Days: 0 } })} />);
    expect(screen.getByTestId("pending-count")).toHaveAttribute("data-signal", "false");
  });

  it("flags a mismatch and breaks the formula down on See details", async () => {
    render(<Desk locale="en" desk={desk({ reconciliation: mismatch() })} />);
    expect(screen.getByText("Check")).toHaveClass("bal-neg");
    expect(screen.getByText("Mismatch of ৳2,000")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "See details" }));
    const dialog = await screen.findByRole("dialog", { name: "Reconciliation details" });
    const rows = within(dialog).getAllByRole("row").map((r) => r.textContent);
    expect(rows).toEqual([
      "House fund৳1,22,508.75",
      "+ Owner balances৳1,20,000",
      "+ Reserve৳4,451",
      "+ Open month net৳57.75",
      "− Deficit carried৳0",
      "− Loans outstanding৳0",
      "= What the ledgers say৳1,24,508.75",
      "Difference−৳2,000",
    ]);
  });
});

describe("Reminders (F6, Rule 9)", () => {
  it("renders each reminder with its text and one button", () => {
    render(<Reminders locale="en" reminders={[closeReminder(), rentReminder(), overdueReminder()]} rentForm={formData()} />);
    expect(screen.getByText("Close-the-month reminder. October 2026 is open.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review distribution/ })).toHaveAttribute("href", "/en/distribution?month=2026-10");
    expect(screen.getByText("1 unit hasn't paid rent: Flat 3A (Nusrat Jahan).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate rent" })).toBeInTheDocument();
    expect(screen.getByText("Nasrin Ahmed's ৳10,000 advance was due on 18 Oct 2026.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Disburse/ })).toHaveAttribute("href", "/en/requests?tab=approved&request=00000000-0000-4000-8000-0000000000r1");
  });

  it("hides a strip for today and remembers it in a cookie", async () => {
    render(<Reminders locale="en" reminders={[rentReminder()]} rentForm={formData()} />);
    await userEvent.click(screen.getByRole("button", { name: "Hide today" }));
    expect(screen.queryByText(/hasn't paid rent/)).toBeNull();
    expect(decodeURIComponent(document.cookie)).toMatch(/bh_home_hidden=RENT_STATUS@\d{4}-\d{2}-\d{2}/);
    // The server re-renders the block so a third reminder can take the freed slot.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("opens the Generate-rent dialog", async () => {
    render(<Reminders locale="en" reminders={[rentReminder()]} rentForm={formData()} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate rent" }));
    expect(await screen.findByRole("dialog", undefined, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe("HouseThisMonth (F7)", () => {
  it("shows the Distribution staircase with the Draft tag and links", () => {
    render(<HouseThisMonth locale="en" house={house()} month={october} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByTestId("home-distributable")).toHaveTextContent("৳84,569");
    expect(screen.getByRole("link", { name: /^Income/ })).toHaveAttribute("href", "/en/entries?period=2026-10&type=INCOME");
    expect(screen.getByRole("link", { name: /^Expense/ })).toHaveAttribute("href", "/en/entries?period=2026-10&type=EXPENSE");
    expect(screen.getByRole("link", { name: /Every owner's share/ })).toHaveAttribute("href", "/en/distribution?month=2026-10");
    expect(screen.queryByText(/short\./)).toBeNull();
  });

  it("warns when a deficit is building and drops Draft once closed", () => {
    render(<HouseThisMonth locale="en" house={house({ incomePaisa: 500000, expensePaisa: 800000, shortfallPaisa: 300000, draft: false })} month={{ ...october, open: false }} />);
    expect(screen.getByText("Expenses are higher than income so far — ৳3,000 short.")).toHaveClass("bal-neg");
    expect(screen.queryByText("Draft")).toBeNull();
  });
});

describe("LatestActivity (F8, G5)", () => {
  it("lists events with signed, coloured amounts and links", () => {
    render(<LatestActivity locale="en" items={activity()} month="2026-10" />);
    const rows = within(screen.getByRole("list", { name: "Latest activity" })).getAllByRole("link");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Cleaning & maintenance");
    expect(rows[0]).toHaveTextContent("Stairs, roof & drain cleaning");
    expect(rows[0]).toHaveTextContent("−৳3,000");
    expect(rows[0]).toHaveAttribute("href", "/en/entries?period=2026-10&type=EXPENSE&entry=00000000-0000-4000-8000-000000000a01");
    expect(rows[1]).toHaveTextContent("Advance · Nasrin Ahmed");
    expect(rows[1]).toHaveTextContent("Bank · TX4134");
    expect(rows[1]).toHaveAttribute("href", `/en/owners/${OWNER_ID}`);
    expect(within(rows[2]).getByText("+৳15,000")).toHaveClass("bal-pos");
    expect(screen.getByRole("link", { name: /See all/ })).toHaveAttribute("href", "/en/entries?period=2026-10");
  });

  it("has an empty state", () => {
    render(<LatestActivity locale="en" items={[]} month="2026-10" />);
    expect(screen.getByText("Nothing recorded yet this month.")).toBeInTheDocument();
  });
});

describe("PinnedNotices (F9, G6)", () => {
  it("shows urgent tags, unread dots and Read more", async () => {
    render(<PinnedNotices locale="en" notices={notices()} more />);
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Unread")).toHaveLength(1);
    expect(screen.getByText("Water tank cleaning")).toBeInTheDocument();
    const more = screen.getAllByRole("button", { name: "Read more" })[0];
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /All notices/ })).toBeInTheDocument();
  });

  it("has an empty state", () => {
    render(<PinnedNotices locale="en" notices={[]} more={false} />);
    expect(screen.getByText("No pinned notices.")).toBeInTheDocument();
  });
});

describe("SetupChecklist (F12)", () => {
  it("ticks done steps and links the rest", () => {
    render(<SetupChecklist locale="en" setup={setup()} />);
    const items = within(screen.getByRole("list", { name: "Finish setting up" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("House infoDone");
    expect(within(items[1]).getByRole("link", { name: /Continue/ })).toHaveAttribute("href", "/en/settings");
    expect(within(items[5]).getByRole("link", { name: /Continue/ })).toHaveAttribute("href", "/en/admin/users");
  });
});

describe("BlockBoundary (F11)", () => {
  function Boom(): never {
    throw new Error("db down");
  }

  it("shows the failed block's message and leaves its siblings alone", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <>
        <BlockBoundary locale="en" block="activity">
          <Boom />
        </BlockBoundary>
        <p>Staircase still here</p>
      </>,
    );
    expect(screen.getByText("Couldn't load Latest activity. Try again")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText("Staircase still here")).toBeInTheDocument();
  });
});

describe("HomeRefresh (F11, G13)", () => {
  it("refreshes after the tab was hidden 5 minutes and says so", async () => {
    const { HomeRefresh } = await import("./HomeRefresh");
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const hidden = vi.spyOn(document, "hidden", "get");
    render(<HomeRefresh locale="en" />);
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.setSystemTime(Date.now() + 4 * 60_000);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).not.toHaveBeenCalled();
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.setSystemTime(Date.now() + 6 * 60_000);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    expect(await screen.findByText("Updated just now")).toBeInTheDocument();
    hidden.mockRestore();
  });
});

describe("HomeRefresh pull-to-refresh (F11)", () => {
  const touch = (type: string, y: number) => {
    const e = new Event(type) as Event & { touches: { clientY: number }[]; changedTouches: { clientY: number }[] };
    e.touches = type === "touchend" ? [] : [{ clientY: y }];
    e.changedTouches = [{ clientY: y }];
    window.dispatchEvent(e);
  };

  it("refreshes on a long pull from the top", async () => {
    const { HomeRefresh } = await import("./HomeRefresh");
    render(<HomeRefresh locale="en" />);
    touch("touchstart", 100);
    touch("touchend", 130);
    expect(refresh).not.toHaveBeenCalled();
    touch("touchstart", 100);
    touch("touchend", 200);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores the gesture while a drawer or dialog is open over Home", async () => {
    const { HomeRefresh } = await import("./HomeRefresh");
    render(
      <>
        <HomeRefresh locale="en" />
        <div role="dialog" aria-label="New expense" />
      </>,
    );
    touch("touchstart", 100);
    touch("touchend", 220);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("BlockSkeleton (F11)", () => {
  it("announces which block is loading", async () => {
    const { BlockSkeleton } = await import("./BlockSkeleton");
    render(<BlockSkeleton locale="en" block="activity" />);
    expect(screen.getByRole("status", { name: "Loading Latest activity…" })).toHaveAttribute("aria-busy", "true");
  });
});
