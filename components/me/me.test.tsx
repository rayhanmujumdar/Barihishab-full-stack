import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { permissionsFor } from "@/lib/permissions";
import { MeScreen } from "./MeScreen";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: (...a: unknown[]) => toastError(...a) }) }));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiFetch: vi.fn() };
});
const api = vi.mocked(apiFetch);

const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "karim",
  email: "karim@example.com",
  name: "Karim",
  firstName: "Karim",
  lastName: null,
  surname: null,
  birthday: null,
  profession: null,
  phone: "01712345678",
  whatsapp: null,
  whatsappSameAsPhone: false,
  houseResponsibility: null,
  locale: "en" as const,
  status: "ACTIVE" as const,
  roles: ["OWNER" as const],
  lastLoginAt: null,
  createdAt: new Date().toISOString(),
};
const sessions = [
  { id: "s1", device: "Mac", browser: "Chrome", ip: "1.1.1.1", createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), current: true },
  { id: "s2", device: "Android", browser: "Chrome", ip: "2.2.2.2", createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), current: false },
];

beforeEach(() => api.mockReset());

describe("MeScreen (A7)", () => {
  it("shows email and username read-only for Owners", () => {
    render(<MeScreen locale="en" profile={profile} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={vi.fn()} />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Username")).toHaveAttribute("readonly");
    expect(screen.getAllByText("Ask Admin to change").length).toBeGreaterThan(0);
  });

  it("lets Super Admins edit their username", () => {
    render(<MeScreen locale="en" profile={{ ...profile, roles: ["SUPER_ADMIN"] }} permissions={permissionsFor(["SUPER_ADMIN"])} sessions={sessions} navigate={vi.fn()} />);
    expect(screen.getByLabelText("Username")).not.toHaveAttribute("readonly");
  });

  it("requires the current password to change the password", async () => {
    render(<MeScreen locale="en" profile={profile} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={vi.fn()} />);
    const submit = screen.getByRole("button", { name: /Change password/ });
    await userEvent.type(screen.getByLabelText("New password"), "Gh7!tree-river");
    await userEvent.type(screen.getByLabelText("Repeat new password"), "Gh7!tree-river");
    expect(submit).toBeDisabled();
    api.mockResolvedValueOnce({ ok: false, status: 401, error: { code: "INVALID_CREDENTIALS", message: "x" } });
    await userEvent.type(screen.getByLabelText("Current password"), "wrong");
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(await screen.findByText("Current password is wrong.")).toBeInTheDocument();
  });

  it("marks the current session", () => {
    render(<MeScreen locale="en" profile={profile} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={vi.fn()} />);
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Log out$/ })).toHaveLength(1);
  });

  it("logs out of all devices after confirmation and goes to /login", async () => {
    api.mockResolvedValueOnce({ ok: true, status: 204, data: null });
    const navigate = vi.fn();
    render(<MeScreen locale="en" profile={profile} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={navigate} />);
    await userEvent.click(screen.getByRole("button", { name: /Log out all devices/ }));
    const dialog = await screen.findByRole("alertdialog", { name: "Log out all devices" });
    expect(api).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole("button", { name: "Log out all devices" });
    expect(confirm).toHaveAttribute("data-tone", "destructive");
    await userEvent.click(confirm);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/en/login"));
    expect(api).toHaveBeenCalledWith("/auth/logout-all", { method: "POST" });
  });

  describe("revoking one device (AUTH-07)", () => {
    beforeEach(() => toastError.mockReset());
    const rowLogout = () => screen.getByRole("button", { name: /^Log out$/ });

    it("asks first, naming the device, and sends nothing on Cancel", async () => {
      render(<MeScreen locale="en" profile={profile} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={vi.fn()} />);
      await userEvent.click(rowLogout());
      const dialog = await screen.findByRole("alertdialog", { name: "Log out Android · Chrome?" });
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(api).not.toHaveBeenCalled();
      expect(screen.getByText(/Android/)).toBeInTheDocument();
    });

    it("revokes only after confirm and removes the row", async () => {
      api.mockResolvedValueOnce({ ok: true, status: 204, data: null });
      render(<MeScreen locale="en" profile={profile} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={vi.fn()} />);
      await userEvent.click(rowLogout());
      await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Log out" }));
      expect(api).toHaveBeenCalledWith("/me/sessions/s2", { method: "DELETE" });
      await waitFor(() => expect(screen.queryByText(/Android/)).toBeNull());
      // The row's button is gone, so focus lands somewhere useful instead of <body>.
      await waitFor(() => expect(screen.getByRole("button", { name: "Log out all devices" })).toHaveFocus());
    });

    it("keeps the row and shows the error when revoking fails", async () => {
      api.mockResolvedValueOnce({ ok: false, status: 500, error: { code: "INTERNAL", message: "Boom" } });
      render(<MeScreen locale="en" profile={profile} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={vi.fn()} />);
      await userEvent.click(rowLogout());
      await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Log out" }));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith("Boom"));
      expect(screen.getByText(/Android/)).toBeInTheDocument();
    });
  });
});
