import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { OpeningDialog } from "./OpeningDialog";
import { OwnerFormDialog } from "./OwnerFormDialog";
import { owner } from "./fixtures";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), fieldErrors: () => ({}) }));
const toast = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign((...a: unknown[]) => toast(...a), { error: vi.fn(), warning: vi.fn() }) }));
const api = vi.mocked(apiFetch);

beforeEach(() => {
  api.mockReset();
  toast.mockReset();
});

describe("OwnerFormDialog — add (F7)", () => {
  it("links a user with the name prefilled, then offers Give shares now", async () => {
    const onGiveShares = vi.fn();
    render(<OwnerFormDialog locale="en" users={[{ id: "u-mitu", name: "Mitu Rahman" }]} onClose={vi.fn()} onSaved={vi.fn()} onGiveShares={onGiveShares} />);
    const dialog = screen.getByRole("dialog", { name: "Add owner" });
    await userEvent.selectOptions(within(dialog).getByLabelText(/^User/), "u-mitu");
    expect(within(dialog).getByLabelText(/Display name/)).toHaveValue("Mitu Rahman");
    api.mockResolvedValueOnce({ ok: true, status: 201, data: { owner: owner({ id: "o-new", displayName: "Mitu Rahman" }) } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save owner" }));
    expect(api).toHaveBeenCalledWith("/owners", { method: "POST", body: { userId: "u-mitu", displayName: "Mitu Rahman" } });
    await userEvent.click(await screen.findByRole("button", { name: "Give shares now" }));
    expect(onGiveShares).toHaveBeenCalled();
  });

  it("creates a name-only owner and requires the name", async () => {
    render(<OwnerFormDialog locale="en" users={[]} onClose={vi.fn()} onSaved={vi.fn()} onGiveShares={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Add owner" });
    await userEvent.click(within(dialog).getByRole("radio", { name: "Name only (no login)" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save owner" }));
    expect(within(dialog).getByText("Enter a name.")).toBeInTheDocument();
    api.mockResolvedValueOnce({ ok: true, status: 201, data: { owner: owner({ id: "o-estate" }) } });
    await userEvent.type(within(dialog).getByLabelText(/Display name/), "Estate of Karim Ahmed");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save owner" }));
    expect(api).toHaveBeenCalledWith("/owners", { method: "POST", body: { displayName: "Estate of Karim Ahmed" } });
  });
});

describe("OwnerFormDialog — edit (F8)", () => {
  it("labels the linked login with the user's own name", () => {
    render(<OwnerFormDialog locale="en" owner={{ ...owner({ displayName: "Estate of Nasrin" }), userName: "nasrin.ahmed" }} users={[]} onClose={vi.fn()} onSaved={vi.fn()} onGiveShares={vi.fn()} />);
    const select = within(screen.getByRole("dialog", { name: "Edit owner" })).getByLabelText(/Linked login/);
    expect(within(select).getByRole("option", { name: "nasrin.ahmed" })).toHaveValue("u-nasrin");
  });

  it("sends only changed fields, can unlink, and has no delete", async () => {
    const onSaved = vi.fn();
    render(<OwnerFormDialog locale="en" owner={owner()} users={[]} onClose={vi.fn()} onSaved={onSaved} onGiveShares={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Edit owner" });
    expect(within(dialog).queryByRole("button", { name: /Delete/ })).toBeNull();
    const name = within(dialog).getByLabelText(/Display name/);
    await userEvent.clear(name);
    await userEvent.type(name, "Estate of Nasrin Ahmed");
    await userEvent.selectOptions(within(dialog).getByLabelText(/Linked login/), "");
    api.mockResolvedValueOnce({ ok: true, status: 200, data: { owner: owner() } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save owner" }));
    expect(api).toHaveBeenCalledWith("/owners/o-nasrin", { method: "PATCH", body: { displayName: "Estate of Nasrin Ahmed", userId: null } });
    expect(onSaved).toHaveBeenCalled();
  });
});

describe("OpeningDialog (F10)", () => {
  it("sends a signed amount", async () => {
    const onSaved = vi.fn();
    render(<OpeningDialog locale="en" ownerId="o-1" onClose={vi.fn()} onSaved={onSaved} />);
    const dialog = screen.getByRole("dialog", { name: "Opening balance" });
    await userEvent.click(within(dialog).getByRole("radio", { name: "Advance outstanding (−)" }));
    await userEvent.type(within(dialog).getByLabelText(/Amount/), "৳৫,০০০");
    await userEvent.type(within(dialog).getByLabelText(/Note/), "From the 2025 notebook");
    api.mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save opening balance" }));
    expect(api).toHaveBeenCalledWith("/owners/o-1/opening", { method: "PUT", body: { amountPaisa: -500000, note: "From the 2025 notebook" } });
    expect(toast).toHaveBeenCalledWith("Opening balance saved");
    expect(onSaved).toHaveBeenCalled();
  });
});
