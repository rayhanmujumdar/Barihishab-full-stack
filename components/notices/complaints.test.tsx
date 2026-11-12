import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, type ApiResult } from "@/lib/api/client";
import { adminPage, complaint, detail, page } from "./fixtures";
import { NoticesView } from "./NoticesView";

const replace = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push, refresh }), usePathname: () => "/en/notices" }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
const api = vi.mocked(apiFetch);

const electricityOption = { type: "ENTRY", id: "t-elec", subject: "Electricity", date: "2026-09-28", amountPaisa: 710000, month: "2026-09", hidden: false, prefill: "Question about Electricity · September 2026" };

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
  refresh.mockReset();
  vi.mocked(toast).mockReset();
  api.mockReset();
  api.mockImplementation(async (path: string) =>
    path.startsWith("/complaints/links") ? { ok: true, status: 200, data: { items: [electricityOption] } } : { ok: true, status: 200, data: { complaint: detail({ id: "c-new" }) } },
  );
});

const invalidated = vi.spyOn(QueryClient.prototype, "invalidateQueries");
afterEach(() => invalidated.mockClear());
const questionedRefreshed = () => expect(invalidated).toHaveBeenCalledWith({ queryKey: ["complaints", "questioned"] });

describe("complaint list (C1)", () => {
  it("shows the card with tags, chip, comment count and unread dot, and opens the drawer", async () => {
    render(<NoticesView locale="en" data={page({ complaints: { items: [complaint({ unseen: true }), complaint({ id: "c-loan", title: "Can the loan instalment be lowered?", status: "RESOLVED", visibility: "ADMIN", link: null, commentCount: 0 })], more: false } })} />);
    const col = screen.getByRole("region", { name: "Complaints & objections" });
    const card = within(col).getByRole("button", { name: /September electricity bill/ });
    expect(within(card).getByText("In review")).toBeInTheDocument();
    expect(within(card).getByText("Electricity · September 2026")).toBeInTheDocument();
    expect(within(card).getByLabelText("2 comments")).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "New comments" })).toBeInTheDocument();
    const loan = within(col).getByRole("button", { name: /loan instalment/ });
    expect(within(loan).getByText("Admin only")).toBeInTheDocument();
    expect(within(loan).getByText("Resolved")).toBeInTheDocument();
    await userEvent.click(card);
    expect(push).toHaveBeenCalledWith("/en/notices?complaint=c-elec", { scroll: false });
  });

  it("filters by status chips and month, with the filtered empty text", async () => {
    render(<NoticesView locale="en" data={page({ filter: "open", complaints: { items: [], more: false } })} />);
    const nav = screen.getByRole("navigation", { name: "Complaint filters" });
    expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual(["All", "Open", "In review", "Closed", "Mine"]);
    expect(within(nav).getByRole("link", { name: "Open" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Mine" })).toHaveAttribute("href", "/en/notices?filter=mine");
    expect(screen.getByText("No complaints match this filter.")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Month"), "2026-09");
    expect(replace).toHaveBeenCalledWith("/en/notices?filter=open&month=2026-09", { scroll: false });
  });
});

describe("raise a complaint (C2)", () => {
  it("validates, picks a linked entry (pre-filling the title) and posts to everyone", async () => {
    render(<NoticesView locale="en" data={page()} />);
    await userEvent.click(screen.getByRole("button", { name: "Raise a complaint" }));
    const dialog = await screen.findByRole("dialog", { name: "Raise a complaint" });
    expect(within(dialog).getByText("Admin only: just you and the Admin.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Post complaint" }));
    expect(within(dialog).getByText("Add a title.")).toBeInTheDocument();
    expect(within(dialog).getByText("Tell us what's wrong in a few words (at least 10 characters).")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Change" }));
    const types = within(dialog).getByRole("group", { name: "What it is about" });
    expect(within(types).getAllByRole("button").map((t) => t.textContent)).toEqual(["Entry", "Month", "Payment/Advance", "Loan", "Request", "Share change"]);
    expect(within(types).getByRole("button", { name: "Entry" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(await within(dialog).findByRole("button", { name: /Electricity · ৳7,100/ }));
    expect(within(dialog).getByLabelText(/^Title/)).toHaveValue("Question about Electricity · September 2026");
    await userEvent.type(within(dialog).getByLabelText(/What's wrong/), "In March it was ৳4,600.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Post complaint" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/complaints?locale=en", {
        method: "POST",
        body: { title: "Question about Electricity · September 2026", body: "In March it was ৳4,600.", visibility: "ALL", link: { type: "ENTRY", id: "t-elec" } },
      }),
    );
    expect(toast).toHaveBeenCalledWith("Posted · all owners get a short email");
    questionedRefreshed();
    expect(replace).toHaveBeenCalledWith("/en/notices?complaint=c-new", { scroll: false });
  });

  it("shows that link search is running", async () => {
    let finish: (v: ApiResult<unknown>) => void = () => {};
    api.mockImplementation((path: string) =>
      path.startsWith("/complaints/links") ? new Promise((r) => (finish = r)) : Promise.resolve({ ok: true, status: 200, data: { complaint: detail({ id: "c-new" }) } }),
    );
    render(<NoticesView locale="en" data={page()} />);
    await userEvent.click(screen.getByRole("button", { name: "Raise a complaint" }));
    const dialog = await screen.findByRole("dialog", { name: "Raise a complaint" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Change" }));
    expect(await within(dialog).findByRole("status")).toHaveTextContent("Searching…");
    finish({ ok: true, status: 200, data: { items: [electricityOption] } } as ApiResult<unknown>);
    expect(await within(dialog).findByRole("button", { name: /Electricity · ৳7,100/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole("status")).toBeNull();
  });

  it("opens pre-filled from Raise an objection and says it went privately when Admin only", async () => {
    render(<NoticesView locale="en" data={page({ raise: { open: true, link: electricityOption as never } })} />);
    const dialog = await screen.findByRole("dialog", { name: "Raise a complaint" });
    expect(within(dialog).getByLabelText(/^Title/)).toHaveValue("Question about Electricity · September 2026");
    await userEvent.type(within(dialog).getByLabelText(/What's wrong/), "Please check the meter reading.");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Admin only" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Post complaint" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Sent privately to the Admin"));
  });
});

describe("complaint drawer (C3–C7)", () => {
  it("shows the link card, In review note and thread with the Admin tag and status lines", () => {
    render(<NoticesView locale="en" data={page({ detail: detail() })} />);
    const d = screen.getByRole("dialog", { name: "September electricity bill looks high" });
    expect(within(d).getByRole("link", { name: /28 Sept 2026 · Electricity · ৳7,100/ })).toHaveAttribute("href", "/en/entries?period=2026-09&entry=t-elec");
    expect(within(d).getByText("Admin is looking into it")).toBeInTheDocument();
    const items = within(within(d).getByRole("region", { name: "Comments" })).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([expect.stringMatching(/Rayhan Ahmed.*Admin.*Caretaker AC/), expect.stringMatching(/Rayhan Ahmed set this to In review/), expect.stringMatching(/Tanvir Ahmed.*Confirmed/)]);
    expect(within(d).queryByText("Admin · set status")).toBeNull();
  });

  it("sends a comment", async () => {
    render(<NoticesView locale="en" data={page({ detail: detail() })} />);
    const d = screen.getByRole("dialog", { name: /electricity/ });
    await userEvent.type(within(d).getByLabelText("Add a comment"), "Thanks for checking.");
    await userEvent.click(within(d).getByRole("button", { name: "Send" }));
    expect(api).toHaveBeenCalledWith("/complaints/c-elec/comments?locale=en", { method: "POST", body: { body: "Thanks for checking." } });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("refuses Resolve without an explanation, then resolves", async () => {
    render(<NoticesView locale="en" data={adminPage({ detail: detail({ actions: { comment: true, withdraw: false, reopen: false, publish: false, decide: true, hide: true } }) })} />);
    const d = screen.getByRole("dialog", { name: /electricity/ });
    await userEvent.click(within(d).getByRole("button", { name: "Resolve" }));
    expect(within(d).getByText("Write the explanation first — the complainant receives it.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalledWith(expect.stringContaining("/status"), expect.anything());
    await userEvent.type(within(d).getByLabelText(/Explanation/), "Caretaker AC during the heat wave.");
    await userEvent.click(within(d).getByRole("button", { name: "Resolve" }));
    expect(api).toHaveBeenCalledWith("/complaints/c-elec/status?locale=en", { method: "PATCH", body: { status: "RESOLVED", explanation: "Caretaker AC during the heat wave." } });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Status updated · Resolved"));
    questionedRefreshed();
    expect(within(d).getAllByRole("button", { name: "Hide" })).toHaveLength(2);
  });

  it("asks before withdrawing and requires a reason to reopen", async () => {
    const { unmount } = render(<NoticesView locale="en" data={page({ detail: detail({ mine: true, actions: { comment: true, withdraw: true, reopen: false, publish: false, decide: false, hide: false } }) })} />);
    await userEvent.click(screen.getByRole("button", { name: "Withdraw my complaint" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Withdraw this complaint?" });
    expect(within(confirm).getByText("It closes and stays visible as Withdrawn.")).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Withdraw" }));
    expect(api).toHaveBeenCalledWith("/complaints/c-elec/withdraw?locale=en", { method: "POST", body: {} });
    unmount();
    render(
      <NoticesView
        locale="en"
        data={page({ detail: detail({ status: "RESOLVED", mine: true, resolution: { note: "Kept as is.", byName: "Rayhan Ahmed", at: "2026-10-06T06:00:00.000Z", fix: null }, actions: { comment: false, withdraw: false, reopen: true, publish: false, decide: false, hide: false } }) })}
      />,
    );
    const d = screen.getByRole("dialog", { name: /electricity/ });
    expect(within(d).getByRole("region", { name: "Admin's resolution" })).toHaveTextContent("Kept as is.");
    expect(within(d).queryByLabelText("Add a comment")).toBeNull();
    await userEvent.click(within(d).getByRole("button", { name: "Reopen" }));
    const ask = await screen.findByRole("alertdialog", { name: "Reopen this complaint?" });
    expect(within(ask).getByRole("button", { name: "Reopen" })).toBeDisabled();
    await userEvent.type(within(ask).getByLabelText(/Why isn't this resolved/), "Still too high.");
    await userEvent.click(within(ask).getByRole("button", { name: "Reopen" }));
    expect(api).toHaveBeenCalledWith("/complaints/c-elec/reopen?locale=en", { method: "POST", body: { comment: "Still too high." } });
  });

  it("marks the thread seen when opened with unseen comments, and shows hidden comments by reason", async () => {
    const hidden = detail({
      unseen: true,
      thread: [{ kind: "comment", id: "cm-9", authorId: "u-x", authorName: "Tanvir Ahmed", isAdmin: false, body: null, hiddenReason: "Personal remark", createdAt: "2026-10-05T06:00:00.000Z", editedAt: null, attachments: [], editableUntil: null }],
    });
    render(<NoticesView locale="en" data={page({ detail: hidden })} />);
    await waitFor(() => expect(api).toHaveBeenCalledWith("/complaints/c-elec/seen", { method: "POST" }));
    expect(screen.getByText("Hidden by Admin: Personal remark")).toBeInTheDocument();
  });

  it("offers Edit on own fresh comments only", () => {
    const fresh = new Date(Date.now() + 10 * 60_000).toISOString();
    const d = detail({ thread: [{ kind: "comment", id: "cm-5", authorId: "me", authorName: "Me", isAdmin: false, body: "Typo heer", hiddenReason: null, createdAt: new Date().toISOString(), editedAt: null, attachments: [], editableUntil: fresh }] });
    render(<NoticesView locale="en" data={page({ detail: d })} />);
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
