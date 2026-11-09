import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { ChangeSharesDialog } from "./ChangeSharesDialog";
import { owner, ownersData } from "./fixtures";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), fieldErrors: (r: { error?: { details?: { fields?: object } } }) => r.error?.details?.fields ?? {} }));
const toast = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign((...a: unknown[]) => toast(...a), { error: vi.fn(), warning: vi.fn() }) }));
const api = vi.mocked(apiFetch);

function setup() {
  const data = ownersData();
  data.list.owners = [...data.list.owners, owner({ id: "o-karim", displayName: "Karim Uddin", status: "new", units: 0, sharePercent: 0, balancePaisa: 0, balanceLabel: "SETTLED" })];
  const onSaved = vi.fn();
  render(<ChangeSharesDialog locale="en" data={data} onClose={vi.fn()} onSaved={onSaved} />);
  return { onSaved, dialog: screen.getByRole("dialog", { name: "Change shares" }) };
}

beforeEach(() => {
  api.mockReset();
  toast.mockReset();
});

describe("ChangeSharesDialog (F6)", () => {
  it("prefills units, updates the live % and total", async () => {
    const { dialog } = setup();
    expect(dialog).toHaveTextContent("A new version starts on the 1st of the chosen month.");
    const nasrin = within(dialog).getByLabelText("Units for Nasrin Ahmed");
    expect(nasrin).toHaveValue("40");
    expect(within(dialog).getByText("100 units = 100%")).toBeInTheDocument();
    await userEvent.clear(nasrin);
    await userEvent.type(nasrin, "60");
    expect(within(dialog).getByText("120 units = 100%")).toBeInTheDocument();
    expect(within(dialog).getByTestId("pct-o-nasrin")).toHaveTextContent("50%");
  });

  it("offers only open months and the next month", () => {
    const { dialog } = setup();
    const options = within(within(dialog).getByLabelText(/Effective from/)).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["October 2026", "November 2026"]);
  });

  it("requires a reason and a positive total, and a real change", async () => {
    const { dialog } = setup();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save share set" }));
    expect(within(dialog).getByText("Change at least one owner's units.")).toBeInTheDocument();
    for (const input of within(dialog).getAllByLabelText(/^Units for/)) await userEvent.clear(input);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save share set" }));
    expect(within(dialog).getByText("Total share units must be above zero.")).toBeInTheDocument();
    expect(within(dialog).getByText("A reason is required for every share change.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("adds an owner without units, confirms before → after, then saves", async () => {
    const { dialog, onSaved } = setup();
    await userEvent.selectOptions(within(dialog).getByLabelText("Add an owner to this share set"), "o-karim");
    const nasrin = within(dialog).getByLabelText("Units for Nasrin Ahmed");
    await userEvent.clear(nasrin);
    await userEvent.type(nasrin, "30");
    await userEvent.type(within(dialog).getByLabelText("Units for Karim Uddin"), "10");
    const sabrina = within(dialog).getByLabelText("Units for Sabrina Ahmed");
    await userEvent.clear(sabrina);
    await userEvent.type(sabrina, "0");
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), "Inheritance deed dated 12 March 2026");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save share set" }));

    const confirm = await screen.findByRole("alertdialog", { name: "Save this share set?" });
    expect(confirm).toHaveTextContent("Nasrin Ahmed40 → 30");
    expect(confirm).toHaveTextContent("Karim Uddin0 → 10");
    expect(confirm).toHaveTextContent("Sabrina Ahmed goes to 0 units and becomes a former owner from October 2026.");
    expect(confirm).toHaveTextContent("Closed months keep their old shares. October 2026 and later will use the new ones.");

    api.mockResolvedValueOnce({ ok: true, status: 201, data: { shareSet: { effectiveMonth: "2026-10" } } });
    await userEvent.click(within(confirm).getByRole("button", { name: "Save share set" }));
    expect(api).toHaveBeenCalledWith("/owners/shares", expect.objectContaining({ method: "POST", headers: { "Idempotency-Key": expect.any(String) } }));
    const body = api.mock.calls[0][1]!.body as { items: { ownerId: string; units: number }[]; effectiveMonth: string; reason: string };
    expect(body.effectiveMonth).toBe("2026-10");
    expect(body.items).toContainEqual({ ownerId: "o-karim", units: 10 });
    expect(body.items).toContainEqual({ ownerId: "o-sabrina", units: 0 });
    expect(toast).toHaveBeenCalledWith("Share set saved · effective October 2026");
    expect(onSaved).toHaveBeenCalled();
  });

  it("shows the server's closed-month message on the month field", async () => {
    const { dialog } = setup();
    const nasrin = within(dialog).getByLabelText("Units for Nasrin Ahmed");
    await userEvent.clear(nasrin);
    await userEvent.type(nasrin, "41");
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), "Fix");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save share set" }));
    api.mockResolvedValueOnce({ ok: false, status: 409, error: { code: "PERIOD_CLOSED", message: "closed", details: { fields: { effectiveMonth: "x" } } } });
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save share set" }));
    expect(await within(dialog).findByText("That month is closed. Pick an open month or a later one.")).toBeInTheDocument();
  });

  it("replays a retry with the same key but sends an edited save with a new one", async () => {
    const { dialog } = setup();
    const nasrin = within(dialog).getByLabelText("Units for Nasrin Ahmed");
    await userEvent.clear(nasrin);
    await userEvent.type(nasrin, "41");
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), "Fix");
    const submit = async () => {
      await userEvent.click(within(dialog).getByRole("button", { name: "Save share set" }));
      await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save share set" }));
    };
    api.mockResolvedValue({ ok: false, status: 0, error: { code: "NETWORK", message: "Network error" } });
    await submit();
    await submit();
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), " again");
    await submit();
    const keys = api.mock.calls.map((c) => (c[1]!.headers as Record<string, string>)["Idempotency-Key"]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
