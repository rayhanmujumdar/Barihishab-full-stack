import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hardNavigate } from "@/components/auth/navigate";
import { apiFetch } from "@/lib/api/client";
import { permissionsFor } from "@/lib/permissions";
import { stubImageLoading } from "@/tests/helpers/image";
import { bottomNav } from "./nav";
import { ShellNav, TopbarAction } from "./ShellNav";

const pathname = { current: "/" };
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current, useRouter: () => ({ refresh: vi.fn() }) }));
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

  it("shows Requests with its badge to everyone who may view requests (Requests F1, F14)", () => {
    render(<ShellNav locale="bn" viewer={viewer(["SUPER_ADMIN"])} pendingInvites={0} requestBadge={12} />);
    const links = screen.getAllByRole("link", { name: /অনুরোধ/ });
    expect(links[0]).toHaveAttribute("href", "/bn/requests");
    expect(links[0]).toHaveTextContent("১২");
  });

  it("hides the Requests badge at zero", () => {
    render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} requestBadge={0} />);
    expect(screen.getAllByRole("link", { name: /Requests/ })[0]).toHaveTextContent(/^Requests$/);
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

  it("shows Reports after Advances & loans and marks it current on any report tab (reports-ui)", () => {
    pathname.current = "/en/reports/yearly";
    try {
      for (const roles of [["OWNER"], ["SUPER_ADMIN"]] as const) {
        const { unmount } = render(<ShellNav locale="en" viewer={viewer([...roles])} pendingInvites={0} />);
        const reports = screen.getAllByRole("link", { name: /^Reports/ })[0];
        expect(reports).toHaveAttribute("href", "/en/reports");
        expect(reports).toHaveAttribute("aria-current", "page");
        const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
        expect(links.indexOf("/en/reports")).toBe(links.indexOf("/en/advances") + 1);
        unmount();
      }
    } finally {
      pathname.current = "/";
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

  it("mobile More-sheet Log out opens the same confirmation", async () => {
    render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} />);
    const bottom = screen.getAllByRole("navigation").find((n) => n.classList.contains("bottom-nav"))!;
    await userEvent.click(within(bottom).getByRole("button", { name: "More" }));
    const sheet = await screen.findByRole("dialog", { name: "All sections" });
    await userEvent.click(within(sheet).getByRole("button", { name: /Log out/ }));
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

describe("ShellNav profile photo (add-profile-photo)", () => {
  beforeEach(() => stubImageLoading());

  it("shows the viewer's photo instead of initials", async () => {
    const { container } = render(<ShellNav locale="en" viewer={{ ...viewer(["OWNER"]), avatarUrl: "/api/v1/attachments/v1/file" }} pendingInvites={0} />);
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "/api/v1/attachments/v1/file"));
    expect(screen.queryByText("KU")).toBeNull();
  });

  it("falls back to initials when the photo is missing or broken", async () => {
    const { unmount } = render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} />);
    expect(screen.getByText("KU")).toBeInTheDocument();
    unmount();
    const broken = render(<ShellNav locale="en" viewer={{ ...viewer(["OWNER"]), avatarUrl: "/api/v1/attachments/broken/file" }} pendingInvites={0} />);
    await waitFor(() => expect(screen.getByText("KU")).toBeInTheDocument());
    expect(broken.container.querySelector("img")).toBeNull();
  });
});


describe("App shell (Home PRD §4)", () => {
  const bottom = () => screen.getAllByRole("navigation").find((n) => n.classList.contains("bottom-nav"))!;
  const labels = () => Array.from(bottom().children).map((el) => el.getAttribute("aria-label") ?? el.textContent);

  it("shows the house under the logo", () => {
    render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} houseName="Ahmed Villa" />);
    expect(within(screen.getByRole("complementary")).getByText("Ahmed Villa")).toBeInTheDocument();
  });

  it("gives the Super Admin Home · Entries · + · Distribution · More", () => {
    render(<ShellNav locale="en" viewer={viewer(["SUPER_ADMIN"])} pendingInvites={0} />);
    expect(labels()).toEqual(["Home", "Income & expenses", "Add expense", "Distribution", "More"]);
    expect(within(bottom()).getByRole("link", { name: "Add expense" })).toHaveAttribute("href", "/en/entries?new=EXPENSE");
  });

  it("gives an Owner Home · Accounts · Requests · Income & expenses · More", () => {
    render(<ShellNav locale="en" viewer={viewer(["OWNER"])} pendingInvites={0} />);
    expect(labels()).toEqual(["Home", "Accounts", "Requests", "Income & expenses", "More"]);
    expect(within(bottom()).getByRole("link", { name: "Accounts" })).toHaveAttribute("href", "/en/reports");
  });

  it("puts the rest, with badges, in the More sheet and closes it on navigation", async () => {
    render(<ShellNav locale="en" viewer={viewer(["SUPER_ADMIN"])} pendingInvites={3} requestBadge={2} />);
    await userEvent.click(within(bottom()).getByRole("button", { name: "More" }));
    const sheet = await screen.findByRole("dialog", { name: "All sections" });
    const links = within(sheet).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/en/owners", "/en/advances", "/en/reports", "/en/requests", "/en/admin/users", "/en/settings", "/en/me"]);
    expect(within(sheet).getByRole("link", { name: /Users/ })).toHaveTextContent("3");
    expect(within(sheet).getByRole("link", { name: /Requests/ })).toHaveTextContent("2");
    await userEvent.click(within(sheet).getByRole("link", { name: /Settings/ }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "All sections" })).toBeNull());
  });

  it("marks More as active (without claiming it is a page) when the current page lives in the sheet", () => {
    render(<ShellNav locale="en" viewer={viewer(["SUPER_ADMIN"])} pendingInvites={0} />);
    const more = within(bottom()).getByRole("button", { name: "More" });
    expect(more).not.toHaveAttribute("aria-current");
  });

  it("splits permitted items into bottom slots and More (pure)", () => {
    const owner = bottomNav({ permissions: permissionsFor(["OWNER"]) });
    expect(owner.slots.map((s) => (s === "PLUS" ? s : s.href))).toEqual(["/", "/reports", "/requests", "/entries"]);
    expect(owner.more.map((m) => m.href)).toEqual(["/distribution", "/owners", "/advances", "/me"]);
    const admin = bottomNav({ permissions: permissionsFor(["SUPER_ADMIN"]) });
    expect(admin.slots.map((s) => (s === "PLUS" ? s : s.href))).toEqual(["/", "/entries", "PLUS", "/distribution"]);
  });

  it("drops the [+] cell when no month is open and fills the slot with the next section", () => {
    const admin = bottomNav({ permissions: permissionsFor(["SUPER_ADMIN"]) }, { monthOpen: false });
    expect(admin.slots.map((s) => (s === "PLUS" ? s : s.href))).toEqual(["/", "/entries", "/distribution", "/owners"]);
    expect(admin.more.map((m) => m.href)).not.toContain("/owners");
    render(<ShellNav locale="en" viewer={viewer(["SUPER_ADMIN"])} pendingInvites={0} monthOpen={false} />);
    expect(within(bottom()).queryByRole("link", { name: "Add expense" })).toBeNull();
  });

  it("offers + New entry to bookkeepers and + Request money to owners", () => {
    const { unmount } = render(<TopbarAction locale="en" action="entry" />);
    expect(screen.getByRole("link", { name: "New entry" })).toHaveAttribute("href", "/en/entries?new=EXPENSE");
    unmount();
    const r = render(<TopbarAction locale="en" action="request" />);
    expect(screen.getByRole("link", { name: "Request money" })).toHaveAttribute("href", "/en/requests?new=1");
    r.unmount();
    const { container } = render(<TopbarAction locale="en" action={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
