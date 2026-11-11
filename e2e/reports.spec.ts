import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { openMonths, resetRateLimits, setPeriodStatus } from "./db";
import { ADMIN } from "./global-setup";

// One story through the Reports PRD §10 acceptance criteria. Named to run after
// period-distribution.spec.ts and before requests.spec.ts (files run in order,
// one worker): owners Nasrin (login) and Rayhan (the Super Admin) exist and the
// current month is open. Reports are read-only; the one expense this spec adds
// is voided again and last month's status is restored, so it ends state-neutral.
test.describe.configure({ mode: "serial" });

const OWNER = { username: "nasrin", password: "Nasrin!ledger-42" };
const VENDOR = "E2E Reports DESCO";
const EXPENSE_PAISA = 456700;

const dhakaMonth = (offset = 0) => {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit" }).format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
};
const label = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
/** Same display rule as lib/money formatMoney (en). */
const money = (p: number) => {
  const abs = Math.abs(p);
  const text = new Intl.NumberFormat("en-IN", { minimumFractionDigits: abs % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(abs / 100);
  return `${p < 0 ? "−" : ""}৳${text}`;
};
const MONTH = dhakaMonth();
const PREV = dhakaMonth(-1);
const YEAR = Number(MONTH.slice(0, 4));

let admin: Page;
let owner: Page;
let wasOpen: string[] = [];
let expenseId = "";

async function loggedIn(browser: Browser, identifier: string, password: string, viewport = { width: 1280, height: 900 }): Promise<BrowserContext> {
  const baseURL = test.info().project.use.baseURL!;
  const context = await browser.newContext({ baseURL, viewport, acceptDownloads: true });
  const res = await context.request.post("/api/v1/auth/login", { data: { identifier, password, remember: false }, headers: { origin: new URL(baseURL).origin } });
  expect(res.status(), `${identifier} onboarded by earlier specs`).toBe(200);
  return context;
}

async function write(page: Page, path: string, data: unknown, extra: Record<string, string> = {}) {
  const baseURL = test.info().project.use.baseURL!;
  const csrf = (await page.context().cookies()).find((c) => c.name === "bh_csrf")!.value;
  return page.request.post(`/api/v1${path}`, { data, headers: { origin: new URL(baseURL).origin, "x-csrf-token": csrf, ...extra } });
}

const api = async (page: Page, path: string) => (await (await page.request.get(`/api/v1${path}`)).json()).data;

test.beforeAll(async ({ browser }) => {
  await resetRateLimits();
  wasOpen = await openMonths();
  expect(wasOpen, "earlier specs leave the current month open").toContain(MONTH);
  // Last month closed → it is the report Reports opens on (F1 default).
  await setPeriodStatus(PREV, "CLOSED");
  admin = await (await loggedIn(browser, ADMIN.username, ADMIN.password)).newPage();
  owner = await (await loggedIn(browser, OWNER.username, OWNER.password)).newPage();
  const elec = (await api(admin, "/categories?kind=EXPENSE")).items.find((c: { code: string }) => c.code === "ELEC");
  const fund = (await api(admin, "/fund-accounts")).items.find((f: { isActive: boolean }) => f.isActive);
  const res = await write(
    admin,
    "/transactions",
    { kind: "EXPENSE", period: MONTH, categoryId: elec.id, amountPaisa: EXPENSE_PAISA, txnDate: `${MONTH}-05`, fundAccountId: fund.id, vendor: VENDOR, description: "E2E electricity bill" },
    { "idempotency-key": `reports-e2e-${Date.now()}` },
  );
  expect(res.status()).toBe(201);
  expenseId = (await res.json()).data.transaction.id;
});

test.afterAll(async () => {
  if (expenseId) await write(admin, `/transactions/${expenseId}/void`, { reason: "E2E: undo the Reports test expense" });
  if (wasOpen.includes(PREV)) await setPeriodStatus(PREV, "OPEN");
  await admin?.context().close();
  await owner?.context().close();
  await resetRateLimits();
});

test("an owner's Accounts button opens Reports on the latest closed month, marked Final", async ({ browser }) => {
  const phone = await (await loggedIn(browser, OWNER.username, OWNER.password, { width: 360, height: 780 })).newPage();
  await phone.goto("/en");
  await phone.getByRole("navigation").getByRole("link", { name: "Accounts" }).click();
  await expect(phone).toHaveURL(/\/en\/reports\/monthly$/);
  await expect(phone.getByRole("heading", { level: 2, name: `Monthly report · ${label(PREV)}` })).toBeVisible();
  await expect(phone.getByText(/^Final/).first()).toBeVisible();
  // 360px: the page itself never scrolls sideways; wide tables scroll inside their wrapper.
  expect(await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await phone.context().close();
});

test("the open month is a Draft whose distributable matches Distribution, with expandable categories", async () => {
  await owner.goto("/en/reports/monthly");
  await owner.getByRole("combobox", { name: "Month" }).selectOption(MONTH);
  await expect(owner).toHaveURL(new RegExp(`month=${MONTH}`));
  await expect(owner.getByText("Draft — not closed yet")).toBeVisible();
  const report = await api(owner, `/reports/monthly?month=${MONTH}`);
  const board = await api(owner, `/distribution?month=${MONTH}`);
  expect(report.staircase.distributablePaisa).toBe(board.staircase.distributablePaisa);
  await expect(owner.getByTestId("rpt-distributable")).toContainText(money(report.staircase.distributablePaisa));

  const elec = owner.getByRole("button", { name: /^Electricity · / });
  await expect(elec).toHaveAttribute("aria-expanded", "false");
  await elec.click();
  await expect(elec).toHaveAttribute("aria-expanded", "true");
  await expect(owner.getByRole("cell", { name: "E2E electricity bill" })).toBeVisible();

  await owner.getByRole("navigation", { name: "Owner statements" }).getByRole("link").first().click();
  await expect(owner).toHaveURL(new RegExp(`/en/owners/[0-9a-f-]+\\?from=${MONTH}&to=${MONTH}`));
});

test("CSV downloads with the PRD file name", async () => {
  await owner.goto(`/en/reports/monthly?month=${MONTH}`);
  const [download] = await Promise.all([owner.waitForEvent("download"), owner.getByRole("link", { name: "CSV" }).click()]);
  expect(download.suggestedFilename()).toBe(`BariHisab-Monthly-${MONTH}-DRAFT.csv`);
  const csv = await (await owner.request.get(`/api/v1/reports/monthly?month=${MONTH}&format=csv`)).text();
  expect(csv).toContain(`${VENDOR},,`);
  expect(csv).toContain(`${(EXPENSE_PAISA / 100).toFixed(2)},Draft`);
});

test("the print view titles the PDF, watermarks a draft and matches the screen", async () => {
  const page = await owner.context().newPage();
  await page.addInitScript(() => {
    (window as unknown as { __printed: boolean }).__printed = false;
    window.print = () => ((window as unknown as { __printed: boolean }).__printed = true);
  });
  await page.goto(`/en/reports/monthly/print?month=${MONTH}&pdf=1`);
  await expect(page).toHaveTitle(`BariHisab-Monthly-${MONTH}-DRAFT`);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: boolean }).__printed)).toBe(true);
  await expect(page.getByTestId("rpt-watermark")).toHaveText("DRAFT — NOT FINAL");
  await expect(page.getByText("Draft · may change")).toBeVisible();
  await expect(page.getByText(/Save as PDF/)).toBeVisible();
  await expect(page.getByRole("table", { name: "Entries" }).getByText("E2E electricity bill")).toBeVisible();
  const report = await api(owner, `/reports/monthly?month=${MONTH}`);
  await expect(page.getByTestId("rpt-distributable")).toContainText(money(report.staircase.distributablePaisa));
  await page.close();

  const finalPage = await owner.context().newPage();
  finalPage.on("dialog", (d) => d.dismiss());
  await finalPage.addInitScript(() => (window.print = () => undefined));
  await finalPage.goto(`/en/reports/monthly/print?month=${PREV}`);
  await expect(finalPage).toHaveTitle(`BariHisab-Monthly-${PREV}`);
  await expect(finalPage.getByTestId("rpt-watermark")).toHaveCount(0);
  await finalPage.close();
});

test("Yearly separates closed from draft months and its chart opens the Monthly report", async () => {
  await owner.goto(`/en/reports/yearly?year=${YEAR}`);
  await expect(owner.getByRole("heading", { level: 2, name: `Yearly report · ${YEAR}` })).toBeVisible();
  const y = await api(owner, `/reports/yearly?year=${YEAR}`);
  expect(y.owners.totals.entitlementPaisa).toBe(y.totals.closed.distributablePaisa);
  await expect(owner.getByText(new RegExp(`^${y.totals.closedCount} months? closed, ${y.totals.draftCount} draft$`))).toBeVisible();
  await expect(owner.getByTestId("rpt-year-distributable")).toContainText(money(y.totals.closed.distributablePaisa));
  const draftMonth = owner.getByRole("link", { name: new RegExp(`^${label(MONTH)}: .* · Draft$`) });
  await expect(draftMonth).toHaveAttribute("data-draft", "true");
  await draftMonth.click();
  await expect(owner).toHaveURL(new RegExp(`/en/reports/monthly\\?month=${MONTH}`));
});

test("Rent roll, Expenses and Fund accounts keep their period in the URL", async () => {
  await owner.goto(`/en/reports/rent-roll?year=${YEAR}`);
  await expect(owner.getByRole("table", { name: `Rent roll · ${YEAR}` })).toBeVisible();

  await owner.getByRole("link", { name: "Expenses", exact: true }).click();
  await expect(owner).toHaveURL(/\/en\/reports\/expenses$/);
  await owner.getByLabel("From", { exact: true }).fill(MONTH);
  await owner.getByLabel("To", { exact: true }).fill(MONTH);
  await owner.getByRole("checkbox", { name: "Electricity" }).check();
  await owner.getByRole("button", { name: "Show" }).click();
  await expect(owner).toHaveURL(new RegExp(`from=${MONTH}&to=${MONTH}&category=`));
  await expect(owner.getByRole("table", { name: "Biggest expenses" }).getByText(VENDOR)).toBeVisible();

  // The latest month (earlier specs may book into a later open month) closes at the Settings balance.
  const LATEST = (await api(owner, `/reports/funds?month=${MONTH}`)).months[0].key;
  await owner.goto(`/en/reports/funds?month=${LATEST}`);
  const funds = await api(owner, `/reports/funds?month=${LATEST}`);
  const settings = await api(admin, "/fund-accounts");
  for (const f of settings.items.filter((x: { isActive: boolean }) => x.isActive)) {
    expect(funds.rows.find((r: { fundAccountId: string }) => r.fundAccountId === f.id).closingPaisa, f.name).toBe(f.balancePaisa);
  }
  await owner.getByRole("link", { name: "Year", exact: true }).click();
  await expect(owner).toHaveURL(new RegExp(`/en/reports/funds\\?year=${YEAR}`));
});

test("Reports speak Bangla and the Super Admin reaches them from More", async ({ browser }) => {
  await owner.goto(`/bn/reports/monthly?month=${MONTH}`);
  await expect(owner.getByRole("heading", { level: 1, name: "রিপোর্ট" })).toBeVisible();
  await expect(owner.getByText("খসড়া — এখনও বন্ধ হয়নি")).toBeVisible();
  await expect(owner.getByTestId("rpt-distributable")).toContainText(/৳[০-৯]/);

  const phone = await (await loggedIn(browser, ADMIN.username, ADMIN.password, { width: 360, height: 780 })).newPage();
  await phone.goto("/en");
  await phone.getByRole("button", { name: "More" }).click();
  await phone.getByRole("dialog", { name: "All sections" }).getByRole("link", { name: /Reports/ }).click();
  await expect(phone).toHaveURL(/\/en\/reports\/monthly$/);
  await expect(phone.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  await phone.context().close();
});
