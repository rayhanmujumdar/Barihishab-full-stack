import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hardNavigate } from "@/components/auth/navigate";
import { apiFetch } from "@/lib/api/client";
import { permissionsFor } from "@/lib/permissions";
import { HomeDesk } from "./HomeDesk";
import { ShellNav } from "./ShellNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/auth/navigate", () => ({ hardNavigate: vi.fn() }));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: (...a: unknown[]) => toastError(...a) }) }));
const api = vi.mocked(apiFetch);
const nav = vi.mocked(hardNavigate);

const viewer = (roles: ("SUPER_ADMIN" | "OWNER")[]) => ({ name: "Karim Uddin", initials: "KU", roles, permissions: permissionsFor(roles) });

describe("ShellNav (RBAC-05)", () => {
  it("hides admin navigation from Owners", () => {
    render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} />);
    expect(screen.getAllByRole("link", { name: /Home/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Users/ })).toBeNull();
  });

  it("shows Users with the pending-invites badge to Super Admins", () => {
    render(<ShellNav locale="en" viewer={viewer(["SUPER_ADMIN"])} pendingInvites={2} />);
    const links = screen.getAllByRole("link", { name: /Users/ });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveTextContent("2");
  });

  it("shows Income & expenses to Owners but not Settings", () => {
    render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} />);
    expect(screen.getAllByRole("link", { name: /Income & expenses|Entries/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Settings/ })).toBeNull();
  });

  it("shows Income & expenses and Settings to Super Admins", () => {
    render(<ShellNav locale="en" viewer={viewer(["SUPER_ADMIN"])} pendingInvites={0} />);
    expect(screen.getAllByRole("link", { name: /Income & expenses/ })[0]).toHaveAttribute("href", "/en/entries");
    expect(screen.getAllByRole("link", { name: /Settings/ })[0]).toHaveAttribute("href", "/en/settings");
  });

  it("shows Owners to Owners and Super Admins (owners-ui)", () => {
    for (const roles of [["OWNER"], ["SUPER_ADMIN"]] as const) {
      const { unmount } = render(<ShellNav locale="en" viewer={viewer([...roles])} pendingInvites={0} />);
      expect(screen.getAllByRole("link", { name: /^Owners/ })[0]).toHaveAttribute("href", "/en/owners");
      unmount();
    }
  });

  it("shows Distribution after Entries to Owners and Super Admins (distribution-ui)", () => {
    for (const roles of [["OWNER"], ["SUPER_ADMIN"]] as const) {
      const { unmount } = render(<ShellNav locale="en" viewer={viewer([...roles])} pendingInvites={0} />);
      const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
      expect(links).toContain("/en/distribution");
      expect(links.indexOf("/en/distribution")).toBe(links.indexOf("/en/entries") + 1);
      unmount();
    }
  });

  it("shows Advances & loans after Owners to Owners and Super Admins (advances-loans-ui)", () => {
    for (const roles of [["OWNER"], ["SUPER_ADMIN"]] as const) {
      const { unmount } = render(<ShellNav locale="en" viewer={viewer([...roles])} pendingInvites={0} />);
      expect(screen.getAllByRole("link", { name: /^Advances & loans/ })[0]).toHaveAttribute("href", "/en/advances");
      const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
      expect(links.indexOf("/en/advances")).toBe(links.indexOf("/en/owners") + 1);
      unmount();
    }
  });

  it("marks the current page", () => {
    render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} />);
    expect(screen.getAllByRole("link", { name: /Home/ })[0]).toHaveAttribute("aria-current", "page");
  });
});

describe("ShellNav logout confirmation (AUTH-05)", () => {
  beforeEach(() => {
    api.mockReset();
    nav.mockReset();
    toastError.mockReset();
  });

  const sidebarLogout = () => within(screen.getByRole("complementary")).getByRole("button", { name: "Log out" });

  it("sidebar Log out opens a confirmation and sends nothing yet", async () => {
    render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} />);
    await userEvent.click(sidebarLogout());
    const dialog = await screen.findByRole("alertdialog", { name: "Log out?" });
    expect(dialog).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("Cancel keeps the session and returns focus to the sidebar button", async () => {
    render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} />);
    await userEvent.click(sidebarLogout());
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api).not.toHaveBeenCalled();
    expect(nav).not.toHaveBeenCalled();
    await waitFor(() => expect(sidebarLogout()).toHaveFocus());
  });

  it("confirm sends one logout request and goes to /{lang}/login", async () => {
    api.mockResolvedValue({ ok: true, status: 204, data: null } as never);
    render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} />);
    await userEvent.click(sidebarLogout());
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.dblClick(within(dialog).getByRole("button", { name: "Log out" }));
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/auth/logout", { method: "POST" });
    await waitFor(() => expect(nav).toHaveBeenCalledWith("/en/login"));
  });

  it("treats 401 as already logged out", async () => {
    api.mockResolvedValue({ ok: false, status: 401, error: { code: "UNAUTHENTICATED", message: "" } } as never);
    render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} />);
    await userEvent.click(sidebarLogout());
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(nav).toHaveBeenCalledWith("/en/login"));
  });

  it("a 500 keeps the user in the app and shows an error", async () => {
    api.mockResolvedValue({ ok: false, status: 500, error: { code: "INTERNAL", message: "x" } } as never);
    render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} />);
    await userEvent.click(sidebarLogout());
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(nav).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("bottom-nav Log out opens the same confirmation", async () => {
    render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} />);
    const bottom = screen.getAllByRole("navigation").find((n) => n.classList.contains("bottom-nav"))!;
    await userEvent.click(within(bottom).getByRole("button", { name: /Log out/ }));
    expect(await screen.findByRole("alertdialog", { name: "Log out?" })).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("renders the confirmation in Bangla", async () => {
    render(<ShellNav locale="bn" viewer={viewer(["OWNER"])} pendingInvites={0} />);
    await userEvent.click(within(screen.getByRole("complementary")).getByRole("button", { name: "লগ আউট" }));
    const dialog = await screen.findByRole("alertdialog", { name: "লগ আউট করবেন?" });
    expect(within(dialog).getByRole("button", { name: "বাতিল" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "লগ আউট" })).toBeInTheDocument();
  });
});

describe("HomeDesk (A5)", () => {
  it("shows the Bookkeeper's desk with pending invites to Super Admins", () => {
    render(<HomeDesk locale="en" name="Rayhan" permissions={permissionsFor(["SUPER_ADMIN"])} stats={{ pendingInvites: 2, activeUsers: 5 }} />);
    expect(screen.getByRole("heading", { name: "Bookkeeper's desk" })).toBeInTheDocument();
    expect(screen.getByText("Invites waiting").closest(".stat")).toHaveTextContent("2");
  });

  it("never renders the admin block for Owners", () => {
    render(<HomeDesk locale="en" name="Karim" permissions={permissionsFor(["OWNER"])} stats={null} />);
    expect(screen.queryByText("Bookkeeper's desk")).toBeNull();
    expect(screen.getByRole("heading", { name: "Welcome, Karim" })).toBeInTheDocument();
  });
});

describe("HomeDesk statement shortcut (F17)", () => {
  it("links to the viewer's own owner detail when linked", () => {
    render(<HomeDesk locale="en" name="Nasrin" permissions={permissionsFor(["OWNER"])} stats={null} ownerId="o-1" />);
    expect(screen.getByRole("link", { name: /Statement/ })).toHaveAttribute("href", "/en/owners/o-1");
  });

  it("shows no shortcut when the viewer is not an owner", () => {
    render(<HomeDesk locale="en" name="Karim" permissions={permissionsFor(["OWNER"])} stats={null} ownerId={null} />);
    expect(screen.queryByRole("link", { name: /Statement/ })).toBeNull();
  });
});

describe("HomeDesk close reminder (Distribution F14)", () => {
  it("shows the open month, unpaid units and a link to its distribution", () => {
    render(
      <HomeDesk
        locale="en"
        name="Rayhan"
        permissions={permissionsFor(["SUPER_ADMIN"])}
        stats={{ pendingInvites: 0, activeUsers: 2 }}
        closeReminder={{ month: "2026-10", unpaid: [{ name: "Flat 3A", tenantName: "Nusrat Jahan" }] }}
      />,
    );
    const strip = screen.getByRole("note");
    expect(strip).toHaveTextContent("October 2026 is open. Flat 3A (Nusrat Jahan) has not paid rent yet.");
    expect(screen.getByRole("link", { name: /Review distribution/ })).toHaveAttribute("href", "/en/distribution?month=2026-10");
  });

  it("is absent without a reminder", () => {
    render(<HomeDesk locale="en" name="Karim" permissions={permissionsFor(["OWNER"])} stats={null} />);
    expect(screen.queryByRole("link", { name: /Review distribution/ })).toBeNull();
  });
});
