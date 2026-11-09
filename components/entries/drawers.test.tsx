import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { expectRequiredMarkersMatch } from "@/tests/helpers/required";
import { DetailDrawer, type Detail } from "./DetailDrawer";
import { EntryDrawer } from "./EntryDrawer";
import { entriesData, ids, ownerPerms, txn } from "./fixtures";
import { GenerateRentDialog } from "./GenerateRentDialog";

vi.mock("@/lib/api/client", async (orig) => ({ ...(await orig<typeof import("@/lib/api/client")>()), apiFetch: vi.fn() }));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/clock", async (orig) => ({ ...(await orig<typeof import("@/lib/clock")>()), todayIsoInDhaka: () => "2026-10-20" }));
const api = vi.mocked(apiFetch);

beforeEach(() => {
  api.mockReset();
  toast.mockReset();
  toast.warning.mockReset();
  localStorage.clear();
  api.mockImplementation(async (path: string) => {
    if (path.startsWith("/transactions/vendors")) return { ok: true, status: 200, data: { items: ["DESCO"] } };
    return { ok: true, status: 201, data: { transaction: txn(), warnings: [] } };
  });
});

const sent = (method: string) => api.mock.calls.filter(([, o]) => o?.method === method);

describe("EntryDrawer (S4)", () => {
  it("debounces vendor autocomplete: a typing burst queries only the final term", async () => {
    render(<EntryDrawer locale="en" data={entriesData()} mode={{ kind: "EXPENSE" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Payee / vendor"), "DES");
    await waitFor(() => expect(api).toHaveBeenCalledWith("/transactions/vendors?q=DES", undefined));
    const terms = api.mock.calls.map(([p]) => String(p)).filter((p) => p.startsWith("/transactions/vendors?q=") && p !== "/transactions/vendors?q=");
    expect(terms).toEqual(["/transactions/vendors?q=DES"]);
  });

  it("parses a Bangla amount and posts an expense with an Idempotency-Key", async () => {
    const onSaved = vi.fn();
    render(<EntryDrawer locale="bn" data={entriesData()} mode={{ kind: "EXPENSE" }} onClose={vi.fn()} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText("পরিমাণ (৳)"), "৬,৩০০");
    await userEvent.type(screen.getByLabelText("প্রাপক / বিক্রেতা"), "DESCO");
    await userEvent.click(screen.getByRole("button", { name: /ব্যয় সংরক্ষণ/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [path, opts] = sent("POST")[0];
    expect(path).toBe("/transactions");
    expect(opts!.body).toMatchObject({ kind: "EXPENSE", amountPaisa: 630000, categoryId: ids.elec, period: "2026-10", vendor: "DESCO", txnDate: "2026-10-20" });
    expect(opts!.headers!["Idempotency-Key"]).toBeTruthy();
    expect(toast).toHaveBeenCalledWith("অক্টোবর ২০২৬-এ ৳৬,৩০০ ব্যয় যোগ হয়েছে");
  });

  it("shows localized field errors linked with aria-describedby and sends nothing", async () => {
    render(<EntryDrawer locale="en" data={entriesData()} mode={{ kind: "EXPENSE" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Save expense/ }));
    const amount = screen.getByLabelText("Amount (৳)");
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(amount).toHaveAttribute("aria-describedby", "e-amount-error");
    expect(screen.getByText("Enter an amount greater than zero.")).toBeInTheDocument();
    expect(sent("POST")).toHaveLength(0);
  });

  it("requires a unit for rent and hides vendor / reserve on income", async () => {
    render(<EntryDrawer locale="en" data={entriesData()} mode={{ kind: "INCOME" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText("Payee / vendor")).toBeNull();
    expect(screen.queryByLabelText("Paid from the Reserve")).toBeNull();
    await userEvent.type(screen.getByLabelText("Amount (৳)"), "18000");
    await userEvent.click(screen.getByRole("button", { name: /Save income/ }));
    expect(screen.getByText("Pick the unit this rent is for.")).toBeInTheDocument();
  });

  it("shows the reference month for Arrear and offers no Owner grant", async () => {
    render(<EntryDrawer locale="en" data={entriesData()} mode={{ kind: "INCOME" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText("Reference month")).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Category"), ids.arrear);
    expect(screen.getByLabelText("Reference month")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Reference month")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Choose…", "September 2026"]);
    await userEvent.click(screen.getByRole("group", { name: "Type" }).querySelectorAll("button")[1]);
    expect(within(screen.getByLabelText("Category")).queryByRole("option", { name: "Owner special grant" })).toBeNull();
  });

  it("warns live when the fund would go negative or the date is far from the month", async () => {
    render(<EntryDrawer locale="en" data={entriesData({ month: "2026-11", status: "OPEN" })} mode={{ kind: "EXPENSE" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText("Fund account"), ids.cash);
    await userEvent.type(screen.getByLabelText("Amount (৳)"), "5000");
    expect(screen.getByTestId("entry-warnings")).toHaveTextContent("Cash would go to −৳3,000.");
  });

  it("correct mode hides the type, needs a reason and sends only changes", async () => {
    const onSaved = vi.fn();
    const entry = txn({ amountPaisa: 603000 });
    render(<EntryDrawer locale="en" data={entriesData()} mode={{ entry }} onClose={vi.fn()} onSaved={onSaved} />);
    expect(screen.queryByRole("group", { name: "Type" })).toBeNull();
    const amount = screen.getByLabelText("Amount (৳)");
    await userEvent.clear(amount);
    await userEvent.type(amount, "6300");
    await userEvent.click(screen.getByRole("button", { name: /Save correction/ }));
    expect(screen.getByText("Write a short reason — every owner can see it.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Why the correction/), "Typo — the bill reads ৳6,300");
    await userEvent.click(screen.getByRole("button", { name: /Save correction/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [path, opts] = sent("PATCH")[0];
    expect(path).toBe(`/transactions/${entry.id}`);
    expect(opts!.body).toEqual({ amountPaisa: 630000, reason: "Typo — the bill reads ৳6,300" });
  });

  it("correcting an adjustment keeps its reference month out of the patch", async () => {
    const onSaved = vi.fn();
    const adjExp = "00000000-0000-4000-8000-0000000000e9";
    const base = entriesData();
    const data = entriesData({
      categories: [...base.categories, { id: adjExp, kind: "EXPENSE", code: "ADJUSTMENT_EXP", nameEn: "Adjustment", nameBn: "সমন্বয়", isSystem: true, isActive: true, sortOrder: 120 }],
    });
    const entry = txn({
      categoryId: adjExp,
      category: { code: "ADJUSTMENT_EXP", nameEn: "Adjustment", nameBn: "সমন্বয়" },
      source: "ADJUSTMENT",
      referencePeriod: "2026-09",
      vendor: null,
      amountPaisa: 120000,
    });
    render(<EntryDrawer locale="en" data={data} mode={{ entry }} onClose={vi.fn()} onSaved={onSaved} />);
    expect(screen.getByLabelText("Reference month")).toHaveValue("2026-09");
    const amount = screen.getByLabelText("Amount (৳)");
    await userEvent.clear(amount);
    await userEvent.type(amount, "1500");
    await userEvent.type(screen.getByLabelText(/Why the correction/), "Bank statement shows ৳1,500");
    await userEvent.click(screen.getByRole("button", { name: /Save correction/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sent("PATCH")[0][1]!.body).toEqual({ amountPaisa: 150000, reason: "Bank statement shows ৳1,500" });
  });

  it("accepts tomorrow's date like the server does (time-zone slack)", async () => {
    const onSaved = vi.fn();
    const entry = txn({ txnDate: "2026-10-21" });
    render(<EntryDrawer locale="en" data={entriesData()} mode={{ entry }} onClose={vi.fn()} onSaved={onSaved} />);
    const amount = screen.getByLabelText("Amount (৳)");
    await userEvent.clear(amount);
    await userEvent.type(amount, "6400");
    await userEvent.type(screen.getByLabelText(/Why the correction/), "Bill re-checked today");
    await userEvent.click(screen.getByRole("button", { name: /Save correction/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByText("Date can't be in the future.")).toBeNull();
  });

  it("reuses one Idempotency-Key across retries and keeps the input on failure", async () => {
    api.mockImplementation(async (path: string) =>
      path.startsWith("/transactions/vendors") ? { ok: true, status: 200, data: { items: [] } } : { ok: false, status: 0, error: { code: "NETWORK", message: "Network error" } },
    );
    render(<EntryDrawer locale="en" data={entriesData()} mode={{ kind: "EXPENSE" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Amount (৳)"), "6300");
    await userEvent.click(screen.getByRole("button", { name: /Save expense/ }));
    await userEvent.click(screen.getByRole("button", { name: /Save expense/ }));
    const keys = sent("POST").map(([, o]) => o!.headers!["Idempotency-Key"]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(screen.getByLabelText("Amount (৳)")).toHaveValue("6300");
    expect(screen.getAllByRole("alert").some((a) => /try again/.test(a.textContent ?? ""))).toBe(true);
  });

  it("shows server warnings after saving", async () => {
    api.mockImplementation(async (path: string) =>
      path.startsWith("/transactions/vendors")
        ? { ok: true, status: 200, data: { items: [] } }
        : { ok: true, status: 201, data: { transaction: txn(), warnings: [{ code: "POSSIBLE_DUPLICATE" }] } },
    );
    render(<EntryDrawer locale="en" data={entriesData()} mode={{ kind: "EXPENSE" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Amount (৳)"), "6300");
    await userEvent.click(screen.getByRole("button", { name: /Save expense/ }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("matching entry")));
  });
});

const detail = (over: Partial<Detail> = {}): Detail => ({
  ...txn({ isCorrected: true }),
  recordedBy: "Rayhan",
  tenantName: null,
  attachments: [],
  history: [
    { action: "transaction.created", at: "2026-10-12T05:00:00.000Z", actorName: "Rayhan", before: null, after: null, reason: null },
    { action: "transaction.updated", at: "2026-10-21T05:00:00.000Z", actorName: "Rayhan", before: { amountPaisa: 603000 }, after: { amountPaisa: 630000 }, reason: "Typo — the DESCO bill reads ৳6,300" },
  ],
  ...over,
});

describe("DetailDrawer + Void dialog (DET-01, VOD-01)", () => {
  it("shows tags, hides empty rows and renders history before → after", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: detail() });
    render(<DetailDrawer locale="en" id="x" perms={entriesData().perms} onClose={vi.fn()} onChanged={vi.fn()} onCorrect={vi.fn()} />);
    expect(await screen.findByText("৳6,300", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Corrected", { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    expect(screen.queryByText("Unit")).toBeNull();
    expect(screen.getByText("Payee / vendor")).toBeInTheDocument();
    expect(screen.getByText("৳6,030 → ৳6,300")).toBeInTheDocument();
    expect(screen.getByText("“Typo — the DESCO bill reads ৳6,300”")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Correct" })).toBeInTheDocument();
  });

  it("offers no Correct / Void to owners, on Closed months or voided entries", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: detail() });
    const { unmount } = render(<DetailDrawer locale="en" id="x" perms={ownerPerms} onClose={vi.fn()} onChanged={vi.fn()} onCorrect={vi.fn()} />);
    await screen.findByText("Payee / vendor");
    expect(screen.queryByRole("button", { name: "Void" })).toBeNull();
    unmount();
    api.mockResolvedValue({ ok: true, status: 200, data: detail({ voidedAt: "2026-10-16T00:00:00.000Z", voidReason: "Duplicate entry" }) });
    render(<DetailDrawer locale="en" id="y" perms={entriesData().perms} onClose={vi.fn()} onChanged={vi.fn()} onCorrect={vi.fn()} />);
    expect(await screen.findByText("Void · Duplicate entry")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Correct" })).toBeNull();
  });

  describe("opening a bill (attachment-viewer)", () => {
    const pdf = { id: "00000000-0000-4000-8000-0000000000d1", fileName: "desco.pdf", mime: "application/pdf", sizeBytes: 900 };
    const photo = { id: "00000000-0000-4000-8000-0000000000d2", fileName: "receipt.jpg", mime: "image/jpeg", sizeBytes: 900 };

    it("views a receipt photo in the lightbox without leaving the drawer", async () => {
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      api.mockResolvedValue({ ok: true, status: 200, data: detail({ attachments: [photo, pdf] }) });
      render(<DetailDrawer locale="en" id="x" perms={entriesData().perms} onClose={vi.fn()} onChanged={vi.fn()} onCorrect={vi.fn()} />);
      const thumb = await screen.findByRole("button", { name: "Open receipt.jpg" });
      expect(thumb.querySelector("img")).toHaveAttribute("src", `/api/v1/attachments/${photo.id}/file`);
      await userEvent.click(thumb);
      const viewer = await screen.findByRole("dialog", { name: "Bills & receipts viewer" });
      expect(within(viewer).getByRole("img", { name: "receipt.jpg" })).toHaveAttribute("src", `/api/v1/attachments/${photo.id}/file`);
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bills & receipts viewer" })).toBeNull());
      expect(screen.getByText("Payee / vendor")).toBeInTheDocument(); // drawer still open
      expect(open).not.toHaveBeenCalled();
      // no signed-URL round trips: files load straight from the same-origin proxy
      expect(api.mock.calls.filter(([p]) => p.startsWith("/attachments/"))).toHaveLength(0);
      open.mockRestore();
    });

    it("opens a PDF from the app's origin in a new tab", async () => {
      api.mockResolvedValue({ ok: true, status: 200, data: detail({ attachments: [pdf] }) });
      render(<DetailDrawer locale="en" id="x" perms={entriesData().perms} onClose={vi.fn()} onChanged={vi.fn()} onCorrect={vi.fn()} />);
      const link = await screen.findByRole("link", { name: "Open desco.pdf (PDF, new tab)" });
      expect(link).toHaveAttribute("href", `/api/v1/attachments/${pdf.id}/file`);
      expect(link).toHaveAttribute("target", "_blank");
    });

    it("keeps the remove ✕ for admins on an open month", async () => {
      api.mockResolvedValue({ ok: true, status: 200, data: detail({ attachments: [photo] }) });
      render(<DetailDrawer locale="en" id="x" perms={entriesData().perms} onClose={vi.fn()} onChanged={vi.fn()} onCorrect={vi.fn()} />);
      expect(await screen.findByRole("button", { name: "Remove receipt.jpg" })).toBeInTheDocument();
    });
  });

  it("keeps Void entry disabled until the reason has 5 characters", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: detail() });
    render(<DetailDrawer locale="en" id="x" perms={entriesData().perms} onClose={vi.fn()} onChanged={vi.fn()} onCorrect={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Void" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Void this entry?" });
    expect(dialog).toHaveTextContent("stops counting in October 2026");
    const confirm = within(dialog).getByRole("button", { name: "Void entry" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Reason"), "dup");
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Reason"), "licate");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(sent("POST")[0]).toEqual(["/transactions/00000000-0000-4000-8000-000000000101/void", { method: "POST", body: { reason: "duplicate" } }]));
  });

  it("keeps focus inside the drawer after voiding (the Void button is gone)", async () => {
    api.mockImplementation(async (path: string, opts?: { method?: string }) =>
      opts?.method === "POST" ? { ok: true, status: 200, data: {} } : { ok: true, status: 200, data: detail(api.mock.calls.length > 1 ? { voidedAt: "2026-10-16T00:00:00.000Z", voidReason: "Duplicate entry" } : {}) },
    );
    render(<DetailDrawer locale="en" id="x" perms={entriesData().perms} onClose={vi.fn()} onChanged={vi.fn()} onCorrect={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Void" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.type(within(dialog).getByLabelText("Reason"), "Duplicate entry");
    await userEvent.click(within(dialog).getByRole("button", { name: "Void entry" }));
    await screen.findByText("Void · Duplicate entry");
    await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toHaveFocus());
  });
});

describe("GenerateRentDialog (INC-04)", () => {
  const preview = (rows: unknown[]) =>
    api.mockImplementation(async (path: string) =>
      path === "/transactions/generate-rent/preview"
        ? { ok: true, status: 200, data: { period: "2026-10", rows } }
        : { ok: true, status: 201, data: { created: 1, skipped: [{ unitId: "u2", unit: "Flat 1B" }], transactions: [] } },
    );
  const row = (unitId: string, unit: string, amountPaisa: number) => ({ unitId, unit, tenant: null, amountPaisa, fundAccountId: ids.bank, selected: true });

  it("totals ticked rows and saves them, reporting skipped units", async () => {
    preview([row("u1", "Flat 1A", 1800000), row("u2", "Flat 1B", 1800000), row("u3", "Flat 3A", 2200000)]);
    const onSaved = vi.fn();
    render(<GenerateRentDialog locale="en" data={entriesData()} onClose={vi.fn()} onSaved={onSaved} />);
    expect(await screen.findByTestId("rent-total")).toHaveTextContent("৳58,000");
    await userEvent.click(screen.getByRole("checkbox", { name: "Include Flat 3A" }));
    expect(screen.getByTestId("rent-total")).toHaveTextContent("৳36,000");
    await userEvent.click(screen.getByRole("button", { name: "Save rent entries" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, opts] = sent("POST").find(([p]) => p === "/transactions/generate-rent")!;
    expect((opts!.body as { rows: unknown[] }).rows).toHaveLength(2);
    expect(opts!.headers!["Idempotency-Key"]).toBeTruthy();
    expect(toast.warning).toHaveBeenCalledWith("Already paid, skipped: Flat 1B");
  });

  it("keeps Save disabled while the required date is cleared", async () => {
    preview([row("u1", "Flat 1A", 1800000)]);
    render(<GenerateRentDialog locale="en" data={entriesData()} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByTestId("rent-total");
    const save = screen.getByRole("button", { name: "Save rent entries" });
    expect(save).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: /^Date/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Clear date" }));
    expect(save).toBeDisabled();
    await userEvent.click(save);
    expect(sent("POST").filter(([path]) => path === "/transactions/generate-rent")).toHaveLength(0);
  });

  it("says when every unit already has rent", async () => {
    preview([]);
    render(<GenerateRentDialog locale="en" data={entriesData()} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByText("Every active unit already has rent recorded this month.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });
});

describe("required markers (form-required-indicator)", () => {
  const marked = (id: string) => document.querySelector(`label[for="${id}"]`)?.getAttribute("data-required") === "true";
  const dialog = () => screen.getByRole("dialog");
  const BASE = ["e-period", "e-category", "e-amount", "e-date", "e-fund"];

  it("new income with Rent marks the base fields and Unit, shows the legend", () => {
    render(<EntryDrawer locale="en" data={entriesData()} mode={{ kind: "INCOME" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    for (const id of [...BASE, "e-unit"]) expect(marked(id), id).toBe(true);
    expect(marked("e-description")).toBe(false);
    expect(screen.getByLabelText("Amount (৳)")).toBeRequired();
    expect(screen.getByRole("button", { name: /^Date/ }).getAttribute("aria-describedby")).toMatch(/^e-date-required/);
    expect(within(dialog()).getByText("* Required")).toBeInTheDocument();
    expectRequiredMarkersMatch(dialog());
  });

  it("non-rent income unmarks Unit; Arrear marks Reference month", async () => {
    render(<EntryDrawer locale="en" data={entriesData()} mode={{ kind: "INCOME" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText("Category"), ids.otherInc);
    expect(marked("e-unit")).toBe(false);
    expect(screen.getByLabelText("Unit")).not.toBeRequired();
    expectRequiredMarkersMatch(dialog());
    await userEvent.selectOptions(screen.getByLabelText("Category"), ids.arrear);
    expect(marked("e-unit") && marked("e-reference")).toBe(true);
    expectRequiredMarkersMatch(dialog());
  });

  it("expense marks the base five only", () => {
    render(<EntryDrawer locale="en" data={entriesData()} mode={{ kind: "EXPENSE" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    for (const id of BASE) expect(marked(id), id).toBe(true);
    for (const id of ["e-vendor", "e-description", "e-reserve"]) expect(marked(id), id).toBe(false);
    expectRequiredMarkersMatch(dialog());
  });

  it("correct mode marks the correction reason", () => {
    render(<EntryDrawer locale="en" data={entriesData()} mode={{ entry: txn() }} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(marked("e-reason")).toBe(true);
    expectRequiredMarkersMatch(dialog());
  });

  it("empty required amount still uses the inline error (form stays noValidate)", async () => {
    render(<EntryDrawer locale="en" data={entriesData()} mode={{ kind: "EXPENSE" }} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(dialog().querySelector("form")!.noValidate).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: /Save expense/ }));
    expect(screen.getByText("Enter an amount greater than zero.")).toBeInTheDocument();
  });

  it("void reason is marked", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: detail() });
    render(<DetailDrawer locale="en" id="x" perms={entriesData().perms} onClose={vi.fn()} onChanged={vi.fn()} onCorrect={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Void" }));
    const alert = await screen.findByRole("alertdialog", { name: "Void this entry?" });
    expect(marked("void-reason")).toBe(true);
    expectRequiredMarkersMatch(alert);
  });

  it("generate-rent date is marked; row inputs are not form fields", async () => {
    api.mockImplementation(async () => ({ ok: true, status: 200, data: { period: "2026-10", rows: [{ unitId: "u1", unit: "Flat 1A", tenant: null, amountPaisa: 1800000, fundAccountId: ids.bank, selected: true }] } }));
    render(<GenerateRentDialog locale="en" data={entriesData()} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByTestId("rent-total");
    expect(document.getElementById("rent-date-label")).toHaveAttribute("data-required", "true");
    expect(document.getElementById("rent-date-required")).toHaveTextContent("Required");
  });
});
