import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerDetail } from "./OwnerDetail";
import { ownerPage, ownerPagePermsNone } from "./fixtures";
import { waitFor } from "@testing-library/react";
import { stubImageLoading } from "@/tests/helpers/image";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/en/owners/o-tanvir" }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), fieldErrors: () => ({}) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }) }));

beforeEach(() => replace.mockReset());

const strip = () => screen.getByRole("region", { name: "Summary" });

describe("OwnerDetail summary (F2)", () => {
  it("shows header, five figures and the share history", () => {
    render(<OwnerDetail locale="en" data={ownerPage()} />);
    expect(screen.getByRole("link", { name: /All owners/ })).toHaveAttribute("href", "/en/owners");
    expect(screen.getByRole("heading", { level: 1, name: "Tanvir Ahmed" })).toBeInTheDocument();
    expect(strip()).toHaveTextContent("Owed");
    expect(strip()).toHaveTextContent("৳8,055.85");
    expect(strip()).toHaveTextContent("15%");
    expect(strip()).toHaveTextContent("15 units");
    expect(strip()).toHaveTextContent("Entitlement 2026");
    expect(strip()).toHaveTextContent("Paid out 2026৳5,000");
    expect(strip()).toHaveTextContent("৳35,000");
    const history = screen.getByRole("region", { name: "Share history" });
    expect(history).toHaveTextContent("From January 2026 · 15 units · Initial shares");
    expect(history).toHaveTextContent("by Rayhan Ahmed");
  });

  it("switches the year through the URL", async () => {
    render(<OwnerDetail locale="en" data={ownerPage()} />);
    await userEvent.selectOptions(screen.getByLabelText("Year"), "2025");
    expect(replace).toHaveBeenCalledWith("/en/owners/o-tanvir?year=2025&from=2026-01&to=latest", { scroll: false });
  });
});

describe("Statement (F3)", () => {
  it("starts with Brought forward, ends with Closing balance, keeps voided rows", () => {
    render(<OwnerDetail locale="en" data={ownerPage()} />);
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Brought forward");
    expect(rows.at(-1)).toHaveTextContent("Closing balance");
    expect(rows.at(-1)).toHaveTextContent("৳8,055.85");
    expect(rows.at(-1)).toHaveTextContent("Owed");
    expect(rows[2]).toHaveAttribute("data-void", "true");
    expect(rows[2]).toHaveTextContent("Void");
    expect(screen.getByText(/Positive = the house owes this owner/)).toBeInTheDocument();
  });

  it("opens row details and links a reversal to its original", async () => {
    render(<OwnerDetail locale="en" data={ownerPage()} />);
    await userEvent.click(screen.getByRole("button", { name: /Details of Reversal/ }));
    const sheet = await screen.findByRole("dialog", { name: "Entry details" });
    expect(sheet).toHaveTextContent("Rayhan Ahmed");
    expect(sheet).toHaveTextContent("Cash box");
    expect(sheet).toHaveTextContent("bKash");
    await userEvent.click(within(sheet).getByRole("button", { name: "Show the original" }));
    expect(await screen.findByRole("dialog", { name: "Entry details" })).toHaveTextContent("Wrong owner");
  });

  it("shows a receipt photo in the lightbox over the row detail, and PDFs as same-origin links", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const data = ownerPage();
    const live = data.statement.rows.find((r) => r.id === "e-3")!;
    live.attachments = [
      { id: "att-photo", fileName: "bkash-receipt.jpg", mime: "image/jpeg" },
      { id: "att-pdf", fileName: "cheque.pdf", mime: "application/pdf" },
    ];
    render(<OwnerDetail locale="en" data={data} />);
    await userEvent.click(screen.getAllByRole("button", { name: /Details of Payout/ }).at(-1)!);
    const sheet = await screen.findByRole("dialog", { name: "Entry details" });
    expect(within(sheet).getByRole("link", { name: "Open cheque.pdf (PDF, new tab)" })).toHaveAttribute("href", "/api/v1/attachments/att-pdf/file");
    await userEvent.click(within(sheet).getByRole("button", { name: "bkash-receipt.jpg" }));
    const viewer = await screen.findByRole("dialog", { name: "Bills & receipts viewer" });
    expect(within(viewer).getByRole("img", { name: "bkash-receipt.jpg" })).toHaveAttribute("src", "/api/v1/attachments/att-photo/file");
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("changes the range through the URL and offers Latest", async () => {
    render(<OwnerDetail locale="en" data={ownerPage()} />);
    const to = screen.getByLabelText("To");
    expect(within(to).getAllByRole("option").map((o) => o.textContent)).toEqual(["Latest", "October 2026", "September 2026", "August 2026"]);
    await userEvent.selectOptions(screen.getByLabelText("From"), "2026-09");
    expect(replace).toHaveBeenCalledWith("/en/owners/o-tanvir?year=2026&from=2026-09&to=latest", { scroll: false });
  });

  it("links the PDF button to the print view for the range", () => {
    render(<OwnerDetail locale="en" data={ownerPage()} />);
    expect(screen.getByRole("link", { name: "PDF" })).toHaveAttribute("href", "/en/owners/o-tanvir/statement/print?from=2026-01&to=latest");
  });

  it("shows the empty-range message with brought forward and closing", () => {
    const data = ownerPage();
    data.statement = { ...data.statement, from: "2027-01", to: "2027-02", rows: [], broughtForwardPaisa: 805585, closingPaisa: 805585, totals: {} };
    render(<OwnerDetail locale="en" data={data} />);
    expect(screen.getByText("No entries between January 2027 and February 2027.")).toBeInTheDocument();
    expect(screen.getByText("Brought forward")).toBeInTheDocument();
    expect(screen.getByText("Closing balance")).toBeInTheDocument();
  });
});

describe("role-aware actions (§4)", () => {
  it("gives Super Admins Pay, Record advance, More and Void on live payouts", async () => {
    render(<OwnerDetail locale="en" data={ownerPage({ anyClosed: false })} />);
    expect(screen.getByRole("button", { name: "Pay" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Record advance" })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: /^Void Payout/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Balance adjustment" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit owner" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Opening balance" })).toBeInTheDocument();
  });

  it("hides Opening balance once a month is closed", async () => {
    render(<OwnerDetail locale="en" data={ownerPage({ anyClosed: true })} />);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await screen.findByRole("menuitem", { name: "Edit owner" });
    expect(screen.queryByRole("menuitem", { name: "Opening balance" })).toBeNull();
  });

  it("disables Pay and Record advance without an open month", () => {
    render(<OwnerDetail locale="en" data={ownerPage({ latestOpen: null })} />);
    expect(screen.getByRole("button", { name: "Pay" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Record advance" })).toBeDisabled();
    expect(screen.getByText("Open a month first")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Void Payout/ })).toBeNull();
  });

  it("shows Owners no admin controls", () => {
    render(<OwnerDetail locale="en" data={ownerPage({ perms: ownerPagePermsNone })} />);
    for (const name of ["Pay", "Record advance", "More actions"]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Void/ })).toBeNull();
  });
});

describe("OwnerDetail loans and instalment (Distribution F11)", () => {
  it("lists active loans and lets loan.manage set the instalment", async () => {
    const { apiFetch } = await import("@/lib/api/client");
    vi.mocked(apiFetch).mockResolvedValue({ ok: true, status: 200, data: {} });
    render(<OwnerDetail locale="en" data={ownerPage()} />);
    const loans = screen.getByRole("region", { name: "Loans" });
    expect(loans).toHaveTextContent("Outstanding ৳35,000");
    expect(loans).toHaveTextContent("Medical · Manual");
    expect(within(loans).getByRole("link", { name: "L2" })).toHaveAttribute("href", "/en/advances?tab=loans&loan=l-1");
    await userEvent.click(within(loans).getByRole("button", { name: "Set instalment" }));
    const dialog = screen.getByRole("dialog", { name: "Monthly instalment" });
    await userEvent.type(within(dialog).getByLabelText(/^Monthly instalment/), "40000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent("Enter a valid amount.");
    await userEvent.clear(within(dialog).getByLabelText(/^Monthly instalment/));
    await userEvent.type(within(dialog).getByLabelText(/^Monthly instalment/), "5000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent("A reason is required — every owner can see it.");
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), "Agreed at family meeting");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(apiFetch).toHaveBeenCalledWith("/loans/l-1", { method: "PATCH", body: { installmentPaisa: 500000, reason: "Agreed at family meeting" } });
  });

  it("shows loans read-only to Owners", () => {
    render(<OwnerDetail locale="en" data={ownerPage({ perms: ownerPagePermsNone })} />);
    expect(screen.getByRole("region", { name: "Loans" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set instalment" })).toBeNull();
    expect(screen.getByRole("link", { name: "L2" })).toBeInTheDocument();
  });
});

describe("OwnerDetail photo", () => {
  it("shows the linked user's photo in the header", async () => {
    stubImageLoading();
    const data = ownerPage();
    const { container } = render(<OwnerDetail locale="en" data={{ ...data, owner: { ...data.owner, avatarUrl: "/api/v1/attachments/t1/file" } }} />);
    await waitFor(() => expect(container.querySelector('img[src="/api/v1/attachments/t1/file"]')).not.toBeNull());
    vi.unstubAllGlobals();
  });
});
