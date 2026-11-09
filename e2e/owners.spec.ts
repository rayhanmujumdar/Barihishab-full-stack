import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { setPeriodStatus } from "./db";
import { ADMIN } from "./global-setup";

// One story through the Owners PRD §11 acceptance criteria. Runs after
// income-expenses.spec.ts (files run in order, one worker), which onboarded
// ADMIN, the "nasrin" Owner, two fund accounts and a Closed previous month.
test.describe.configure({ mode: "serial" });

const OWNER = { username: "nasrin", password: "Nasrin!ledger-42" };

const dhakaMonth = (offset = 0) => {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit" }).format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
};
const label = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
const MONTH = dhakaMonth();
const PREV = dhakaMonth(-1);

let admin: Page;
let tanvirUrl = "";

async function loggedIn(browser: Browser, identifier: string, password: string): Promise<BrowserContext> {
  const baseURL = test.info().project.use.baseURL!;
  const context = await browser.newContext({ baseURL });
  const res = await context.request.post("/api/v1/auth/login", { data: { identifier, password, remember: false }, headers: { origin: new URL(baseURL).origin } });
  expect(res.status(), `${identifier} onboarded by earlier specs`).toBe(200);
  return context;
}

const card = (page: Page, name: string) => page.getByRole("list", { name: "Owners" }).getByRole("link").filter({ has: page.getByRole("heading", { name }) });
const summary = (page: Page) => page.getByRole("region", { name: "Summary" });

test.afterAll(async () => {
  await admin?.context().close();
});

test("setup: the Super Admin adds a linked, a second linked and a name-only owner (F7)", async ({ browser }) => {
  // Opening balances are only editable before any month is closed (F10): reopen last month for setup.
  await setPeriodStatus(PREV, "OPEN");
  admin = await (await loggedIn(browser, ADMIN.username, ADMIN.password)).newPage();
  await admin.goto("/en/owners");
  await expect(admin.getByText("No owners yet. Add the first owner, then give everyone their shares.")).toBeVisible();

  for (const [user, name] of [
    ["nasrin", "Nasrin Ahmed"],
    ["bookkeeper", "Rayhan Ahmed"],
  ]) {
    await admin.getByRole("button", { name: "Add owner" }).first().click();
    const dialog = admin.getByRole("dialog", { name: "Add owner" });
    await dialog.getByLabel("User", { exact: true }).selectOption({ label: user });
    await expect(dialog.getByLabel("Display name")).toHaveValue(user);
    await dialog.getByLabel("Display name").fill(name);
    await dialog.getByRole("button", { name: "Save owner" }).click();
    await admin.getByRole("button", { name: "Later" }).click();
    await expect(card(admin, name)).toBeVisible();
  }

  await admin.getByRole("button", { name: "Add owner" }).first().click();
  const dialog = admin.getByRole("dialog", { name: "Add owner" });
  await dialog.getByRole("radio", { name: "Name only (no login)" }).click();
  await dialog.getByLabel("Display name").fill("Tanvir Ahmed");
  await dialog.getByRole("button", { name: "Save owner" }).click();
  await expect(admin.getByRole("dialog", { name: "Owner added" })).toContainText("Tanvir Ahmed starts with 0 units");
  await admin.getByRole("button", { name: "Give shares now" }).click();

  // F6: one share set for everybody, confirmed before → after.
  const shares = admin.getByRole("dialog", { name: "Change shares" });
  const add = shares.getByLabel("Add an owner to this share set");
  for (const [name, units] of [
    ["Nasrin Ahmed", "50"],
    ["Rayhan Ahmed", "30"],
    ["Tanvir Ahmed", "20"],
  ]) {
    await add.selectOption({ label: name });
    await shares.getByLabel(`Units for ${name}`).fill(units);
  }
  await expect(shares.getByText("100 units = 100%")).toBeVisible();
  await shares.getByLabel("Effective from").selectOption(MONTH);
  await shares.getByRole("button", { name: "Save share set" }).click();
  await expect(shares.getByText("A reason is required for every share change.")).toBeVisible();
  await shares.getByLabel("Reason").fill("Initial shares from the family deed");
  await shares.getByRole("button", { name: "Save share set" }).click();
  const confirm = admin.getByRole("alertdialog", { name: "Save this share set?" });
  await expect(confirm).toContainText("Tanvir Ahmed0 → 20");
  await expect(confirm).toContainText(`${label(MONTH)} and later will use the new ones.`);
  await confirm.getByRole("button", { name: "Save share set" }).click();
  await expect(admin.getByText(`Share set saved · effective ${label(MONTH)}`)).toBeVisible();
  await expect(card(admin, "Nasrin Ahmed")).toContainText("50%");
  await expect(card(admin, "Tanvir Ahmed")).toContainText("20%");
  await expect(card(admin, "Tanvir Ahmed")).toContainText("No login");
  await expect(card(admin, "Tanvir Ahmed")).toContainText("20 units");
  await expect(admin.getByText("100 share units")).toBeVisible();
});

test("an opening balance is set during setup, then locks when a month closes (F10)", async () => {
  await card(admin, "Tanvir Ahmed").click();
  await expect(admin.getByRole("heading", { level: 1, name: "Tanvir Ahmed" })).toBeVisible();
  tanvirUrl = admin.url();
  await admin.getByRole("button", { name: "More actions" }).click();
  await admin.getByRole("menuitem", { name: "Opening balance" }).click();
  const dialog = admin.getByRole("dialog", { name: "Opening balance" });
  await dialog.getByLabel("Amount (৳)").fill("8,055.85");
  await dialog.getByLabel("Note").fill("Owed from the 2025 notebook");
  await dialog.getByRole("button", { name: "Save opening balance" }).click();
  await expect(admin.getByText("Opening balance saved")).toBeVisible();
  await expect(summary(admin)).toContainText("৳8,055.85");
  await expect(summary(admin)).toContainText("Owed");

  await setPeriodStatus(PREV, "CLOSED");
  await admin.reload();
  await admin.getByRole("button", { name: "More actions" }).click();
  await expect(admin.getByRole("menuitem", { name: "Edit owner" })).toBeVisible();
  await expect(admin.getByRole("menuitem", { name: "Opening balance" })).toHaveCount(0);
  await admin.keyboard.press("Escape");
});

test("paying the full balance settles the owner (F11)", async () => {
  await admin.getByRole("button", { name: "Pay", exact: true }).click();
  const drawer = admin.getByRole("dialog", { name: "Pay Tanvir Ahmed" });
  await expect(drawer).toContainText("Tanvir Ahmed · balance ৳8,055.85");
  await expect(drawer.getByLabel("Amount (৳)")).toHaveValue("8055.85");
  await drawer.getByRole("radio", { name: "bKash" }).click();
  await drawer.getByRole("button", { name: "Record payment" }).click();
  await expect(drawer.getByText("Add the bKash TrxID, Nagad TrxID or cheque number.")).toBeVisible();
  await drawer.getByLabel("Reference no.").fill("8FJ2K1");
  await drawer.getByRole("button", { name: "Record payment" }).click();
  await expect(admin.getByText("Payment of ৳8,055.85 recorded for Tanvir Ahmed")).toBeVisible();
  await expect(summary(admin)).toContainText("Settled");
});

test("paying more than the balance asks advance or loan and records the advance (F11, PAY-03)", async () => {
  await admin.getByRole("button", { name: "Pay", exact: true }).click();
  const drawer = admin.getByRole("dialog", { name: "Pay Tanvir Ahmed" });
  await expect(drawer.getByText("Nothing is owed — anything you pay becomes an advance or loan")).toBeVisible();
  await expect(drawer.getByLabel("Amount (৳)")).toHaveValue("");
  await drawer.getByLabel("Amount (৳)").fill("5000");
  await drawer.getByRole("button", { name: "Record payment" }).click();
  const excess = admin.getByRole("alertdialog", { name: "More than the balance" });
  await expect(excess).toContainText("Excess৳5,000");
  await excess.getByRole("button", { name: "Record excess as an advance" }).click();
  await expect(admin.getByText("Payment of ৳5,000 recorded for Tanvir Ahmed")).toBeVisible();
  await expect(summary(admin)).toContainText("Advance outstanding");
  await expect(summary(admin)).toContainText("৳5,000");
  await expect(admin.getByRole("table")).toContainText("Advance");
});

test("voiding the advance posts a reversal and restores the balance (F13)", async () => {
  await admin.getByRole("button", { name: "Void Advance of ৳5,000" }).click();
  const dialog = admin.getByRole("alertdialog", { name: "Void this advance?" });
  await expect(dialog).toContainText(`A reversal of ৳5,000 is posted in ${label(MONTH)}.`);
  await expect(dialog.getByRole("button", { name: "Post reversal" })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("Recorded for the wrong owner");
  await dialog.getByRole("button", { name: "Post reversal" }).click();
  await expect(admin.getByText("Reversal posted · balance and fund restored")).toBeVisible();
  await expect(summary(admin)).toContainText("Settled");
  const table = admin.getByRole("table");
  await expect(table.locator('tr[data-void="true"]')).toHaveCount(1);
  await expect(table).toContainText("Reversal");
  await expect(admin.getByRole("button", { name: /^Void Advance/ })).toHaveCount(0);
});

test("a balance adjustment changes the balance but not the fund (F14)", async () => {
  await admin.getByRole("button", { name: "More actions" }).click();
  await admin.getByRole("menuitem", { name: "Balance adjustment" }).click();
  const dialog = admin.getByRole("dialog", { name: "Balance adjustment" });
  await dialog.getByLabel("Amount (৳)").fill("100");
  await dialog.getByLabel("Reference month").selectOption(PREV);
  await dialog.getByLabel("Reason").fill("June payout recorded against the wrong owner");
  await dialog.getByRole("button", { name: "Post adjustment" }).click();
  await expect(admin.getByText("Adjustment posted")).toBeVisible();
  await expect(summary(admin)).toContainText("৳100");
  await expect(admin.getByRole("table")).toContainText(`for ${label(PREV)}`);
});

test("the PDF button opens a print view named after the owner and range (F4)", async () => {
  const href = await admin.getByRole("link", { name: "PDF" }).getAttribute("href");
  const print = await admin.context().newPage();
  await print.addInitScript(() => {
    window.print = () => {};
  });
  await print.goto(href!);
  await expect(print).toHaveTitle(`BariHisab-Statement-Tanvir Ahmed-${MONTH.slice(0, 4)}-01-Latest`);
  await expect(print.getByRole("heading", { level: 1, name: "Tanvir Ahmed" })).toBeVisible();
  await expect(print.locator(".sidebar")).toHaveCount(0);
  await expect(print.getByText("Closing balance")).toBeVisible();
  await print.screenshot({ path: ".context/screens/desktop-en-owner-print.png", fullPage: true });
  await print.close();
});

test("an Owner sees every owner read-only and is refused on writes (§4)", async ({ browser, baseURL }) => {
  const context = await loggedIn(browser, OWNER.username, OWNER.password);
  const page = await context.newPage();
  await page.goto("/en/owners");
  await expect(card(page, "Nasrin Ahmed")).toContainText("You");
  await expect(card(page, "Rayhan Ahmed")).toContainText("Super Admin");
  await expect(page.getByRole("button", { name: "Change shares" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add owner" })).toHaveCount(0);

  await page.goto(tanvirUrl);
  await expect(page.getByRole("heading", { level: 1, name: "Tanvir Ahmed" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Brought forward");
  for (const name of ["Pay", "Record advance", "More actions"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Void/ })).toHaveCount(0);

  await page.goto("/en");
  await expect(page.getByRole("link", { name: /Statement/ })).toHaveAttribute("href", /\/en\/owners\/[0-9a-f-]{36}$/);

  const csrf = (await context.cookies()).find((c) => c.name === "bh_csrf")!.value;
  const res = await context.request.post("/api/v1/payouts", {
    data: {},
    headers: { origin: new URL(baseURL!).origin, "x-csrf-token": csrf, "idempotency-key": "owner-pay-try-1" },
  });
  expect(res.status()).toBe(403);
  await context.close();
});
