import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OwnersView } from "./OwnersView";
import { owner, ownerPermsOnly, ownersData } from "./fixtures";
import { waitFor } from "@testing-library/react";
import { stubImageLoading } from "@/tests/helpers/image";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/en/owners" }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), fieldErrors: () => ({}) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }) }));

const cards = (name = "Owners") => within(screen.getByRole("list", { name })).getAllByRole("link");

describe("OwnersView (F1)", () => {
  it("shows the house kicker and one card per owner in order with share, tags, balance and loan", () => {
    render(<OwnersView locale="en" data={ownersData()} />);
    expect(screen.getByText("Ahmed Villa · 100 share units")).toBeInTheDocument();
    const list = cards();
    expect(list.map((c) => within(c).getByRole("heading", { level: 2 }).textContent)).toEqual(["Nasrin Ahmed", "Rayhan Ahmed", "Tanvir Ahmed", "Farzana Haque", "Sabrina Ahmed"]);
    expect(list[0]).toHaveAttribute("href", "/en/owners/o-nasrin");
    expect(list[0]).toHaveTextContent("You");
    expect(list[0]).toHaveTextContent("40%");
    expect(list[0]).toHaveTextContent("40 units");
    expect(list[0]).toHaveTextContent("Advance outstanding");
    expect(list[0]).toHaveTextContent("৳5,000");
    expect(list[0]).toHaveTextContent("None");
    expect(list[1]).toHaveTextContent("Super Admin");
    expect(list[1]).toHaveTextContent("Settled");
    expect(list[2]).toHaveTextContent("No login");
    expect(list[2]).toHaveTextContent("Owed");
    expect(list[2]).toHaveTextContent("৳8,055.85");
    expect(list[2]).toHaveTextContent("৳35,000");
    expect(list[4]).toHaveTextContent("Invite pending");
  });

  it("puts the viewer's card first on phones (CSS order) without reordering others", () => {
    render(<OwnersView locale="en" data={ownersData()} />);
    expect(cards()[0].closest("li")).toHaveAttribute("data-viewer", "true");
    expect(cards()[1].closest("li")).not.toHaveAttribute("data-viewer");
  });

  it("hides the Former owners section when there are none, and lists them when there are", () => {
    const { unmount } = render(<OwnersView locale="en" data={ownersData()} />);
    expect(screen.queryByRole("heading", { name: "Former owners" })).toBeNull();
    unmount();
    const data = ownersData();
    data.list.formerOwners = [owner({ id: "o-old", displayName: "Karim Ahmed", status: "former", leftMonth: "2026-09", units: 0, sharePercent: 0, balancePaisa: 12000, balanceLabel: "OWED" })];
    render(<OwnersView locale="en" data={data} />);
    const former = screen.getByRole("region", { name: "Former owners" });
    expect(former).toHaveTextContent("Karim Ahmed");
    expect(former).toHaveTextContent("Left September 2026");
    expect(former).toHaveTextContent("৳120");
  });

  it("opens the share timeline", async () => {
    render(<OwnersView locale="en" data={ownersData()} />);
    await userEvent.click(screen.getByRole("button", { name: "Share timeline" }));
    const dialog = await screen.findByRole("dialog", { name: "Share timeline" });
    expect(dialog).toHaveTextContent("From June 2026");
    expect(dialog).toHaveTextContent("Gifted 10 units to Sabrina, deed 20 May 2026 · by Rayhan Ahmed");
  });

  it("marks a questioned share change and offers Raise an objection on each (Notices & Complaints C8, G9)", async () => {
    render(<OwnersView locale="en" data={ownersData({ complaints: { questioned: { "s-jun": "c-7" }, complain: true } })} />);
    await userEvent.click(screen.getByRole("button", { name: "Share timeline" }));
    const dialog = await screen.findByRole("dialog", { name: "Share timeline" });
    expect(within(dialog).getByRole("link", { name: "Questioned" })).toHaveAttribute("href", "/en/notices?complaint=c-7");
    expect(within(dialog).getByRole("link", { name: "Raise an objection" })).toHaveAttribute("href", "/en/notices?raise=1&link=SHARE_SET%3As-jun");
  });

  it("shows the setup empty state with Add owner for admins", () => {
    const data = ownersData();
    data.list = { ...data.list, owners: [], totalUnits: 0 };
    render(<OwnersView locale="en" data={data} />);
    expect(screen.getByText("No owners yet. Add the first owner, then give everyone their shares.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add owner" }).length).toBeGreaterThan(0);
  });

  it("gives Super Admins Change shares and Add owner; Owners get neither", () => {
    const { unmount } = render(<OwnersView locale="en" data={ownersData()} />);
    expect(screen.getByRole("button", { name: "Change shares" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add owner" })).toBeInTheDocument();
    unmount();
    render(<OwnersView locale="en" data={ownersData({ perms: ownerPermsOnly })} />);
    expect(screen.queryByRole("button", { name: "Change shares" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add owner" })).toBeNull();
  });

  it("speaks Bangla with Bangla digits", () => {
    render(<OwnersView locale="bn" data={ownersData()} />);
    const first = cards("মালিকগণ")[0];
    expect(first).toHaveTextContent("৪০%");
    expect(first).toHaveTextContent("অগ্রিম বাকি");
    expect(first).toHaveTextContent("৳৫,০০০");
  });
});

describe("OwnersView photos", () => {
  it("shows the linked user's photo on the card, initials for the rest", async () => {
    stubImageLoading();
    const data = ownersData();
    data.list.owners = data.list.owners.map((o) => (o.id === "o-rayhan" ? { ...o, avatarUrl: "/api/v1/attachments/ray/file" } : o));
    render(<OwnersView locale="en" data={data} />);
    const card = screen.getByRole("link", { name: /Rayhan Ahmed/ });
    await waitFor(() => expect(card.querySelector("img")).toHaveAttribute("src", "/api/v1/attachments/ray/file"));
    expect(within(card).queryByText("RA")).toBeNull();
    expect(within(screen.getByRole("link", { name: /Nasrin Ahmed/ })).getByText("NA")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
