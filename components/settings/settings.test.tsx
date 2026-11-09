import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { expectRequiredMarkersMatch } from "@/tests/helpers/required";
import { entriesData } from "@/components/entries/fixtures";
import { SettingsView } from "./SettingsView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", async (orig) => ({ ...(await orig<typeof import("@/lib/api/client")>()), apiFetch: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
const api = vi.mocked(apiFetch);

const base = entriesData();
const props = {
  locale: "en" as const,
  units: base.units,
  funds: base.funds,
  categories: base.categories,
  can: { units: true, funds: true, categories: true },
};

beforeEach(() => api.mockReset());

describe("SettingsView (MST-01..03)", () => {
  it("shows only the sections the user may manage", () => {
    render(<SettingsView {...props} can={{ units: false, funds: true, categories: false }} />);
    expect(screen.getByRole("heading", { name: "Fund accounts" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Units" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Expense categories" })).toBeNull();
  });

  it("tags system categories and gives them no edit or deactivate", () => {
    render(<SettingsView {...props} />);
    const rent = screen.getByRole("listitem", { name: "House rent" });
    expect(within(rent).getByText("System")).toBeInTheDocument();
    expect(within(rent).queryByRole("button")).toBeNull();
    const elec = screen.getByRole("listitem", { name: "Electricity" });
    expect(within(elec).getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
  });

  it("asks before deactivating and sends nothing on Cancel", async () => {
    render(<SettingsView {...props} />);
    await userEvent.click(within(screen.getByRole("listitem", { name: "Electricity" })).getByRole("button", { name: "Deactivate" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Deactivate Electricity?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api).not.toHaveBeenCalled();
  });

  it("shows FUND_NOT_EMPTY when a fund with money is deactivated", async () => {
    api.mockResolvedValue({ ok: false, status: 409, error: { code: "FUND_NOT_EMPTY", message: "x" } });
    render(<SettingsView {...props} />);
    await userEvent.click(within(screen.getByRole("listitem", { name: "Cash" })).getByRole("button", { name: "Deactivate" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(screen.getByText("Only an account with a zero balance can be deactivated.")).toBeInTheDocument());
    expect(api).toHaveBeenCalledWith(expect.stringMatching(/^\/fund-accounts\//), { method: "PATCH", body: { isActive: false } });
  });

  it("adds a unit with its rent in paisa", async () => {
    api.mockResolvedValue({ ok: true, status: 201, data: {} });
    render(<SettingsView {...props} />);
    await userEvent.click(within(screen.getByRole("region", { name: "Units" })).getByRole("button", { name: "Add" }));
    await userEvent.type(screen.getByLabelText("Name"), "Flat 2A");
    await userEvent.type(screen.getByLabelText("Tenant"), "Dr. Mahbub Alam");
    await userEvent.type(screen.getByLabelText("Monthly rent (৳)"), "20,000");
    await userEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/units", { method: "POST", body: { name: "Flat 2A", tenantName: "Dr. Mahbub Alam", rentPaisa: 2000000, defaultFundAccountId: null } }));
  });

  it("adds an expense category in both languages", async () => {
    api.mockResolvedValue({ ok: true, status: 201, data: {} });
    render(<SettingsView {...props} />);
    await userEvent.click(within(screen.getByRole("region", { name: "Expense categories" })).getByRole("button", { name: "Add" }));
    await userEvent.type(screen.getByLabelText("English name"), "Internet");
    await userEvent.type(screen.getByLabelText("Bangla name"), "ইন্টারনেট");
    await userEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/categories", { method: "POST", body: { kind: "EXPENSE", nameEn: "Internet", nameBn: "ইন্টারনেট" } }));
  });
});

describe("Settings drawers required markers (form-required-indicator)", () => {
  const marked = (id: string) => document.querySelector(`label[for="${id}"]`)?.getAttribute("data-required") === "true";
  const open = async (region: string) => {
    render(<SettingsView {...props} />);
    await userEvent.click(within(screen.getByRole("region", { name: region })).getByRole("button", { name: "Add" }));
    return screen.getByRole("dialog");
  };

  it("unit drawer marks only the name and shows the legend", async () => {
    const drawer = await open("Units");
    expect(marked("m-name")).toBe(true);
    for (const id of ["m-tenant", "m-rent", "m-fund"]) expect(marked(id), id).toBe(false);
    expect(within(drawer).getByText("* Required")).toBeInTheDocument();
    expectRequiredMarkersMatch(drawer);
  });

  it("fund drawer marks name, type and opening date, not the opening balance", async () => {
    const drawer = await open("Fund accounts");
    expect(marked("m-name") && marked("m-type")).toBe(true);
    expect(document.getElementById("m-opening-date-label")).toHaveAttribute("data-required", "true");
    expect(marked("m-opening")).toBe(false);
    expect(within(drawer).getByText("* Required")).toBeInTheDocument();
    expectRequiredMarkersMatch(drawer);
  });

  it("category drawer marks both names with no legend", async () => {
    const drawer = await open("Expense categories");
    expect(marked("m-name-en") && marked("m-name-bn")).toBe(true);
    expect(within(drawer).queryByText("* Required")).toBeNull();
    expectRequiredMarkersMatch(drawer);
  });
});
