import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { expectRequiredMarkersMatch } from "@/tests/helpers/required";
import type { PublicUser } from "@/lib/users/dto";
import { Toaster } from "@/components/ui/sonner";
import { stubImageLoading } from "@/tests/helpers/image";
import { uploadAvatar } from "./avatar-upload";
import { UsersManager } from "./UsersManager";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiFetch: vi.fn() };
});
const api = vi.mocked(apiFetch);
vi.mock("./avatar-upload", async () => {
  const actual = await vi.importActual<typeof import("./avatar-upload")>("./avatar-upload");
  return { ...actual, uploadAvatar: vi.fn() };
});
const upload = vi.mocked(uploadAvatar);

function user(p: Partial<PublicUser>): PublicUser {
  return {
    id: crypto.randomUUID(),
    username: "u",
    email: "u@example.com",
    name: "U",
    firstName: "U",
    lastName: null,
    surname: null,
    birthday: null,
    profession: null,
    phone: null,
    whatsapp: null,
    whatsappSameAsPhone: false,
    houseResponsibility: null,
    avatarUrl: null,
    locale: "en",
    emailNotices: true,
    status: "ACTIVE",
    roles: ["OWNER"],
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    ...p,
  };
}

const admin = user({ username: "boss", name: "Boss Admin", firstName: "Boss", roles: ["SUPER_ADMIN"] });
const invited = user({ username: "karim", name: "Karim", firstName: "Karim", status: "INVITED", houseResponsibility: "Electricity" });
const inactive = user({ username: "gone", name: "Gone", firstName: "Gone", status: "INACTIVE" });
const initial = { items: [admin, invited, inactive], nextCursor: null, activeSuperAdminCount: 1 };

beforeEach(() => api.mockReset());

function row(name: string) {
  return screen.getByRole("row", { name: new RegExp(name) });
}

describe("UsersManager (A6)", () => {
  it("debounces the search box: a typing burst sends one request for the final term", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: { items: [invited], nextCursor: null, activeSuperAdminCount: 1 } } as never);
    render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
    await userEvent.type(screen.getByRole("searchbox"), "kar");
    await waitFor(() => expect(api).toHaveBeenCalledWith("/users?q=kar", undefined));
    const searches = api.mock.calls.map(([path]) => path).filter((p) => String(p).includes("q="));
    expect(searches).toEqual(["/users?q=kar"]);
  });

  it("renders a row per user with status tags and responsibility", () => {
    render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
    expect(within(row("Karim")).getByText("Invited")).toBeInTheDocument();
    expect(within(row("Karim")).getByText("Electricity")).toBeInTheDocument();
    expect(within(row("Gone")).getByText("Inactive")).toBeInTheDocument();
    expect(within(row("Boss Admin")).getByText("Super Admin")).toBeInTheDocument();
  });

  it("offers Resend invite only for invited users", async () => {
    render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
    await userEvent.click(within(row("Karim")).getByRole("button", { name: /Actions for Karim/ }));
    expect(screen.getByRole("menuitem", { name: "Resend invite" })).toBeInTheDocument();
    await userEvent.click(within(row("Gone")).getByRole("button", { name: /Actions for Gone/ }));
    expect(screen.queryByRole("menuitem", { name: "Resend invite" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Reactivate" })).toBeInTheDocument();
  });

  it("disables deactivate for the last active Super Admin with an explanation", async () => {
    render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
    await userEvent.click(within(row("Boss Admin")).getByRole("button", { name: /Actions for Boss Admin/ }));
    const item = screen.getByRole("menuitem", { name: "Deactivate" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAttribute("title", "The last active Super Admin can't be deactivated or demoted.");
  });

  it("disables the role select in the edit drawer for the last active Super Admin", async () => {
    render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
    await userEvent.click(within(row("Boss Admin")).getByRole("button", { name: /Actions for Boss Admin/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    const role = screen.getByLabelText(/System role/);
    expect(role).toBeDisabled();
    expect(screen.getAllByText("The last active Super Admin can't be deactivated or demoted.").length).toBeGreaterThan(0);
  });

  it("picks a birthday from the calendar popover inside the edit drawer and saves it", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: { user: { ...admin, birthday: "1990-03-20" } } } as never);
    render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
    await userEvent.click(within(row("Boss Admin")).getByRole("button", { name: /Actions for Boss Admin/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    // userEvent refuses to click through `pointer-events: none`, so this also proves
    // the popover stays interactive above the modal Sheet.
    await userEvent.click(screen.getByRole("button", { name: /^Birthday/ }));
    const grid = await screen.findByRole("grid");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /year/i }), "1990");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /month/i }), "2");
    await userEvent.click(within(await screen.findByRole("grid")).getByRole("button", { name: /20 March 1990/ }));
    expect(grid).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Birthday/ })).toHaveTextContent("20 March 1990");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api).toHaveBeenCalled());
    const [path, init] = api.mock.calls.at(-1)!;
    expect(path).toBe(`/users/${admin.id}`);
    expect((init as { body: { birthday: string } }).body.birthday).toBe("1990-03-20");
  });

  it("maps 409 EMAIL_TAKEN onto the email field in the New user drawer", async () => {
    api.mockResolvedValueOnce({ ok: false, status: 409, error: { code: "EMAIL_TAKEN", message: "That email is already in use." } });
    render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
    await userEvent.click(screen.getByRole("button", { name: /New user/ }));
    const drawer = screen.getByRole("dialog", { name: "New user" });
    await userEvent.type(within(drawer).getByLabelText(/Username/), "salma");
    await userEvent.type(within(drawer).getByLabelText(/^Email/), "taken@example.com");
    await userEvent.click(within(drawer).getByRole("button", { name: /Save and send invite/ }));
    const email = await within(drawer).findByLabelText(/^Email/);
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    const describedBy = email.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy.split(" ").pop()!)).toHaveTextContent("That email is already in use.");
  });

  it("adds the new user to the table and confirms the invite", async () => {
    const created = user({ username: "salma", name: "Salma", firstName: "Salma", status: "INVITED", email: "salma@example.com" });
    api.mockResolvedValueOnce({ ok: true, status: 201, data: { user: created } });
    render(
      <>
        <UsersManager locale="en" viewerId={admin.id} initial={initial} />
        <Toaster />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: /New user/ }));
    const drawer = screen.getByRole("dialog", { name: "New user" });
    await userEvent.type(within(drawer).getByLabelText(/Username/), "salma");
    await userEvent.type(within(drawer).getByLabelText(/^Email/), "salma@example.com");
    await userEvent.click(within(drawer).getByRole("button", { name: /Save and send invite/ }));
    expect(await screen.findByText("Invite sent to salma@example.com.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(row("Salma")).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/users", expect.objectContaining({ method: "POST", body: expect.objectContaining({ username: "salma", role: "OWNER" }) }));
  });

  it("requires a reason before deactivating", async () => {
    api.mockResolvedValueOnce({ ok: true, status: 200, data: { user: { ...invited, status: "INACTIVE" } } });
    render(<UsersManager locale="en" viewerId={admin.id} initial={{ ...initial, activeSuperAdminCount: 1 }} />);
    await userEvent.click(within(row("Karim")).getByRole("button", { name: /Actions for Karim/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Deactivate" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Deactivate Karim?" });
    const confirm = within(dialog).getByRole("button", { name: "Deactivate" });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute("data-tone", "destructive");
    await userEvent.type(within(dialog).getByLabelText("Reason"), "   ");
    expect(confirm).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText("Reason"));
    await userEvent.type(within(dialog).getByLabelText("Reason"), "Moved abroad");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(api).toHaveBeenCalledWith(`/users/${invited.id}/deactivate`, { method: "POST", body: { reason: "Moved abroad" } }));
  });

  describe("confirmations for every destructive row action", () => {
    const active = user({ username: "salma", name: "Salma", firstName: "Salma", status: "ACTIVE", roles: ["OWNER"] });
    const withActive = { ...initial, items: [...initial.items, active] };

    async function openAction(name: string, action: string) {
      await userEvent.click(within(row(name)).getByRole("button", { name: new RegExp(`Actions for ${name}`) }));
      await userEvent.click(screen.getByRole("menuitem", { name: action }));
      return screen.findByRole("alertdialog");
    }

    it("Revoke invite asks first and explains the link dies", async () => {
      api.mockResolvedValueOnce({ ok: true, status: 200, data: null });
      render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
      const dialog = await openAction("Karim", "Revoke invite");
      expect(dialog).toHaveAccessibleName("Revoke Karim's invite?");
      expect(dialog).toHaveTextContent("The emailed link stops working right away.");
      expect(api).not.toHaveBeenCalled();
      const confirm = within(dialog).getByRole("button", { name: "Revoke invite" });
      expect(confirm).toHaveAttribute("data-tone", "destructive");
      await userEvent.click(confirm);
      await waitFor(() => expect(api).toHaveBeenCalledWith(`/users/${invited.id}/revoke-invite`, { method: "POST" }));
    });

    it("Resend invite asks first and warns the old link stops working", async () => {
      api.mockResolvedValueOnce({ ok: true, status: 200, data: null });
      render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
      const dialog = await openAction("Karim", "Resend invite");
      expect(dialog).toHaveAccessibleName("Send Karim a new invite?");
      expect(dialog).toHaveTextContent("The previous link stops working.");
      expect(api).not.toHaveBeenCalled();
      await userEvent.click(within(dialog).getByRole("button", { name: "Resend invite" }));
      await waitFor(() => expect(api).toHaveBeenCalledWith(`/users/${invited.id}/resend-invite`, { method: "POST" }));
    });

    it("Cancel on revoke invite sends nothing", async () => {
      render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
      const dialog = await openAction("Karim", "Revoke invite");
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(api).not.toHaveBeenCalled();
    });

    it("Log out everywhere asks first with a destructive, action-named button", async () => {
      api.mockResolvedValueOnce({ ok: true, status: 200, data: null });
      render(<UsersManager locale="en" viewerId={admin.id} initial={withActive} />);
      const dialog = await openAction("Salma", "Log out everywhere");
      expect(dialog).toHaveAccessibleName("Log Salma out everywhere?");
      const confirm = within(dialog).getByRole("button", { name: "Log out everywhere" });
      expect(confirm).toHaveAttribute("data-tone", "destructive");
      await userEvent.click(confirm);
      await waitFor(() => expect(api).toHaveBeenCalledWith(`/users/${active.id}/revoke-sessions`, { method: "POST" }));
    });

    it("returns focus to the row's actions button after a menu-opened dialog closes", async () => {
      render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
      const dialog = await openAction("Karim", "Revoke invite");
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      await waitFor(() => expect(within(row("Karim")).getByRole("button", { name: /Actions for Karim/ })).toHaveFocus());
    });

    it("Resend invite uses the destructive tone (it kills the old link)", async () => {
      render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
      const dialog = await openAction("Karim", "Resend invite");
      expect(within(dialog).getByRole("button", { name: "Resend invite" })).toHaveAttribute("data-tone", "destructive");
    });

    it("Reactivate still needs a reason but uses the non-destructive tone", async () => {
      render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
      const dialog = await openAction("Gone", "Reactivate");
      const confirm = within(dialog).getByRole("button", { name: "Reactivate" });
      expect(confirm).toBeDisabled();
      expect(confirm).toHaveAttribute("data-tone", "default");
    });
  });

  describe("role change confirmation (USR-02)", () => {
    const owner = user({ username: "salma", name: "Salma", firstName: "Salma", status: "ACTIVE", roles: ["OWNER"] });
    const admin2 = user({ username: "nila", name: "Nila", firstName: "Nila", status: "ACTIVE", roles: ["SUPER_ADMIN"] });
    const page = { items: [admin, admin2, owner], nextCursor: null, activeSuperAdminCount: 2 };

    async function editAndSave(name: string, role?: "Owner" | "Super Admin") {
      await userEvent.click(within(row(name)).getByRole("button", { name: new RegExp(`Actions for ${name}`) }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
      const drawer = screen.getByRole("dialog", { name: new RegExp(name) });
      if (role) await userEvent.selectOptions(within(drawer).getByLabelText(/System role/), role);
      await userEvent.click(within(drawer).getByRole("button", { name: /Save/ }));
      return drawer;
    }

    it("demotion asks first and sends nothing until confirmed", async () => {
      api.mockResolvedValueOnce({ ok: true, status: 200, data: { user: admin2 } });
      api.mockResolvedValueOnce({ ok: true, status: 200, data: { user: { ...admin2, roles: ["OWNER"] } } });
      render(<UsersManager locale="en" viewerId={admin.id} initial={page} />);
      await editAndSave("Nila", "Owner");
      const dialog = await screen.findByRole("alertdialog", { name: "Change Nila's role to Owner?" });
      expect(dialog).toHaveTextContent("They will lose Super Admin access and be logged out on every device.");
      expect(api).not.toHaveBeenCalled();
      await userEvent.click(within(dialog).getByRole("button", { name: "Change role" }));
      await waitFor(() => expect(api).toHaveBeenCalledWith(`/users/${admin2.id}/roles`, { method: "PUT", body: { roles: ["OWNER"] } }));
    });

    it("promotion asks first too (the server logs them out)", async () => {
      render(<UsersManager locale="en" viewerId={admin.id} initial={page} />);
      await editAndSave("Salma", "Super Admin");
      const dialog = await screen.findByRole("alertdialog", { name: "Change Salma's role to Super Admin?" });
      expect(dialog).toHaveTextContent("They will get full Super Admin access");
      expect(api).not.toHaveBeenCalled();
    });

    it("Cancel keeps the drawer open and sends nothing", async () => {
      render(<UsersManager locale="en" viewerId={admin.id} initial={page} />);
      const drawer = await editAndSave("Nila", "Owner");
      const cancel = within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" });
      // Stacked above the Sheet's focus trap, focus still lands on the safe choice.
      await waitFor(() => expect(cancel).toHaveFocus());
      await userEvent.click(cancel);
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(drawer).toBeInTheDocument();
      expect(api).not.toHaveBeenCalled();
    });

    it("a failed role update closes the confirm, keeps the drawer and shows the role error", async () => {
      api.mockResolvedValueOnce({ ok: true, status: 200, data: { user: admin2 } });
      api.mockResolvedValueOnce({ ok: false, status: 409, error: { code: "LAST_SUPER_ADMIN", message: "Can't demote the last Super Admin." } });
      render(<UsersManager locale="en" viewerId={admin.id} initial={page} />);
      const drawer = await editAndSave("Nila", "Owner");
      await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Change role" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(drawer).toBeInTheDocument();
      expect(await within(drawer).findByText("Can't demote the last Super Admin.")).toBeInTheDocument();
    });

    it("a failed profile save closes the confirm and never sends the role update", async () => {
      api.mockResolvedValueOnce({ ok: false, status: 500, error: { code: "INTERNAL", message: "Something broke." } });
      render(<UsersManager locale="en" viewerId={admin.id} initial={page} />);
      const drawer = await editAndSave("Nila", "Owner");
      await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Change role" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(drawer).toBeInTheDocument();
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).not.toHaveBeenCalledWith(expect.stringContaining("/roles"), expect.anything());
    });

    it("profile-only edits save without asking", async () => {
      api.mockResolvedValueOnce({ ok: true, status: 200, data: { user: owner } });
      render(<UsersManager locale="en" viewerId={admin.id} initial={page} />);
      await editAndSave("Salma");
      await waitFor(() => expect(api).toHaveBeenCalledWith(`/users/${owner.id}`, expect.objectContaining({ method: "PATCH" })));
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });
});

describe("user drawer required markers (form-required-indicator)", () => {
  const marked = (id: string) => document.querySelector(`label[for="${id}"]`)?.getAttribute("data-required") === "true";

  it("marks Username, Email and Role only, shows the legend, and keeps the star out of label text", async () => {
    render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
    await userEvent.click(screen.getByRole("button", { name: /New user/ }));
    const drawer = screen.getByRole("dialog", { name: "New user" });
    expect(marked("u-username") && marked("u-email") && marked("u-role")).toBe(true);
    for (const id of ["u-first", "u-last", "u-surname", "u-profession", "u-phone", "u-whatsapp", "u-locale", "u-resp"]) expect(marked(id), id).toBe(false);
    expect(within(drawer).getByText("* Required")).toBeInTheDocument();
    expect(within(drawer).getByRole("textbox", { name: "Username" })).toBeRequired();
    expect(within(drawer).getByRole("combobox", { name: "System role" })).toBeRequired();
    for (const l of drawer.querySelectorAll("label")) expect(l.textContent).not.toMatch(/\*$/);
    expectRequiredMarkersMatch(drawer);
  });

  it("marks the deactivate reason", async () => {
    render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
    await userEvent.click(within(row("Karim")).getByRole("button", { name: /Actions for Karim/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Deactivate" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Deactivate Karim?" });
    expect(marked("confirm-reason")).toBe(true);
    expectRequiredMarkersMatch(dialog);
  });
});

describe("UsersManager photos (A6, add-profile-photo)", () => {
  const png = () => new File([new Uint8Array(10)], "karim.png", { type: "image/png" });
  beforeEach(() => {
    stubImageLoading();
    upload.mockReset();
  });

  async function openNew() {
    render(<UsersManager locale="en" viewerId={admin.id} initial={initial} />);
    await userEvent.click(screen.getByRole("button", { name: /New user/ }));
    const drawer = screen.getByRole("dialog", { name: "New user" });
    await userEvent.type(within(drawer).getByLabelText(/Username/), "salma");
    await userEvent.type(within(drawer).getByLabelText(/^Email/), "salma@example.com");
    return drawer;
  }

  it("shows each user's photo in the Person column, initials otherwise", async () => {
    const withPhoto = user({ username: "rina", name: "Rina Akter", firstName: "Rina", avatarUrl: "/api/v1/attachments/r1/file" });
    render(<UsersManager locale="en" viewerId={admin.id} initial={{ ...initial, items: [admin, withPhoto] }} />);
    await waitFor(() => expect(row("Rina Akter").querySelector("img")).toHaveAttribute("src", "/api/v1/attachments/r1/file"));
    expect(row("Boss Admin").querySelector("img")).toBeNull();
    expect(within(row("Boss Admin")).getByText("BA")).toBeInTheDocument();
  });

  it("New user drawer: optional photo is uploaded first, then sent as avatarId", async () => {
    upload.mockResolvedValueOnce({ ok: true, id: "av1" });
    const created = user({ username: "salma", name: "Salma", status: "INVITED", avatarUrl: "/api/v1/attachments/av1/file" });
    api.mockResolvedValueOnce({ ok: true, status: 201, data: { user: created } } as never);
    const drawer = await openNew();
    expect(within(drawer).getByText("Photo")).toBeInTheDocument();
    await userEvent.upload(within(drawer).getByTestId("avatar-input"), png());
    expect(upload).not.toHaveBeenCalled(); // only on Save
    await userEvent.click(within(drawer).getByRole("button", { name: /Save and send invite/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/users", expect.objectContaining({ method: "POST", body: expect.objectContaining({ username: "salma", avatarId: "av1" }) })));
    expect(upload).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(row("Salma").querySelector("img")).toHaveAttribute("src", "/api/v1/attachments/av1/file"));
  });

  it("New user drawer without a photo sends no avatarId", async () => {
    api.mockResolvedValueOnce({ ok: true, status: 201, data: { user: user({ username: "salma", name: "Salma", status: "INVITED" }) } } as never);
    const drawer = await openNew();
    await userEvent.click(within(drawer).getByRole("button", { name: /Save and send invite/ }));
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect((api.mock.calls[0][1] as { body: Record<string, unknown> }).body).not.toHaveProperty("avatarId");
    expect(upload).not.toHaveBeenCalled();
  });

  it("keeps the drawer open with its values and posts nothing when the upload fails", async () => {
    upload.mockResolvedValueOnce({ ok: false, reason: "failed" });
    const drawer = await openNew();
    await userEvent.upload(within(drawer).getByTestId("avatar-input"), png());
    await userEvent.click(within(drawer).getByRole("button", { name: /Save and send invite/ }));
    expect(await within(drawer).findByText("Photo upload failed. Try again.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "New user" })).toBeInTheDocument();
    expect(within(drawer).getByLabelText(/Username/)).toHaveValue("salma");
  });

  it("does not upload the same photo twice when the save is retried", async () => {
    upload.mockResolvedValueOnce({ ok: true, id: "av1" });
    api.mockResolvedValueOnce({ ok: false, status: 409, error: { code: "EMAIL_TAKEN", message: "That email is already in use." } });
    api.mockResolvedValueOnce({ ok: true, status: 201, data: { user: user({ username: "salma", name: "Salma", status: "INVITED" }) } } as never);
    const drawer = await openNew();
    await userEvent.upload(within(drawer).getByTestId("avatar-input"), png());
    await userEvent.click(within(drawer).getByRole("button", { name: /Save and send invite/ }));
    await within(drawer).findByText("That email is already in use.");
    await userEvent.click(within(drawer).getByRole("button", { name: /Save and send invite/ }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(upload).toHaveBeenCalledTimes(1);
    expect((api.mock.calls[1][1] as { body: Record<string, unknown> }).body.avatarId).toBe("av1");
  });

  it("Edit drawer: removing a saved photo asks first and sends avatarId null", async () => {
    const withPhoto = user({ username: "rina", name: "Rina Akter", firstName: "Rina", avatarUrl: "/api/v1/attachments/r1/file" });
    api.mockResolvedValueOnce({ ok: true, status: 200, data: { user: { ...withPhoto, avatarUrl: null } } } as never);
    render(<UsersManager locale="en" viewerId={admin.id} initial={{ ...initial, items: [admin, withPhoto] }} />);
    await userEvent.click(within(row("Rina Akter")).getByRole("button", { name: /Actions for Rina Akter/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    const drawer = screen.getByRole("dialog", { name: /Rina Akter/ });
    await userEvent.click(within(drawer).getByRole("button", { name: "Remove photo" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Rina Akter's initials will show instead.")).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Remove photo" }));
    expect(api).not.toHaveBeenCalled(); // applied on Save
    await userEvent.click(within(screen.getByRole("dialog", { name: /Rina Akter/ })).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith(`/users/${withPhoto.id}`, expect.objectContaining({ method: "PATCH", body: expect.objectContaining({ avatarId: null }) })));
  });

  it("Edit drawer: replacing a photo uploads and sends the new avatarId", async () => {
    const withPhoto = user({ username: "rina", name: "Rina Akter", firstName: "Rina", avatarUrl: "/api/v1/attachments/r1/file" });
    upload.mockResolvedValueOnce({ ok: true, id: "r2" });
    api.mockResolvedValueOnce({ ok: true, status: 200, data: { user: { ...withPhoto, avatarUrl: "/api/v1/attachments/r2/file" } } } as never);
    render(<UsersManager locale="en" viewerId={admin.id} initial={{ ...initial, items: [admin, withPhoto] }} />);
    await userEvent.click(within(row("Rina Akter")).getByRole("button", { name: /Actions for Rina Akter/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    const drawer = screen.getByRole("dialog", { name: /Rina Akter/ });
    await userEvent.upload(within(drawer).getByTestId("avatar-input"), png());
    await userEvent.click(within(drawer).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith(`/users/${withPhoto.id}`, expect.objectContaining({ body: expect.objectContaining({ avatarId: "r2" }) })));
  });
});

describe("UsersManager email delivery (fix-email-delivery)", () => {
  const healthy = { queued: 0, oldestQueuedAt: null, stalled: false, failedLast7Days: 0, lastFailure: null };
  const failedInvite = { status: "FAILED", queuedAt: "2026-11-10T06:00:00.000Z", sentAt: null, failureCode: "SENDER_NOT_VERIFIED" } as const;
  const sentInvite = { status: "SENT", queuedAt: "2026-11-10T06:00:00.000Z", sentAt: "2026-11-10T06:04:00.000Z", failureCode: null } as const;

  async function openAction(name: string, action: string) {
    await userEvent.click(within(row(name)).getByRole("button", { name: new RegExp(`Actions for ${name}`) }));
    await userEvent.click(screen.getByRole("menuitem", { name: action }));
    return screen.findByRole("alertdialog");
  }

  it("shows why an invite was not sent, in words", () => {
    const items = [admin, { ...invited, inviteEmail: failedInvite }];
    render(<UsersManager locale="en" viewerId={admin.id} initial={{ ...initial, items }} outbox={healthy} />);
    expect(within(row("Karim")).getByText("Invite not sent — sender address not verified")).toBeInTheDocument();
  });

  it("shows when an invite was sent, in Dhaka time", () => {
    const items = [admin, { ...invited, inviteEmail: sentInvite }];
    render(<UsersManager locale="en" viewerId={admin.id} initial={{ ...initial, items }} outbox={healthy} />);
    // 06:04 UTC = 12:04 Asia/Dhaka
    expect(within(row("Karim")).getByText(/Invite sent .*12:04/)).toBeInTheDocument();
  });

  it("shows the Bangla reason for a failed invite", () => {
    const items = [admin, { ...invited, inviteEmail: failedInvite }];
    render(<UsersManager locale="bn" viewerId={admin.id} initial={{ ...initial, items }} outbox={healthy} />);
    expect(within(row("Karim")).getByText("আমন্ত্রণ পাঠানো যায়নি — প্রেরকের ঠিকানা যাচাই করা হয়নি")).toBeInTheDocument();
  });

  it("warns when the email worker looks stopped, ahead of recent failures", () => {
    const outbox = { ...healthy, queued: 3, stalled: true, failedLast7Days: 2, lastFailure: { at: "2026-11-10T06:00:00.000Z", template: "INVITE", failureCode: "SENDER_NOT_VERIFIED" } } as const;
    render(<UsersManager locale="en" viewerId={admin.id} initial={initial} outbox={outbox} />);
    const banner = screen.getByRole("status", { name: /email delivery/i });
    expect(banner).toHaveTextContent("Emails are not being sent. The email worker may be stopped.");
    expect(banner).not.toHaveTextContent("failed to send");
  });

  it("reports recent failures with the last reason", () => {
    const outbox = { ...healthy, failedLast7Days: 2, lastFailure: { at: "2026-11-10T06:00:00.000Z", template: "INVITE", failureCode: "SENDER_NOT_VERIFIED" } } as const;
    render(<UsersManager locale="en" viewerId={admin.id} initial={initial} outbox={outbox} />);
    expect(screen.getByRole("status", { name: /email delivery/i })).toHaveTextContent("2 emails failed to send in the last 7 days. Last reason: sender address not verified.");
  });

  it("shows no banner when email is healthy", () => {
    render(<UsersManager locale="en" viewerId={admin.id} initial={initial} outbox={healthy} />);
    expect(screen.queryByRole("status", { name: /email delivery/i })).toBeNull();
  });

  it("drops a stale invite state when a reactivated user returns to INVITED and refetches the real one", async () => {
    const wasInvited = { ...inactive, inviteEmail: failedInvite };
    const queued = { status: "QUEUED", queuedAt: new Date().toISOString(), sentAt: null, failureCode: null };
    let listCalls = 0;
    let releaseList: () => void = () => {};
    const listGate = new Promise<void>((r) => (releaseList = r));
    api.mockImplementation(async (path) => {
      if (String(path).endsWith("/reactivate")) return { ok: true, status: 200, data: { user: { ...inactive, status: "INVITED" } } } as never;
      if (String(path).startsWith("/email/outbox/status")) return { ok: true, status: 200, data: healthy } as never;
      listCalls++;
      await listGate;
      return { ok: true, status: 200, data: { items: [admin, { ...inactive, status: "INVITED", inviteEmail: queued }], nextCursor: null, activeSuperAdminCount: 1 } } as never;
    });
    render(<UsersManager locale="en" viewerId={admin.id} initial={{ ...initial, items: [admin, wasInvited] }} outbox={healthy} />);
    const dialog = await openAction("Gone", "Reactivate");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Reason/ }), "Back in the house");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reactivate" }));
    // Before the refetch lands, the old failure must not be shown as current.
    await waitFor(() => expect(within(row("Gone")).getByText("Invited")).toBeInTheDocument());
    expect(within(row("Gone")).queryByText(/Invite not sent/)).toBeNull();
    await waitFor(() => expect(listCalls).toBeGreaterThan(0));
    releaseList();
    await waitFor(() => expect(within(row("Gone")).getByText("Invite queued — waiting to be sent")).toBeInTheDocument());
  });

  it("refreshes the invite state after a resend", async () => {
    const items = [admin, { ...invited, inviteEmail: failedInvite }];
    const queued = { status: "QUEUED", queuedAt: new Date().toISOString(), sentAt: null, failureCode: null };
    api.mockImplementation(async (path) => {
      if (String(path).endsWith("/resend-invite")) return { ok: true, status: 200, data: null } as never;
      if (String(path).startsWith("/email/outbox/status")) return { ok: true, status: 200, data: healthy } as never;
      return { ok: true, status: 200, data: { items: [admin, { ...invited, inviteEmail: queued }], nextCursor: null, activeSuperAdminCount: 1 } } as never;
    });
    render(<UsersManager locale="en" viewerId={admin.id} initial={{ ...initial, items }} outbox={healthy} />);
    const dialog = await openAction("Karim", "Resend invite");
    await userEvent.click(within(dialog).getByRole("button", { name: "Resend invite" }));
    await waitFor(() => expect(within(row("Karim")).getByText("Invite queued — waiting to be sent")).toBeInTheDocument());
  });
});
