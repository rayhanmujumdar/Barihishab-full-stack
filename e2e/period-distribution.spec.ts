import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN } from "./global-setup";

// One story through the Distribution PRD §12 acceptance criteria. Runs after
// owners.spec.ts (files run in alphabetical order, one worker): the previous
// month is Closed, this month is Open, and Nasrin 50 · Rayhan 30 · Tanvir 20
// hold shares from this month.
test.describe.configure({ mode: "serial" });

const OWNER = { username: "nasrin", password: "Nasrin!ledger-42" };

const dhakaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dhakaMonth = (offset = 0) => {
  const [y, m] = dhakaToday().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
};
const label = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
const MONTH = dhakaMonth();
const NEXT = dhakaMonth(1);

let admin: Page;

async function loggedIn(browser: Browser, identifier: string, password: string): Promise<BrowserContext> {
  const baseURL = test.info().project.use.baseURL!;
  const context = await browser.newContext({ baseURL });
  const res = await context.request.post("/api/v1/auth/login", { data: { identifier, password, remember: false }, headers: { origin: new URL(baseURL).origin } });
  expect(res.status(), `${identifier} onboarded by earlier specs`).toBe(200);
  return context;
}

/** A write through the API with the session's CSRF token (setup steps and refusals). */
async function write(context: BrowserContext, method: "post" | "put", path: string, data: unknown, headers: Record<string, string> = {}) {
  const baseURL = test.info().project.use.baseURL!;
  const csrf = (await context.cookies()).find((c) => c.name === "bh_csrf")!.value;
  const request: APIRequestContext = context.request;
  return request[method](`/api/v1${path}`, { data, headers: { origin: new URL(baseURL).origin, "x-csrf-token": csrf, ...headers } });
}

async function addEntry(context: BrowserContext, kind: "INCOME" | "EXPENSE", amountPaisa: number) {
  const [cats, funds] = await Promise.all([context.request.get("/api/v1/categories"), context.request.get("/api/v1/fund-accounts")]);
  const category = (await cats.json()).data.items.find((c: { kind: string; isActive: boolean; isSystem: boolean }) => c.kind === kind && c.isActive && !c.isSystem);
  const fund = (await funds.json()).data.items.find((f: { isActive: boolean }) => f.isActive);
  return write(
    context,
    "post",
    "/transactions",
    { period: MONTH, kind, categoryId: category.id, amountPaisa, txnDate: dhakaToday(), fundAccountId: fund.id },
    { "idempotency-key": `dist-${kind}-${amountPaisa}-${Date.now()}` },
  );
}

const board = (page: Page) => page.getByRole("table").last();
const row = (page: Page, name: string) => board(page).getByRole("row").filter({ hasText: name });

test.afterAll(async () => {
  await admin?.context().close();
});

test("the Super Admin sets a 5% reserve rule in Settings (F9, SET-02)", async ({ browser }) => {
  const context = await loggedIn(browser, ADMIN.username, ADMIN.password);
  admin = await context.newPage();
  // A known surplus for this month on top of the earlier specs' entries.
  expect((await addEntry(context, "INCOME", 10000000)).status()).toBe(201);
  await admin.goto("/en/settings");
  const section = admin.getByRole("region", { name: "Reserve holdback" });
  await expect(section).toContainText("Reserve balance now ৳0");
  await section.getByRole("radio", { name: "Percent" }).click();
  await section.getByLabel(/^Percent of/).fill("5");
  await section.getByRole("button", { name: "Save rule" }).click();
  await expect(admin.getByText("Saved", { exact: true })).toBeVisible();
});

test("the board previews this month: staircase, every owner's share, a balanced footer (F1–F4)", async () => {
  await admin.goto("/en/distribution");
  await expect(admin.getByRole("heading", { level: 1, name: "Distribution" })).toBeVisible();
  await expect(admin.getByText("Draft — not closed yet").first()).toBeVisible();
  await expect(admin.getByText("Live preview — entitlements post when you close the month.")).toBeVisible();
  const api = await (await admin.context().request.get(`/api/v1/distribution?month=${MONTH}`)).json();
  const fmt = (p: number) => `৳${new Intl.NumberFormat("en-IN").format(Math.floor(p / 100))}${p % 100 ? `.${String(p % 100).padStart(2, "0")}` : ""}`;
  expect(api.data.staircase.distributablePaisa).toBeGreaterThan(0);
  expect(api.data.staircase.reserveSource).toBe("RULE");
  await expect(admin.getByTestId("distributable")).toContainText(fmt(api.data.staircase.distributablePaisa));
  await expect(admin.getByRole("columnheader", { name: "Entitlement (preview)" })).toBeVisible();
  for (const name of ["Nasrin Ahmed", "Rayhan Ahmed", "Tanvir Ahmed"]) await expect(row(admin, name)).toBeVisible();
  await expect(row(admin, "Rayhan Ahmed")).toContainText("You");
  await expect(admin.getByText(/^Σ entitlements .* = distributable /)).toBeVisible();
  await expect(admin.getByText("Shares used · Nasrin 50 · Rayhan 30 · Tanvir 20")).toBeVisible();
  await admin.screenshot({ path: ".context/screens/desktop-en-distribution-preview.png", fullPage: true });
});

test("the reserve can be overridden for the open month with a reason, then reset (G3)", async () => {
  await admin.getByRole("button", { name: /^Reserve ৳/ }).click();
  const dialog = admin.getByRole("dialog", { name: "Reserve details" });
  await dialog.getByLabel(/^Amount/).fill("1000");
  await dialog.getByRole("button", { name: "Save reserve" }).click();
  await expect(dialog.getByText("Please write a reason — everyone can see it.")).toBeVisible();
  await dialog.getByLabel(/^Reason/).fill("Pump replacement next month");
  await dialog.getByRole("button", { name: "Save reserve" }).click();
  await expect(admin.getByText("Reserve set to ৳1,000 for this month · Pump replacement next month")).toBeVisible();
  await admin.getByRole("button", { name: /^Reserve ৳1,000/ }).click();
  await admin.getByRole("dialog", { name: "Reserve details" }).getByRole("button", { name: "Reset to rule" }).click();
  await expect(admin.getByText("Reserve back to the rule")).toBeVisible();
  await expect(admin.getByText(/Reserve set to/)).toHaveCount(0);
});

test("closing shows the checklist, posts entitlements and locks the month (F5, F6, DST-02/03)", async () => {
  await admin.getByRole("button", { name: "Close month" }).click();
  const dialog = admin.getByRole("dialog", { name: `Close month · ${label(MONTH)}` });
  await expect(dialog).toContainText("Shares add up to 100% · 3 owners");
  await expect(dialog).toContainText("is closed");
  await expect(dialog).toContainText(`${label(MONTH)} isn't over`);
  await expect(dialog).toContainText(`${label(MONTH)} locks — later fixes need a reopen or an Adjustment`);
  await expect(dialog).toContainText(`${label(NEXT)} opens`);
  await dialog.getByRole("button", { name: "Close & lock" }).click();
  await expect(admin.getByText(`${label(MONTH)} closed · entitlements posted`)).toBeVisible();
  await expect(admin.getByText(/^Closed by .+ on /)).toBeVisible();
  await expect(admin.getByRole("columnheader", { name: "Entitlement", exact: true })).toBeVisible();
  await expect(admin.getByRole("button", { name: "Reopen" })).toBeVisible();

  // Rule 7 + G12: the month is locked and a second close is refused by name.
  const again = await write(admin.context(), "post", `/periods/${MONTH}/close`, { reopenCount: 0 });
  expect(again.status()).toBe(409);
  expect((await again.json()).error).toMatchObject({ code: "PERIOD_ALREADY_CLOSED", details: { month: MONTH, closedBy: expect.any(String) } });
  expect((await addEntry(admin.context(), "EXPENSE", 1000)).status()).toBe(409);

  // The entitlement is on the owner's statement.
  await row(admin, "Tanvir Ahmed").getByRole("link", { name: /Tanvir Ahmed/ }).click();
  await expect(admin.getByRole("heading", { level: 1, name: "Tanvir Ahmed" })).toBeVisible();
  await expect(admin.getByRole("table")).toContainText("Entitlement");
  await admin.goBack();
});

test("Pay on the board settles an owed owner (F12)", async () => {
  await admin.goto(`/en/distribution?month=${MONTH}`);
  await expect(row(admin, "Tanvir Ahmed")).toContainText("Owed");
  await board(admin).getByRole("button", { name: "Pay Tanvir Ahmed" }).click();
  const drawer = admin.getByRole("dialog", { name: "Pay Tanvir Ahmed" });
  await drawer.getByRole("button", { name: "Record payment" }).click();
  await expect(admin.getByText(/^Payment of ৳.* recorded for Tanvir Ahmed$/)).toBeVisible();
  // The payment posts in the open month; its board shows the balance now.
  await admin.goto(`/en/distribution?month=${NEXT}`);
  await expect(row(admin, "Tanvir Ahmed")).toContainText("Settled");
  await expect(board(admin).getByRole("button", { name: "Pay Tanvir Ahmed" })).toHaveCount(0);
  await admin.goto(`/en/distribution?month=${MONTH}`);
});

test("reopen needs a reason, warns about later payouts and reverses the entitlements (F7)", async () => {
  await admin.getByRole("button", { name: "Reopen" }).click();
  const dialog = admin.getByRole("alertdialog", { name: `Reopen ${label(MONTH)}?` });
  await expect(dialog).toContainText("entitlement entries and any loan deductions are reversed");
  await expect(dialog).toContainText(`was paid out after ${label(MONTH)} closed`);
  await dialog.getByRole("button", { name: "Reopen month" }).click();
  await expect(dialog.getByText("Please write a reason — everyone can see it.")).toBeVisible();
  await dialog.getByLabel(/^Reason/).fill("Plumber bill was missed");
  await dialog.getByRole("button", { name: "Reopen month" }).click();
  await expect(admin.getByText(`${label(MONTH)} reopened · entitlements reversed · owners notified`)).toBeVisible();
  await expect(admin.getByText("Draft — not closed yet").first()).toBeVisible();
  await expect(admin.getByText(/Reopened .* by .+ · Plumber bill was missed/)).toBeVisible();
});

test("re-closing shows before → after and keeps the reopen history (F8)", async () => {
  expect((await addEntry(admin.context(), "EXPENSE", 500000)).status()).toBe(201);
  await admin.reload();
  await admin.getByRole("button", { name: "Close month" }).click();
  const dialog = admin.getByRole("dialog", { name: `Close month · ${label(MONTH)}` });
  await expect(dialog.getByText("Changes since last close")).toBeVisible();
  await expect(dialog.getByRole("row", { name: /^Expense/ })).toContainText("+৳5,000");
  await dialog.getByRole("button", { name: "Close & lock" }).click();
  await expect(admin.getByText(`${label(MONTH)} closed · entitlements posted`)).toBeVisible();
  await expect(admin.getByText(/reopened 1×/)).toBeVisible();
  await admin.getByRole("button", { name: "See changes" }).click();
  await expect(admin.getByRole("row", { name: /^Distributable/ }).first()).toContainText("−৳");
  await admin.screenshot({ path: ".context/screens/desktop-en-distribution-closed.png", fullPage: true });
});

test("an Owner sees the board read-only and is refused on close, reopen and override (§4)", async ({ browser }) => {
  const context = await loggedIn(browser, OWNER.username, OWNER.password);
  const page = await context.newPage();
  await page.goto(`/en/distribution?month=${MONTH}`);
  await expect(row(page, "Nasrin Ahmed")).toContainText("You");
  for (const name of [/Close month/, /^Reopen$/, /^Pay /]) await expect(page.getByRole("button", { name })).toHaveCount(0);
  await page.getByRole("button", { name: /^Reserve ৳/ }).click();
  await expect(page.getByRole("dialog", { name: "Reserve details" }).getByLabel(/^Amount/)).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect((await write(context, "post", `/periods/${NEXT}/close`, { reopenCount: 0 })).status()).toBe(403);
  expect((await write(context, "post", `/periods/${MONTH}/reopen`, { reason: "x" })).status()).toBe(403);
  expect((await write(context, "put", `/periods/${NEXT}/reserve`, { amountPaisa: 0, reason: "x" })).status()).toBe(403);
  await context.close();
});

test("in বাংলা at 360px the board is a list of cards with no sideways scroll (§12 General)", async () => {
  await admin.setViewportSize({ width: 360, height: 780 });
  await admin.goto(`/bn/distribution?month=${MONTH}`);
  await expect(admin.getByRole("heading", { level: 1, name: "বণ্টন" })).toBeVisible();
  const cards = admin.getByRole("list", { name: "প্রত্যেক মালিকের অংশ" });
  await expect(cards).toBeVisible();
  await expect(cards.getByRole("listitem")).toHaveCount(3);
  await expect(admin.locator(".dist-table-wrap")).toBeHidden();
  await expect(admin.getByTestId("distributable")).toContainText(/৳[০-৯]/);
  const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await admin.screenshot({ path: ".context/screens/mobile-bn-distribution.png", fullPage: true });
  await admin.setViewportSize({ width: 1280, height: 800 });
});

test("cleanup: the current month is reopened so later specs find it open with its entries", async () => {
  const res = await write(admin.context(), "post", `/periods/${MONTH}/reopen`, { reason: "E2E: leave the current month open for visual.spec" });
  expect(res.status()).toBe(200);
});
