import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { resetRateLimits } from "./db";
import { ADMIN } from "./global-setup";

// One story through the Advances & Loans PRD §12 acceptance criteria. Runs
// after owners.spec.ts (files run in order, one worker), which left Nasrin
// (linked Owner), Rayhan (the Super Admin) and Tanvir (balance ৳100) with no
// loans and no closed month with entitlements (so no advance limit yet).
// It ends state-neutral for period-distribution.spec.ts: every loan it opens is
// repaid in cash or cancelled and the advance is voided.
test.describe.configure({ mode: "serial" });

const OWNER = { username: "nasrin", password: "Nasrin!ledger-42" };

let admin: Page;
let l1 = "";

async function loggedIn(browser: Browser, identifier: string, password: string): Promise<BrowserContext> {
  const baseURL = test.info().project.use.baseURL!;
  const context = await browser.newContext({ baseURL });
  const res = await context.request.post("/api/v1/auth/login", { data: { identifier, password, remember: false }, headers: { origin: new URL(baseURL).origin } });
  expect(res.status(), `${identifier} onboarded by earlier specs`).toBe(200);
  return context;
}

async function write(context: BrowserContext, path: string, data: unknown, headers: Record<string, string> = {}) {
  const baseURL = test.info().project.use.baseURL!;
  const csrf = (await context.cookies()).find((c) => c.name === "bh_csrf")!.value;
  return context.request.post(`/api/v1${path}`, { data, headers: { origin: new URL(baseURL).origin, "x-csrf-token": csrf, ...headers } });
}

const tiles = (page: Page) => page.getByRole("region", { name: "Summary" });
const loanCard = (page: Page, title: string) => page.getByRole("article", { name: title });

test.afterAll(async () => {
  await admin?.context().close();
});

test("the Super Admin finds Advances & loans in the navigation and an empty loan list (F1, F2)", async ({ browser }) => {
  admin = await (await loggedIn(browser, ADMIN.username, ADMIN.password)).newPage();
  await admin.goto("/en");
  await admin.getByRole("link", { name: "Advances & loans" }).first().click();
  await expect(admin).toHaveURL(/\/en\/advances$/);
  await expect(admin.getByRole("heading", { level: 1, name: "Advances & loans" })).toBeVisible();
  await expect(admin.getByText("Separate loan ledger")).toBeVisible();
  await expect(admin.getByText("No loans yet. Loans are for amounts bigger than a month's share.")).toBeVisible();
  await expect(tiles(admin)).toContainText("Loans outstanding৳0");
});

test("a new loan lowers the fund, keeps the balance and gets L1 (F4)", async () => {
  await admin.getByRole("button", { name: "New loan" }).first().click();
  const drawer = admin.getByRole("dialog", { name: "New loan" });
  await drawer.getByRole("button", { name: "Record loan" }).click();
  await expect(drawer.getByText("Pick an owner.")).toBeVisible();
  await expect(drawer.getByText("A reason is required — every owner can see it.")).toBeVisible();
  await drawer.getByLabel("Owner", { exact: true }).selectOption({ label: "Tanvir Ahmed" });
  await drawer.getByLabel("Amount (৳)").fill("20000");
  await drawer.getByLabel(/^Monthly instalment/).fill("5000");
  await expect(drawer.getByText(/Paid back in about 4 months — finishing/)).toBeVisible();
  await drawer.getByLabel(/^Reason/).fill("Laptop for work");
  await drawer.getByRole("button", { name: "Record loan" }).click();
  await expect(admin.getByText("Loan L1 recorded · ৳20,000 to Tanvir Ahmed")).toBeVisible();
  const card = loanCard(admin, "L1 · Tanvir Ahmed");
  await expect(card).toContainText("Active");
  await expect(card).toContainText("Repaid ৳0 of ৳20,000");
  await expect(card).toContainText("৳20,000 left");
  await expect(card).toContainText("৳5,000 / month");
  await expect(card).toContainText("Expected to finish");
  await expect(tiles(admin)).toContainText("Loans outstanding৳20,000");
  await expect(tiles(admin)).toContainText("Active loans1");
  l1 = (await admin.request.get("/api/v1/loans?status=ACTIVE").then((r) => r.json())).data.loans[0].id;
});

test("a second loan for the same owner is flagged with a hint (G9, Rule 13)", async () => {
  await admin.getByRole("button", { name: "New loan" }).first().click();
  const drawer = admin.getByRole("dialog", { name: "New loan" });
  await drawer.getByLabel("Owner", { exact: true }).selectOption({ label: "Tanvir Ahmed" });
  await expect(drawer.getByText("Tanvir Ahmed already has L1 with ৳20,000 left.")).toBeVisible();
  await drawer.getByLabel("Amount (৳)").fill("10000");
  await drawer.getByRole("radio", { name: "Bank" }).click();
  await drawer.getByLabel(/^Reason/).fill("Roof share");
  await drawer.getByRole("button", { name: "Record loan" }).click();
  await expect(drawer.getByText("Add the bKash TrxID, Nagad TrxID or cheque number.")).toBeVisible();
  await drawer.getByLabel("Reference no.").fill("CHQ-7781");
  await drawer.getByRole("button", { name: "Record loan" }).click();
  await expect(admin.getByText("Loan L2 recorded · ৳10,000 to Tanvir Ahmed")).toBeVisible();
  await expect(loanCard(admin, "L2 · Tanvir Ahmed")).toContainText("Flagged");
});

test("a cash repayment refuses more than the outstanding, then lowers it (F5, G1)", async () => {
  await loanCard(admin, "L1 · Tanvir Ahmed").getByRole("button", { name: "Record repayment" }).click();
  const dialog = admin.getByRole("dialog", { name: "Record repayment · L1" });
  await expect(dialog).toContainText("Tanvir Ahmed · outstanding ৳20,000");
  await expect(dialog.getByLabel("Amount (৳)")).toHaveValue("5000");
  await dialog.getByLabel("Amount (৳)").fill("25000");
  await dialog.getByRole("button", { name: "Record repayment" }).click();
  await expect(dialog.getByText("Only ৳20,000 is outstanding on L1.")).toBeVisible();
  await dialog.getByLabel("Amount (৳)").fill("5000");
  await dialog.getByRole("button", { name: "Record repayment" }).click();
  await expect(admin.getByText("Repayment recorded · ৳15,000 left on L1")).toBeVisible();
  await expect(loanCard(admin, "L1 · Tanvir Ahmed")).toContainText("Repaid in cash");
});

test("a deduction is capped by the owner's balance; voiding it restores everything (F5, F8, G2)", async () => {
  await loanCard(admin, "L1 · Tanvir Ahmed").getByRole("button", { name: "Record repayment" }).click();
  const dialog = admin.getByRole("dialog", { name: "Record repayment · L1" });
  await dialog.getByRole("radio", { name: "Deduct from entitlement" }).click();
  await expect(dialog).toContainText("Tanvir Ahmed's balance: ৳100. Deduction can be up to ৳100.");
  await dialog.getByLabel("Amount (৳)").fill("500");
  await dialog.getByRole("button", { name: "Record repayment" }).click();
  await expect(dialog.getByText("Tanvir Ahmed's balance is ৳100 — you can deduct up to that. Use cash for the rest.")).toBeVisible();
  await dialog.getByLabel("Amount (৳)").fill("100");
  await dialog.getByRole("button", { name: "Record repayment" }).click();
  await expect(admin.getByText("Repayment recorded · ৳14,900 left on L1")).toBeVisible();

  await loanCard(admin, "L1 · Tanvir Ahmed").getByRole("button", { name: "See all" }).click();
  const sheet = admin.getByRole("dialog", { name: "L1 · Tanvir Ahmed" });
  await expect(sheet).toContainText("Movement history");
  await sheet.getByRole("button", { name: "Void Deducted from entitlement of ৳100" }).click();
  const confirm = admin.getByRole("alertdialog", { name: "Void this repayment?" });
  await expect(confirm.getByRole("button", { name: "Post reversal" })).toBeDisabled();
  await confirm.getByLabel(/^Reason/).fill("Tanvir paid in cash instead");
  await confirm.getByRole("button", { name: "Post reversal" }).click();
  await expect(admin.getByText("Repayment voided")).toBeVisible();
  await expect(sheet).toContainText("Void · Tanvir paid in cash instead");
  await expect(sheet).toContainText("Reversal");
  await expect(sheet.locator('[data-void="true"]')).toHaveCount(1);
  await expect(sheet).toContainText("৳15,000");
  await sheet.getByRole("button", { name: "Close" }).click();
});

test("changing the instalment needs a reason and is recorded (F7)", async () => {
  await loanCard(admin, "L1 · Tanvir Ahmed").getByRole("button", { name: "More actions for L1" }).click();
  await admin.getByRole("menuitem", { name: "Change instalment" }).click();
  const dialog = admin.getByRole("dialog", { name: "Change instalment · L1" });
  await dialog.getByLabel(/^New monthly instalment/).fill("3000");
  await expect(dialog.getByText(/New expected finish:/)).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("A reason is required — every owner can see it.")).toBeVisible();
  await dialog.getByLabel(/^Reason/).fill("Reduced until March at owner's request");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByText("Instalment updated")).toBeVisible();
  await expect(loanCard(admin, "L1 · Tanvir Ahmed")).toContainText("৳3,000 / month");
});

test("a loan with repayments can't be cancelled; a clean one can (F9)", async () => {
  await loanCard(admin, "L1 · Tanvir Ahmed").getByRole("button", { name: "More actions for L1" }).click();
  await admin.getByRole("menuitem", { name: "Cancel loan" }).click();
  let confirm = admin.getByRole("alertdialog", { name: "Cancel L1?" });
  await confirm.getByLabel(/^Reason/).fill("Wrong owner");
  await confirm.getByRole("button", { name: "Cancel loan" }).click();
  await expect(confirm.getByText("This loan has repayments, so it can't be cancelled. Void the repayments first or write it off.")).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();

  await loanCard(admin, "L2 · Tanvir Ahmed").getByRole("button", { name: "More actions for L2" }).click();
  await admin.getByRole("menuitem", { name: "Cancel loan" }).click();
  confirm = admin.getByRole("alertdialog", { name: "Cancel L2?" });
  await expect(confirm).toContainText("The disbursement of ৳10,000 is reversed and the House Fund goes back up.");
  await confirm.getByLabel(/^Reason/).fill("Never actually paid out");
  await confirm.getByRole("button", { name: "Cancel loan" }).click();
  await expect(admin.getByText("L2 cancelled")).toBeVisible();
  await expect(loanCard(admin, "L2 · Tanvir Ahmed")).toContainText("Cancelled");
  await expect(loanCard(admin, "L2 · Tanvir Ahmed").getByRole("button", { name: "Record repayment" })).toHaveCount(0);
  await admin.getByLabel("Status").selectOption("ACTIVE");
  await expect(loanCard(admin, "L2 · Tanvir Ahmed")).toHaveCount(0);
  await expect(loanCard(admin, "L1 · Tanvir Ahmed")).toBeVisible();
});

test("an advance shows the limit panel, warns, saves and appears as Outstanding (F11, F12, F14)", async () => {
  await admin.getByRole("button", { name: "Advance", exact: true }).click();
  const drawer = admin.getByRole("dialog", { name: "Record an advance" });
  await drawer.getByLabel("Owner", { exact: true }).selectOption({ label: "Tanvir Ahmed" });
  await expect(drawer.getByText("Tanvir Ahmed is owed ৳100 — pay that first; an advance is for money beyond what is owed.")).toBeVisible();
  await drawer.getByLabel("Owner", { exact: true }).selectOption({ label: "Nasrin Ahmed" });
  await expect(drawer.getByText("No limit yet — no closed months.")).toBeVisible();
  await drawer.getByLabel("Amount (৳)").fill("500");
  await drawer.getByLabel(/^Reason/).fill("Eye check-up");
  await drawer.getByRole("button", { name: "Record advance" }).click();
  await expect(admin.getByText("Advance of ৳500 recorded for Nasrin Ahmed")).toBeVisible();
  await expect(tiles(admin)).toContainText("Advances outstanding৳500");

  await admin.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Advances" }).click();
  const history = admin.getByRole("region", { name: "Advance history" });
  await expect(history).toContainText("Nasrin Ahmed · ৳500");
  await expect(history).toContainText("Eye check-up");
  await expect(history).toContainText("Outstanding");
  await expect(history).toContainText("Advance limit: 1× each owner's average entitlement over the last 3 closed months.");

  await admin.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "By owner" }).click();
  const standing = admin.getByRole("region", { name: "Standing by owner" });
  await expect(standing.getByRole("link").filter({ hasText: "Tanvir Ahmed" })).toContainText("৳15,000 · 1 active");
  await expect(standing.getByRole("link").filter({ hasText: "Nasrin Ahmed" })).toContainText("No limit yet");
});

test("an Owner sees every loan and advance read-only and is refused on writes (§4)", async ({ browser }) => {
  const context = await loggedIn(browser, OWNER.username, OWNER.password);
  const page = await context.newPage();
  await page.goto("/en/advances");
  await expect(loanCard(page, "L1 · Tanvir Ahmed")).toContainText("Laptop for work");
  for (const name of ["New loan", "Advance", "Record repayment", "More actions for L1"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await page.goto(`/en/advances?tab=loans&loan=${l1}`);
  await expect(page.getByRole("dialog", { name: "L1 · Tanvir Ahmed" })).toContainText("Void · Tanvir paid in cash instead");
  await expect(page.getByRole("button", { name: /^Void / })).toHaveCount(0);

  expect((await write(context, "/loans", {}, { "idempotency-key": "owner-loan-try-1" })).status()).toBe(403);
  expect((await write(context, `/loans/${l1}/repayments`, {}, { "idempotency-key": "owner-repay-try-1" })).status()).toBe(403);
  expect((await write(context, `/loans/${l1}/cancel`, { reason: "x" })).status()).toBe(403);
  await context.close();
});

test("in বাংলা at 360px the screen fits without sideways scroll (§12 General)", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 360, height: 800 }, storageState: await admin.context().storageState() });
  const page = await context.newPage();
  await page.goto("/bn/advances");
  await expect(page.getByRole("heading", { level: 1, name: "অগ্রিম ও ঋণ" })).toBeVisible();
  await expect(loanCard(page, "L১ · Tanvir Ahmed")).toContainText("চলমান");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".context/screens/mobile-bn-advances.png", fullPage: true });
  await context.close();
});

test("the loan statement print view lists every movement (F15)", async () => {
  const print = await admin.context().newPage();
  await print.addInitScript(() => {
    window.print = () => {};
  });
  await print.goto(`/en/loans/${l1}/statement/print`);
  await expect(print).toHaveTitle("BariHisab-Loan-L1-Tanvir Ahmed");
  await expect(print.getByRole("heading", { level: 1, name: "Loan statement · L1" })).toBeVisible();
  await expect(print.getByRole("table")).toContainText("Repaid in cash");
  await expect(print.locator(".sidebar")).toHaveCount(0);
  await print.close();
});

test("cleanup: L1 is repaid in full in cash and the advance is voided, so later specs see the same numbers", async () => {
  await admin.goto("/en/advances");
  await loanCard(admin, "L1 · Tanvir Ahmed").getByRole("button", { name: "Record repayment" }).click();
  const dialog = admin.getByRole("dialog", { name: "Record repayment · L1" });
  await dialog.getByRole("button", { name: "Use full outstanding" }).click();
  await expect(dialog.getByLabel("Amount (৳)")).toHaveValue("15000");
  await dialog.getByRole("button", { name: "Record repayment" }).click();
  await expect(admin.getByText("L1 is fully repaid.")).toBeVisible();
  await expect(loanCard(admin, "L1 · Tanvir Ahmed")).toContainText("Repaid");

  const advances = (await admin.request.get("/api/v1/advances").then((r) => r.json())).data.advances;
  const mine = advances.find((a: { reason: string; status: string }) => a.reason === "Eye check-up" && a.status !== "VOID");
  expect((await write(admin.context(), `/ledger/${mine.id}/void`, { reason: "E2E cleanup" })).status()).toBe(200);
  await admin.reload();
  await expect(tiles(admin)).toContainText("Loans outstanding৳0");
  await expect(tiles(admin)).toContainText("Active loans0");
  await expect(tiles(admin)).toContainText("Advances outstanding৳0");
  // This spec adds logins inside the same minute; period-distribution.spec logs in right after.
  await resetRateLimits();
});
