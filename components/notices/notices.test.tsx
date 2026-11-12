import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { adminPage, notice, page } from "./fixtures";
import { NoticeText } from "./NoticeText";
import { NoticesView } from "./NoticesView";

const replace = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push, refresh }), usePathname: () => "/en/notices" }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
const api = vi.mocked(apiFetch);

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
  refresh.mockReset();
  vi.mocked(toast).mockReset();
  api.mockReset();
  api.mockImplementation(async () => ({ ok: true, status: 200, data: { unread: 0, emailed: 4, reminded: 2, read: [{ userId: "u1", name: "Rayhan Ahmed", readAt: "2026-10-20T05:00:00.000Z" }], notRead: [{ userId: "u2", name: "Nasrin Ahmed" }] } }));
});

describe("NoticeText (G4)", () => {
  it("renders bold, bullets and safe links, and keeps everything else as text", () => {
    const { container } = render(<NoticeText text={"**Off** today\n- Store water\n[go](https://x.test) [bad](javascript:alert(1)) <b>raw</b>"} />);
    expect(screen.getByText("Off").tagName).toBe("STRONG");
    expect(screen.getByRole("listitem")).toHaveTextContent("Store water");
    expect(screen.getByRole("link", { name: "go" })).toHaveAttribute("href", "https://x.test");
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container).toHaveTextContent("[bad](javascript:alert(1)) <b>raw</b>");
  });
});

describe("notice list (N1, N4)", () => {
  it("shows the header, both columns, tags and the read line", () => {
    render(<NoticesView locale="en" data={page()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Notices & complaints" })).toBeInTheDocument();
    expect(screen.getByText("Ahmed Villa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Raise a complaint" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New notice" })).toBeNull();
    const water = screen.getByRole("article", { name: "Water tank cleaning — Sunday 26 Oct" });
    expect(within(water).getByText("Urgent")).toBeInTheDocument();
    expect(within(water).getByText("Pinned")).toBeInTheDocument();
    expect(within(water).getByText("New")).toBeInTheDocument();
    expect(within(water).getByText("20 Oct 2026 · 2 of 4 read")).toBeInTheDocument();
    const tax = screen.getByRole("article", { name: /Holding tax/ });
    expect(within(tax).queryByText("New")).toBeNull();
    expect(within(tax).queryByRole("button", { name: "Mark as read" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Archived notices" })).toHaveAttribute("href", "/en/notices?archived=1");
  });

  it("marks a notice read from Mark as read and from Read more", async () => {
    render(<NoticesView locale="en" data={page()} />);
    const water = screen.getByRole("article", { name: /Water tank/ });
    await userEvent.click(within(water).getByRole("button", { name: "Mark as read" }));
    expect(api).toHaveBeenCalledWith("/notices/n-water/read", { method: "POST" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    api.mockClear();
    await userEvent.click(within(water).getByRole("button", { name: "Read more" }));
    expect(api).toHaveBeenCalledWith("/notices/n-water/read", { method: "POST" });
    expect(within(water).getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
  });

  it("says so when marking a notice read fails", async () => {
    api.mockImplementation(async () => ({ ok: false, status: 500, error: { code: "INTERNAL", message: "Something went wrong." } }));
    render(<NoticesView locale="en" data={page()} />);
    const water = screen.getByRole("article", { name: /Water tank/ });
    await userEvent.click(within(water).getByRole("button", { name: "Mark as read" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Something went wrong."));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers Mark all as read only while something is unread", async () => {
    const { unmount } = render(<NoticesView locale="en" data={page()} />);
    await userEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(api).toHaveBeenCalledWith("/notices/read-all", { method: "POST" });
    unmount();
    render(<NoticesView locale="en" data={page({ notices: { ...page().notices, unread: 0 } })} />);
    expect(screen.queryByRole("button", { name: "Mark all as read" })).toBeNull();
  });

  it("shows the empty states, with New notice for the Super Admin", () => {
    const empty = { items: [], more: false, activeMembers: 4, unread: 0, reachEmail: 4 };
    const { unmount } = render(<NoticesView locale="en" data={page({ notices: { ...empty, reachEmail: null }, complaints: { items: [], more: false } })} />);
    expect(screen.getByText("No notices yet.")).toBeInTheDocument();
    expect(screen.getByText("No complaints. Tap 'Raise an objection' on any entry to question it.")).toBeInTheDocument();
    unmount();
    render(<NoticesView locale="en" data={adminPage({ notices: empty })} />);
    expect(screen.getAllByRole("button", { name: "New notice" })).toHaveLength(2);
  });

  it("renders Bangla labels and digits", () => {
    render(<NoticesView locale="bn" data={page()} />);
    expect(screen.getByRole("heading", { level: 1, name: "নোটিশ ও অভিযোগ" })).toBeInTheDocument();
    expect(screen.getAllByText(/৪ জনের মধ্যে ২ জন পড়েছেন/)).toHaveLength(2);
  });
});

describe("Super Admin notice actions (N2, N3, G6)", () => {
  it("publishes a notice with the reach line and the PRD errors", async () => {
    render(<NoticesView locale="en" data={adminPage()} />);
    await userEvent.click(screen.getByRole("button", { name: "New notice" }));
    const dialog = await screen.findByRole("dialog", { name: "New notice" });
    expect(within(dialog).getByText("Emails 3 active members on publish")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Publish & email" }));
    expect(within(dialog).getByText("Add a title.")).toBeInTheDocument();
    expect(within(dialog).getByText("Write the message.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText(/^Title/), "Water tank cleaning");
    await userEvent.type(within(dialog).getByLabelText(/^Message/), "Supply off 10–2.");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Urgent" }));
    expect(within(dialog).getByText("Emails 4 active members on publish · subject starts with [Urgent]")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Preview" }));
    expect(within(within(dialog).getByRole("region", { name: "As members will see it" })).getByText("Water tank cleaning")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Publish & email" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/notices", { method: "POST", body: { title: "Water tank cleaning", body: "Supply off 10–2.", priority: "URGENT", pinned: false, pinUntil: null } }));
    expect(toast).toHaveBeenCalledWith("Published · emailed to 4 active members");
  });

  it("edits with Email the change on for urgent notices", async () => {
    render(<NoticesView locale="en" data={adminPage()} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Water tank cleaning — Sunday 26 Oct" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit notice" });
    expect(within(dialog).getByRole("checkbox", { name: "Email the change" })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/notices/n-water", expect.objectContaining({ method: "PATCH", body: expect.objectContaining({ emailChange: true }) })));
  });

  it("unpins from the menu and archives only after confirming", async () => {
    render(<NoticesView locale="en" data={adminPage()} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Water tank cleaning — Sunday 26 Oct" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Unpin" }));
    expect(api).toHaveBeenCalledWith("/notices/n-water", { method: "PATCH", body: { pinned: false } });
    api.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Actions for Water tank cleaning — Sunday 26 Oct" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Archive" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Archive this notice?" });
    expect(api).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole("button", { name: "Archive" }));
    expect(api).toHaveBeenCalledWith("/notices/n-water/archive", { method: "POST" });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Archived · removed from everyone's list and Home"));
  });

  it("lists who has read and reminds unread members once", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) =>
      path.endsWith("/reads")
        ? { ok: true, status: 200, data: { read: [{ userId: "u1", name: "Rayhan Ahmed", readAt: "2026-10-20T05:00:00.000Z" }], notRead: [{ userId: "u2", name: "Nasrin Ahmed" }] } }
        : { ok: true, status: 200, data: { reminded: 2 } },
    );
    const { unmount } = render(<NoticesView locale="en" data={adminPage()} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Water tank cleaning — Sunday 26 Oct" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Who has read" }));
    const sheet = await screen.findByRole("dialog", { name: "Who has read" });
    expect(await within(sheet).findByText("Rayhan Ahmed")).toBeInTheDocument();
    expect(within(sheet).getByText("Nasrin Ahmed")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Remind unread" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Reminder sent to 2 members who haven't read it"));
    expect(within(sheet).getByRole("button", { name: "Remind unread" })).toBeDisabled();
    expect(within(sheet).getByText("A reminder already went out today.")).toBeInTheDocument();
    unmount();
    render(<NoticesView locale="en" data={adminPage({ notices: { ...adminPage().notices, items: [notice({ remindedToday: true })] } })} />);
    await userEvent.click(screen.getByRole("button", { name: /Actions for/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Who has read" }));
    const again = await screen.findByRole("dialog", { name: "Who has read" });
    expect(await within(again).findByRole("button", { name: "Remind unread" })).toBeDisabled();
    expect(within(again).getByText("A reminder already went out today.")).toBeInTheDocument();
  });
});
