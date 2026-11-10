import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { openMonths, resetRateLimits, setPeriodStatus } from "./db";
import { ADMIN } from "./global-setup";

// One story through the Requests PRD §12 acceptance criteria. Runs after
// period-distribution.spec.ts (files run in order, one worker): owners Nasrin
// (login), Rayhan (the Super Admin) and Tanvir (no login), the current month
// open. Ends state-neutral for visual.spec.ts: the advance and the grant it
// pays out are voided and every request left open is cancelled or withdrawn.
test.describe.configure({ mode: "serial" });

const OWNER = { username: "nasrin", password: "Nasrin!ledger-42" };
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

let admin: Page;
let owner: Page;
let advanceId = "";
let grantId = "";

async function loggedIn(browser: Browser, identifier: string, password: string): Promise<BrowserContext> {
  const baseURL = test.info().project.use.baseURL!;
  const context = await browser.newContext({ baseURL });
  const res = await context.request.post("/api/v1/auth/login", { data: { identifier, password, remember: false }, headers: { origin: new URL(baseURL).origin } });
  expect(res.status(), `${identifier} onboarded by earlier specs`).toBe(200);
  return context;
}

async function write(page: Page, path: string, data: unknown, headers: Record<string, string> = {}) {
  const baseURL = test.info().project.use.baseURL!;
  const csrf = (await page.context().cookies()).find((c) => c.name === "bh_csrf")!.value;
  return page.context().request.post(`/api/v1${path}`, { data, headers: { origin: new URL(baseURL).origin, "x-csrf-token": csrf, ...headers } });
}

const card = (scope: Page | Locator, name: RegExp | string) => scope.getByRole("article", { name });
const section = (page: Page, name: string) => page.getByRole("region", { name });
const tabs = (page: Page) => page.getByRole("navigation", { name: "Request sections" });
const openTab = async (page: Page, name: RegExp) => {
  await tabs(page).getByRole("link", { name }).click();
  await expect(tabs(page).getByRole("link", { name })).toHaveAttribute("aria-current", "page");
};

async function ask(page: Page, opts: { type?: "Advance" | "Loan" | "Special grant"; amount: string; reason: string; plan?: string; file?: boolean }) {
  await page.getByRole("button", { name: "Request money" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Request money" });
  if (opts.type) await dialog.getByRole("radio", { name: opts.type }).click();
  await dialog.getByLabel("Amount (৳)").fill(opts.amount);
  await dialog.getByLabel("What is it for?").fill(opts.reason);
  if (opts.plan) await dialog.getByLabel("Repayment plan").fill(opts.plan);
  if (opts.file) {
    await dialog.getByTestId("bill-input").setInputFiles({ name: "estimate.png", mimeType: "image/png", buffer: PNG_1PX });
    await expect(dialog.getByText("Uploading…")).toHaveCount(0);
    await expect(dialog.getByRole("img", { name: "estimate.png" })).toBeVisible();
  }
  await dialog.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Request sent · the Admin has been emailed")).toBeVisible();
  await expect(dialog).toBeHidden();
}

test.beforeAll(async ({ browser }) => {
  await resetRateLimits();
  admin = await (await loggedIn(browser, ADMIN.username, ADMIN.password)).newPage();
  owner = await (await loggedIn(browser, OWNER.username, OWNER.password)).newPage();
});

test.afterAll(async () => {
  await admin?.context().close();
  await owner?.context().close();
  await resetRateLimits();
});

test("an owner asks for an advance with a file; it is numbered and pending (F1, F2, F15)", async () => {
  await owner.goto("/en/requests");
  await expect(owner.getByRole("heading", { level: 1, name: "Requests" })).toBeVisible();
  await expect(tabs(owner).getByRole("link", { name: "My requests" })).toHaveAttribute("aria-current", "page");
  await expect(owner.getByText("No requests yet.")).toBeVisible();
  await openTab(owner, /Paid out to owners/);
  await expect(owner.getByText("Nothing has been paid out through requests yet.")).toBeVisible();
  await openTab(owner, /My requests/);

  await owner.getByRole("button", { name: "Request money" }).first().click();
  const dialog = owner.getByRole("dialog", { name: "Request money" });
  await expect(dialog.getByText("Taken from your future entitlements automatically. No repayment needed.")).toBeVisible();
  await dialog.getByRole("button", { name: "Submit request" }).click();
  await expect(dialog.getByText("Enter an amount greater than zero.")).toBeVisible();
  await expect(dialog.getByText("Tell everyone what it is for.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await ask(owner, { amount: "10000", reason: "Cataract surgery deposit at Ispahani Eye Hospital", file: true });
  const mine = card(owner, /৳10,000 · Advance/);
  await expect(mine).toContainText("Pending");
  await expect(mine).toContainText(/R-\d{4}-\d{3}/);
  await expect(mine.getByRole("button", { name: "Approve" })).toHaveCount(0);
  const list = (await owner.request.get("/api/v1/requests").then((r) => r.json())).data;
  advanceId = list.mine.find((r: { amountRequestedPaisa: number }) => r.amountRequestedPaisa === 1000000).id;
});

test("the Super Admin sees it on Home and in the queue with context, and approves a lower amount (F4, F5, F14)", async () => {
  await admin.goto("/en");
  await expect(admin.getByText("Pending requests")).toBeVisible();
  await expect(admin.getByRole("link", { name: /Requests/ }).first()).toContainText("1");
  await admin.getByRole("link", { name: "Review queue" }).click();
  await expect(admin).toHaveURL(/\/en\/requests$/);
  const decide = section(admin, "Needs your decision");
  const c = card(decide, /৳10,000 · Advance/);
  await expect(c).toContainText("Nasrin Ahmed");
  await expect(c).toContainText("Their balance");
  await expect(c).toContainText("House fund");

  await c.getByRole("button", { name: "Approve" }).click();
  const dialog = admin.getByRole("dialog", { name: /^Approve R-/ });
  await expect(dialog).toContainText("Nasrin Ahmed asked for ৳10,000 (Advance). You may approve a lower amount.");
  await dialog.getByLabel("Approved amount (৳)").fill("6000");
  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect(dialog.getByText("Explain why the amount is lower.")).toBeVisible();
  await dialog.getByLabel("Note to requester").fill("Reduced — bank balance is low until rent clears");
  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("Approved · requester emailed")).toBeVisible();
  await expect(tabs(admin).getByRole("link", { name: /Approved · awaiting cash/ })).toContainText("1");
  await openTab(admin, /Approved · awaiting cash/);
  const approved = card(section(admin, "Approved · awaiting cash"), /৳10,000 · Advance/);
  await expect(approved).toContainText("Approved ৳6,000");
});

test("the owner sees the decision and can't decide or pay out (Rule 12, §12 General)", async () => {
  await owner.goto("/en/requests");
  const mine = card(owner, /৳10,000 · Advance/);
  await expect(mine).toContainText("Approved · awaiting cash");
  await expect(mine).toContainText("Admin: Reduced — bank balance is low until rent clears");
  for (const name of ["Approve", "Reject", "Withdraw approval", /Disburse/]) await expect(owner.getByRole("button", { name })).toHaveCount(0);
  expect((await write(owner, `/requests/${advanceId}/approve`, {})).status()).toBe(403);
  expect((await write(owner, `/requests/${advanceId}/disburse`, { date: "2026-01-01", fundAccountId: advanceId, method: "CASH" }, { "idempotency-key": "e2e-owner-disburse" })).status()).toBe(403);
});

test("disbursing posts the advance, linked to the request (F7, F9)", async () => {
  await admin.goto("/en/requests?tab=approved");
  const c = card(section(admin, "Approved · awaiting cash"), /৳10,000 · Advance/);
  await c.getByRole("button", { name: "Disburse · posts an advance" }).click();
  const dialog = admin.getByRole("dialog", { name: "Disburse · posts an advance" });
  await expect(dialog).toContainText("৳6,000");
  await dialog.getByRole("radio", { name: "bKash" }).click();
  await dialog.getByRole("button", { name: "Disburse" }).click();
  await expect(dialog.getByText("Add the bKash TrxID, Nagad TrxID or cheque number.")).toBeVisible();
  await dialog.getByLabel(/Reference/).fill("TrxID 8K2");
  await dialog.getByRole("button", { name: "Disburse" }).click();
  await expect(admin.getByText("Disbursed · entry created · all owners emailed")).toBeVisible();
  await openTab(admin, /History/);
  const done = card(section(admin, "History"), /৳10,000 · Advance/);
  await expect(done).toContainText("Disbursed");

  await done.getByRole("button", { name: /৳10,000 · Advance/ }).click();
  const sheet = admin.getByRole("dialog", { name: /R-\d{4}-\d{3} · Nasrin Ahmed/ });
  await expect(sheet).toContainText("Advance on Nasrin Ahmed's statement");
  await expect(sheet).toContainText("Disbursed · ৳6,000");
  await expect(sheet).toContainText("bKash · TrxID 8K2");
  // Photos are compressed to JPEG before upload (attachments spec).
  await expect(sheet.getByRole("button", { name: "Open estimate.jpg" })).toBeVisible();
  await admin.keyboard.press("Escape");

  await admin.goto("/en/advances?tab=advances");
  await expect(admin.getByText(/From request R-\d{4}-\d{3}/).first()).toBeVisible();
});

test("a special grant recorded for an owner without login books an expense everyone sees (F7, F11, F12)", async () => {
  await admin.goto("/en/requests");
  await admin.getByRole("button", { name: "More request actions" }).click();
  await admin.getByRole("menuitem", { name: "Record request for…" }).click();
  const dialog = admin.getByRole("dialog", { name: "Record request for an owner" });
  await dialog.getByLabel("Owner").selectOption({ label: "Tanvir Ahmed" });
  await dialog.getByRole("radio", { name: "Special grant" }).click();
  await expect(dialog.getByText(/Non-refundable. Booked as a house expense/)).toBeVisible();
  await dialog.getByLabel("Amount (৳)").fill("1000");
  await dialog.getByLabel("What is it for?").fill("Medical bills after the accident");
  await dialog.getByRole("button", { name: "Submit request" }).click();
  await expect(admin.getByText("Request sent · the Admin has been emailed")).toBeVisible();

  const c = card(section(admin, "Needs your decision"), /৳1,000 · Special grant/);
  await expect(c).toContainText("Recorded by");
  await expect(c).toContainText(/Distributable for .* drops by about/);
  await c.getByRole("button", { name: "Approve" }).click();
  const approve = admin.getByRole("dialog", { name: /^Approve R-/ });
  await approve.getByLabel("Approve and disburse now").click();
  await approve.getByRole("button", { name: "Approve" }).click();
  const disburse = admin.getByRole("dialog", { name: "Disburse · books an expense" });
  await expect(disburse).toContainText("Booked to");
  await disburse.getByRole("button", { name: "Disburse" }).click();
  await expect(admin.getByText("Disbursed · entry created · all owners emailed")).toBeVisible();
  grantId = (await admin.request.get("/api/v1/requests?type=GRANT").then((r) => r.json())).data.history[0].id;

  // Nasrin sees Tanvir's paid-out grant, with public fields only.
  await owner.goto("/en/requests?tab=paid");
  const paid = section(owner, "Paid out to owners");
  await expect(card(paid, /৳1,000 · Special grant/)).toContainText("Tanvir Ahmed");
  await expect(card(paid, /৳1,000 · Special grant/)).toContainText("Medical bills after the accident");

  // In Income & Expenses: linked back, voidable but not correctable (Rule 14).
  const detail = (await admin.request.get(`/api/v1/requests/${grantId}`).then((r) => r.json())).data;
  const month: string = detail.request.linkedEntry.month;
  await admin.goto(`/en/entries?period=${month}&type=EXPENSE&category=OWNER_GRANT`);
  await admin.getByText(/Owner special grant · Tanvir Ahmed · R-/).first().click();
  const drawer = admin.getByRole("dialog").filter({ hasText: "Owner special grant" });
  await expect(drawer.getByRole("link", { name: /From request R-/ })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Correct" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Void" })).toBeVisible();
});

test("a rejected loan shows the reason to the requester (F6)", async () => {
  await ask(owner, { type: "Loan", amount: "20000", reason: "Home renovation before winter", plan: "৳4,000 per month from entitlement" });
  await admin.goto("/en/requests");
  const c = card(section(admin, "Needs your decision"), /৳20,000 · Loan/);
  await expect(c).toContainText("The plan finishes within 24 months.");
  await c.getByRole("button", { name: "Reject" }).click();
  const dialog = admin.getByRole("alertdialog");
  await expect(dialog).toContainText("Nasrin Ahmed is emailed with your reason.");
  await expect(dialog.getByRole("button", { name: "Reject request" })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("Existing loan still has money outstanding");
  await dialog.getByRole("button", { name: "Reject request" }).click();
  await expect(admin.getByText("Request rejected · requester emailed")).toBeVisible();

  await owner.goto("/en/requests");
  const mine = card(owner, /৳20,000 · Loan/);
  await expect(mine).toContainText("Rejected");
  await expect(mine).toContainText("Admin: Existing loan still has money outstanding");
});

test("the requester cancels a pending request after confirming (F3)", async () => {
  await ask(owner, { amount: "500", reason: "Bus fare for the family visit" });
  const mine = card(owner, /৳500 · Advance/);
  await mine.getByRole("button", { name: "Cancel request" }).click();
  const confirm = owner.getByRole("alertdialog");
  await expect(confirm).toContainText("The Admin is told.");
  await confirm.getByRole("button", { name: "Cancel request" }).click();
  await expect(owner.getByText("Request cancelled")).toBeVisible();
  await expect(card(owner, /৳500 · Advance/)).toContainText("Cancelled");
});

test("without an open month Disburse is disabled (G13)", async () => {
  await ask(owner, { amount: "700", reason: "School books for the new term" });
  const id = (await owner.request.get("/api/v1/requests").then((r) => r.json())).data.mine.find((r: { amountRequestedPaisa: number }) => r.amountRequestedPaisa === 70000).id;
  expect((await write(admin, `/requests/${id}/approve`, {})).status()).toBe(200);
  const open = await openMonths();
  try {
    for (const m of open) await setPeriodStatus(m, "CLOSED");
    await admin.goto("/en/requests?tab=approved");
    const c = card(section(admin, "Approved · awaiting cash"), /৳700 · Advance/);
    await expect(c.getByRole("button", { name: "Disburse · posts an advance" })).toBeDisabled();
    await expect(c).toContainText("Open a month first — payouts are recorded in an open month.");
  } finally {
    for (const m of open) await setPeriodStatus(m, "OPEN");
  }
  expect((await write(admin, `/requests/${id}/withdraw`, { reason: "E2E: leave nothing waiting" })).status()).toBe(200);
});

test("in বাংলা at 360px the owner's requests fit with no sideways scroll (§12 General)", async () => {
  await owner.setViewportSize({ width: 360, height: 780 });
  await owner.goto("/bn/requests");
  await expect(owner.getByRole("heading", { level: 1, name: "অনুরোধ" })).toBeVisible();
  const bnTabs = owner.getByRole("navigation", { name: "অনুরোধের অংশ" });
  await expect(bnTabs.getByRole("link", { name: "আমার অনুরোধ" })).toHaveAttribute("aria-current", "page");
  await bnTabs.getByRole("link", { name: "মালিকদের দেওয়া হয়েছে" }).click();
  await expect(bnTabs.getByRole("link", { name: "মালিকদের দেওয়া হয়েছে" })).toHaveAttribute("aria-current", "page");
  await expect(owner.getByText(/দেওয়া হয়েছে [০-৯]/).first()).toBeVisible();
  await expect(owner.getByText(/R-[০-৯]{4}-[০-৯]{3}/).first()).toBeVisible();
  const overflow = await owner.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await owner.screenshot({ path: ".context/screens/mobile-bn-requests.png", fullPage: true });
  await owner.setViewportSize({ width: 1280, height: 800 });
});

test("cleanup: the advance and the grant are voided so balances and totals are back where they were", async () => {
  const advance = (await admin.request.get(`/api/v1/requests/${advanceId}`).then((r) => r.json())).data.request.linkedEntry;
  expect((await write(admin, `/ledger/${advance.id}/void`, { reason: "E2E: undo the request advance" })).status()).toBe(200);
  const grant = (await admin.request.get(`/api/v1/requests/${grantId}`).then((r) => r.json())).data.request.linkedEntry;
  expect((await write(admin, `/transactions/${grant.id}/void`, { reason: "E2E: undo the request grant" })).status()).toBe(200);
  await admin.goto("/en/requests");
  await expect(admin.getByText("No requests waiting. Owners' new requests land here and you get an email.")).toBeVisible();
  await openTab(admin, /History/);
  await expect(admin.getByText("Entry voided").first()).toBeVisible();
});
