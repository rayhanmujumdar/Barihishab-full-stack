import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { permissionsFor } from "@/lib/permissions";
import { expectRequiredMarkersMatch } from "@/tests/helpers/required";
import { toast } from "sonner";
import { uploadAvatar } from "@/components/users/avatar-upload";
import { stubImageLoading } from "@/tests/helpers/image";
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
vi.mock("@/components/users/avatar-upload", async () => {
  const actual = await vi.importActual<typeof import("@/components/users/avatar-upload")>("@/components/users/avatar-upload");
  return { ...actual, uploadAvatar: vi.fn() };
});
const upload = vi.mocked(uploadAvatar);

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
  avatarUrl: null as string | null,
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
  }, 15_000); // types ~30 chars; the 5 s default flakes under full-suite load

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

describe("MeScreen required markers (form-required-indicator)", () => {
  const marked = (id: string) => document.querySelector(`label[for="${id}"]`)?.getAttribute("data-required") === "true";
  const legend = () => screen.queryByText("* Required");

  it("Super Admin: editable username and email are marked and the profile legend shows", () => {
    const { container } = render(<MeScreen locale="en" profile={{ ...profile, roles: ["SUPER_ADMIN"] }} permissions={permissionsFor(["SUPER_ADMIN"])} sessions={sessions} navigate={vi.fn()} />);
    expect(marked("me-username") && marked("me-email")).toBe(true);
    for (const id of ["me-first", "me-last", "me-surname", "me-profession", "me-phone", "me-whatsapp"]) expect(marked(id), id).toBe(false);
    expect(legend()).toBeInTheDocument();
    expectRequiredMarkersMatch(container);
  });

  it("Owner: read-only username and email are not marked and there is no profile legend", () => {
    const { container } = render(<MeScreen locale="en" profile={profile} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={vi.fn()} />);
    expect(marked("me-username") || marked("me-email")).toBe(false);
    expect(legend()).toBeNull();
    expectRequiredMarkersMatch(container);
  });

  it("change-password form marks current, new and repeat", () => {
    render(<MeScreen locale="en" profile={profile} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={vi.fn()} />);
    expect(marked("me-current") && marked("me-new") && marked("me-repeat")).toBe(true);
    expect(screen.getByLabelText("Current password")).toBeRequired();
  });
});

describe("MeScreen photo block (A7, add-profile-photo)", () => {
  const png = () => new File([new Uint8Array(10)], "me.png", { type: "image/png" });
  const meOk = (avatarUrl: string | null) => ({ ok: true as const, status: 200, data: { profile: { ...profile, avatarUrl }, roles: ["OWNER"], permissions: [] } });
  beforeEach(() => {
    stubImageLoading();
    upload.mockReset();
    refresh.mockReset();
    vi.mocked(toast).mockReset();
  });

  it("shows initials without a photo and the photo when set", async () => {
    const { container, unmount } = render(<MeScreen locale="en" profile={profile} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Choose photo" })).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    unmount();
    const withPhoto = render(<MeScreen locale="en" profile={{ ...profile, avatarUrl: "/api/v1/attachments/a1/file" }} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={vi.fn()} />);
    await waitFor(() => expect(withPhoto.container.querySelector("img")).toHaveAttribute("src", "/api/v1/attachments/a1/file"));
  });

  it("uploads a picked photo and saves it at once", async () => {
    upload.mockResolvedValueOnce({ ok: true, id: "a2" });
    api.mockResolvedValueOnce(meOk("/api/v1/attachments/a2/file"));
    const { container } = render(<MeScreen locale="en" profile={profile} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={vi.fn()} />);
    await userEvent.upload(screen.getByTestId("avatar-input"), png());
    await waitFor(() => expect(api).toHaveBeenCalledWith("/me", { method: "PATCH", body: { avatarId: "a2" } }));
    expect(toast).toHaveBeenCalledWith("Photo updated.");
    expect(refresh).toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "/api/v1/attachments/a2/file"));
  });

  it("asks before removing, then sends avatarId null", async () => {
    api.mockResolvedValueOnce(meOk(null));
    render(<MeScreen locale="en" profile={{ ...profile, avatarUrl: "/api/v1/attachments/a1/file" }} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(api).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove photo" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/me", { method: "PATCH", body: { avatarId: null } }));
    expect(toast).toHaveBeenCalledWith("Photo removed.");
    expect(await screen.findByRole("button", { name: "Choose photo" })).toBeInTheDocument();
  });

  it("shows a field error when the upload fails and saves nothing", async () => {
    upload.mockResolvedValueOnce({ ok: false, reason: "failed" });
    render(<MeScreen locale="en" profile={profile} permissions={permissionsFor(["OWNER"])} sessions={sessions} navigate={vi.fn()} />);
    await userEvent.upload(screen.getByTestId("avatar-input"), png());
    expect(await screen.findByText("Photo upload failed. Try again.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });
});
