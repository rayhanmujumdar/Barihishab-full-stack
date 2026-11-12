import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { resetRateLimits } from "./db";
import { ADMIN } from "./global-setup";

// One story through the Notices & Complaints PRD §13 acceptance criteria.
// Runs after income-expenses.spec.ts (files run in order, one worker): ADMIN
// and the "nasrin" Owner are active, the current month has generated rent.
// Ends state-neutral for later specs: every notice it publishes is unpinned
// and archived, every complaint is closed, and both users have seen every
// thread (no Home block, desk count or nav badge left behind).
test.describe.configure({ mode: "serial" });

const OWNER = { username: "nasrin", password: "Nasrin!ledger-42" };
const TITLE = "Water tank cleaning — Sunday";
const BODY =
  "Supply will be off from **10 am to 2 pm** while the roof tank is cleaned.\n- Store water the night before\n- Keep the pump switched off\nThe caretaker checks every flat's tap afterwards and reports any leaks.";

let admin: Page;
let owner: Page;
const complaintIds: string[] = [];

async function loggedIn(browser: Browser, identifier: string, password: string): Promise<BrowserContext> {
  const baseURL = test.info().project.use.baseURL!;
  const context = await browser.newContext({ baseURL });
  const res = await context.request.post("/api/v1/auth/login", { data: { identifier, password, remember: false }, headers: { origin: new URL(baseURL).origin } });
  expect(res.status(), `${identifier} onboarded by earlier specs`).toBe(200);
  return context;
}

async function write(page: Page, path: string, data: unknown = {}) {
  const baseURL = test.info().project.use.baseURL!;
  const csrf = (await page.context().cookies()).find((c) => c.name === "bh_csrf")!.value;
  return page.context().request.post(`/api/v1${path}`, { data, headers: { origin: new URL(baseURL).origin, "x-csrf-token": csrf } });
}

const sidebarNotices = (page: Page) => page.getByRole("navigation").getByRole("link", { name: /^Notices/ }).first();
async function complaintId(page: Page): Promise<string> {
  await expect(page).toHaveURL(/[?&]complaint=[0-9a-f-]{36}/);
  return new URL(page.url()).searchParams.get("complaint")!;
}
const drawer = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });

test.beforeAll(async ({ browser }) => {
  await resetRateLimits();
  admin = await (await loggedIn(browser, ADMIN.username, ADMIN.password)).newPage();
  owner = await (await loggedIn(browser, OWNER.username, OWNER.password)).newPage();
});

test.afterAll(async () => {
  // Safety net if a step failed midway: no live notice may stay on Home for later specs.
  const live = await admin.context().request.get("/api/v1/notices");
  for (const n of ((await live.json()).data?.items ?? []) as { id: string }[]) await write(admin, `/notices/${n.id}/archive`);
  // Leave nothing unseen behind for the visual and Home specs.
  for (const id of complaintIds) {
    await write(admin, `/complaints/${id}/seen`);
    await write(owner, `/complaints/${id}/seen`).catch(() => undefined);
  }
  await admin?.context().close();
  await owner?.context().close();
  await resetRateLimits();
});

test("the Super Admin publishes an urgent pinned notice; it reaches the owner's Home and badge (N1, N2, N5)", async () => {
  await admin.goto("/en/notices");
  await expect(admin.getByRole("heading", { level: 1, name: "Notices & complaints" })).toBeVisible();
  await expect(admin.getByText("No notices yet.")).toBeVisible();
  await admin.getByRole("button", { name: "New notice" }).first().click();
  const dialog = admin.getByRole("dialog", { name: "New notice" });
  await dialog.getByRole("button", { name: "Publish & email" }).click();
  await expect(dialog.getByText("Add a title.")).toBeVisible();
  await dialog.getByLabel(/^Title/).fill(TITLE);
  await dialog.getByLabel(/^Message/).fill(BODY);
  await dialog.getByRole("radio", { name: "Urgent" }).click();
  await expect(dialog.getByText(/^Emails \d+ active members on publish · subject starts with \[Urgent\]$/)).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Pin on everyone's dashboard" }).click();
  await dialog.getByRole("button", { name: "Publish & email" }).click();
  await expect(admin.getByText(/^Published · emailed to \d+ active members$/)).toBeVisible();
  const card = admin.getByRole("article", { name: TITLE });
  await expect(card.getByText("Urgent")).toBeVisible();
  await expect(card.getByText("Pinned")).toBeVisible();
  await expect(card.getByText("New")).toHaveCount(0);
  await expect(card.getByText(/· 1 of \d+ read$/)).toBeVisible();

  await owner.goto("/en");
  const pinned = owner.getByRole("region", { name: "Pinned notices" });
  await expect(pinned.getByRole("link", { name: TITLE })).toBeVisible();
  await expect(pinned.getByRole("img", { name: "Unread" })).toBeVisible();
  await expect(sidebarNotices(owner)).toContainText("1");
});

test("Who has read lists the owner as Not yet and Remind unread works once a day (N4, G6)", async () => {
  await admin.getByRole("button", { name: `Actions for ${TITLE}` }).click();
  await admin.getByRole("menuitem", { name: "Who has read" }).click();
  const sheet = admin.getByRole("dialog", { name: "Who has read" });
  await expect(sheet.getByRole("region", { name: "Not yet" })).toContainText(/nasrin/i);
  await sheet.getByRole("button", { name: "Remind unread" }).click();
  await expect(admin.getByText(/^Reminder sent to \d+ members who haven't read it$/)).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
});

test("Read more on Home records the read; the dot and badge go (N4, Rule 4)", async () => {
  const pinned = owner.getByRole("region", { name: "Pinned notices" });
  await pinned.getByRole("button", { name: "Read more" }).click();
  await expect(pinned.getByRole("img", { name: "Unread" })).toHaveCount(0);
  await expect(sidebarNotices(owner)).toHaveText(/^Notices$/);
  await owner.goto("/en/notices");
  await expect(owner.getByRole("article", { name: TITLE }).getByText(/· 2 of \d+ read$/)).toBeVisible();
  await expect(owner.getByRole("button", { name: "New notice" })).toHaveCount(0);
  await expect(owner.getByRole("button", { name: `Actions for ${TITLE}` })).toHaveCount(0);
});

test("an edit shows Edited; archiving asks first and moves it to Archived notices (N3)", async () => {
  await admin.goto("/en/notices");
  await admin.getByRole("button", { name: `Actions for ${TITLE}` }).click();
  await admin.getByRole("menuitem", { name: "Edit" }).click();
  const dialog = admin.getByRole("dialog", { name: "Edit notice" });
  await dialog.getByLabel(/^Message/).fill(`${BODY}\nBring buckets.`);
  await dialog.getByRole("checkbox", { name: "Email the change" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByText("Notice saved")).toBeVisible();
  await expect(admin.getByRole("article", { name: TITLE }).getByText(/^Edited /)).toBeVisible();

  await admin.getByRole("button", { name: `Actions for ${TITLE}` }).click();
  await admin.getByRole("menuitem", { name: "Unpin" }).click();
  await expect(admin.getByText("Unpinned")).toBeVisible();
  // The refreshed list re-sorts the card; act on it once it has settled.
  await expect(admin.getByRole("article", { name: TITLE }).getByText("Pinned", { exact: true })).toHaveCount(0);
  await admin.getByRole("button", { name: `Actions for ${TITLE}` }).click();
  await admin.getByRole("menuitem", { name: "Archive" }).click();
  const confirm = admin.getByRole("alertdialog", { name: "Archive this notice?" });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(admin.getByRole("article", { name: TITLE })).toBeVisible();
  await admin.getByRole("button", { name: `Actions for ${TITLE}` }).click();
  await admin.getByRole("menuitem", { name: "Archive" }).click();
  await admin.getByRole("alertdialog", { name: "Archive this notice?" }).getByRole("button", { name: "Archive" }).click();
  await expect(admin.getByText("Archived · removed from everyone's list and Home")).toBeVisible();
  await expect(admin.getByRole("article", { name: TITLE })).toHaveCount(0);
  await admin.getByRole("link", { name: "Archived notices" }).click();
  await expect(admin.getByRole("article", { name: TITLE })).toBeVisible();

  await owner.goto("/en");
  await expect(owner.getByRole("region", { name: "Pinned notices" }).getByText("No pinned notices.")).toBeVisible();
});

test("an owner raises an objection from an entry; it is Questioned until resolved (C2, C4, C8, flow E)", async () => {
  await owner.goto("/en/entries");
  await owner.locator("button.entry-row").first().click();
  const detail = owner.getByRole("dialog").filter({ has: owner.getByRole("link", { name: "Raise an objection" }) });
  await detail.getByRole("link", { name: "Raise an objection" }).click();
  const form = owner.getByRole("dialog", { name: "Raise a complaint" });
  await expect(form.getByLabel(/^Title/)).toHaveValue(/^Question about .+ · .+ \d{4}$/);
  const title = await form.getByLabel(/^Title/).inputValue();
  await form.getByRole("button", { name: "Post complaint" }).click();
  await expect(form.getByText("Tell us what's wrong in a few words (at least 10 characters).")).toBeVisible();
  await form.getByLabel(/What's wrong/).fill("The amount doesn't match the tenant's receipt.");
  await form.getByRole("button", { name: "Post complaint" }).click();
  await expect(owner.getByText("Posted · all owners get a short email")).toBeVisible();
  await expect(drawer(owner, title)).toBeVisible();
  const id = await complaintId(owner);
  complaintIds.push(id);

  await owner.goto("/en/entries");
  await expect(owner.locator("button.entry-row").first()).toContainText("Questioned");

  await admin.goto(`/en/notices?complaint=${id}`);
  const d = drawer(admin, title);
  await d.getByRole("button", { name: "In review" }).click();
  await expect(admin.getByText("Status updated · In review")).toBeVisible();
  await expect(d.getByText("Admin is looking into it")).toBeVisible();
  await d.getByLabel("Add a comment").fill("Checking the receipt book now.");
  await d.getByRole("button", { name: "Send" }).click();
  await expect(d.getByRole("region", { name: "Comments" })).toContainText("Checking the receipt book now.");
  await d.getByRole("button", { name: "Resolve" }).click();
  await expect(d.getByText("Write the explanation first — the complainant receives it.")).toBeVisible();
  await d.getByLabel(/Explanation/).fill("Receipt matches; the tenant paid in two parts.");
  await d.getByRole("button", { name: "Resolve" }).click();
  await expect(admin.getByText("Status updated · Resolved")).toBeVisible();
  await expect(d.getByRole("region", { name: "Admin's resolution" })).toContainText("Receipt matches");

  await owner.goto("/en/entries");
  await expect(owner.locator("button.entry-row").first()).not.toContainText("Questioned");
});

test("the complainant reopens once with a comment; it goes back to Open (C6)", async () => {
  const id = complaintIds[0];
  await owner.goto(`/en/complaints/${id}`);
  await expect(owner).toHaveURL(new RegExp(`/en/notices\\?complaint=${id}$`));
  const d = owner.getByRole("dialog").filter({ has: owner.getByRole("region", { name: "Admin's resolution" }) });
  await expect(d.getByLabel("Add a comment")).toHaveCount(0);
  await d.getByRole("button", { name: "Reopen" }).click();
  const ask = owner.getByRole("alertdialog", { name: "Reopen this complaint?" });
  await expect(ask.getByRole("button", { name: "Reopen" })).toBeDisabled();
  await ask.getByLabel(/Why isn't this resolved/).fill("The second part never reached the fund.");
  await ask.getByRole("button", { name: "Reopen" }).click();
  await expect(owner.getByText("Reopened", { exact: true }).first()).toBeVisible();
  await expect(owner.getByRole("dialog").getByText("Open", { exact: true }).first()).toBeVisible();

  // Close it again so nothing is left open.
  await admin.goto(`/en/notices?complaint=${id}`);
  const ad = admin.getByRole("dialog").filter({ has: admin.getByRole("heading", { name: "Admin · set status" }) });
  await ad.getByLabel(/Explanation/).fill("Second part found in the bank statement.");
  await ad.getByRole("button", { name: "Reject" }).click();
  await expect(admin.getByText("Status updated · Rejected")).toBeVisible();
});

test("an Admin-only complaint is invisible to other owners until its author makes it public; withdraw asks first (Rule 8, G15, C5)", async () => {
  await admin.goto("/en/notices");
  await admin.getByRole("button", { name: "Raise a complaint" }).click();
  const form = admin.getByRole("dialog", { name: "Raise a complaint" });
  await form.getByLabel(/^Title/).fill("Lift contract renewal");
  await form.getByLabel(/What's wrong/).fill("The quote looks high; checking privately first.");
  await form.getByRole("radio", { name: "Admin only" }).click();
  await form.getByRole("button", { name: "Post complaint" }).click();
  await expect(admin.getByText("Sent privately to the Admin")).toBeVisible();
  const id = await complaintId(admin);
  complaintIds.push(id);

  await owner.goto("/en/notices?tab=complaints");
  await expect(owner.getByRole("region", { name: "Complaints & objections" })).toBeVisible();
  await expect(owner.getByRole("button", { name: /Lift contract renewal/ })).toHaveCount(0);
  await owner.goto(`/en/complaints/${id}`);
  await expect(owner).toHaveURL(/\/en\/notices\?complaint=/);
  await expect(owner.getByRole("dialog", { name: "Lift contract renewal" })).toHaveCount(0);

  await admin.goto(`/en/notices?complaint=${id}`);
  const d = drawer(admin, "Lift contract renewal");
  await d.getByRole("button", { name: "Make visible to everyone" }).click();
  await admin.getByRole("alertdialog", { name: "Make this visible to everyone?" }).getByRole("button", { name: "Make visible" }).click();
  await expect(admin.getByText("Visible to everyone", { exact: true })).toBeVisible();
  await owner.goto("/en/notices?tab=complaints");
  await expect(owner.getByRole("button", { name: /Lift contract renewal/ })).toBeVisible();

  await d.getByRole("button", { name: "Withdraw my complaint" }).click();
  const confirm = admin.getByRole("alertdialog", { name: "Withdraw this complaint?" });
  await expect(confirm.getByText("It closes and stays visible as Withdrawn.")).toBeVisible();
  await confirm.getByRole("button", { name: "Withdraw" }).click();
  await expect(admin.getByText("Withdrawn", { exact: true }).first()).toBeVisible();
});

test("Notices and Complaints are separate tabs; at 360px in Bangla the drawer fills the screen (§13 General)", async () => {
  await owner.setViewportSize({ width: 360, height: 780 });
  await owner.goto("/bn/notices");
  await expect(owner.getByRole("heading", { level: 1, name: "নোটিশ ও অভিযোগ" })).toBeVisible();
  const tabs = owner.getByRole("navigation", { name: "বিভাগ" });
  await expect(tabs.getByRole("link", { name: /^নোটিশ/ })).toHaveAttribute("aria-current", "page");
  await expect(owner.getByRole("region", { name: "নোটিশ" })).toBeVisible();
  await expect(owner.getByRole("region", { name: "অভিযোগ ও আপত্তি" })).toHaveCount(0);

  await tabs.getByRole("link", { name: "অভিযোগ ও আপত্তি" }).click();
  await expect(owner).toHaveURL(/\/bn\/notices\?tab=complaints$/);
  const complaints = owner.getByRole("region", { name: "অভিযোগ ও আপত্তি" });
  await expect(complaints).toBeVisible();
  await expect(owner.getByRole("region", { name: "নোটিশ" })).toHaveCount(0);
  expect(await owner.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await complaints.getByRole("button").first().click();
  await expect(owner).toHaveURL(/tab=complaints&complaint=/);
  const d = owner.getByRole("dialog").first();
  await expect(d).toBeVisible();
  expect((await d.boundingBox())!.width).toBeGreaterThanOrEqual(359);
  await owner.setViewportSize({ width: 1280, height: 720 });
});
