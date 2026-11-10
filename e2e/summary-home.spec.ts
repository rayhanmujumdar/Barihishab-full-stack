import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { openMonths, resetRateLimits, setPeriodStatus } from "./db";
import { ADMIN } from "./global-setup";

// One story through the Home PRD §10 acceptance criteria. Named to run after
// requests.spec.ts and before visual.spec.ts (files run in order, one worker):
// owners Nasrin (login), Rayhan (the Super Admin) and Tanvir, the current
// month open. Ends state-neutral: the expense recorded from Home is voided and
// last month's status is restored.
test.describe.configure({ mode: "serial" });

const OWNER = { username: "nasrin", password: "Nasrin!ledger-42" };

const dhakaMonth = (offset = 0) => {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit" }).format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
};
const label = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
/** Same display rule as lib/money formatMoney (en): ৳ + lakh grouping, paisa only when non-zero. */
const money = (p: number) => {
  const abs = Math.abs(p);
  const text = new Intl.NumberFormat("en-IN", { minimumFractionDigits: abs % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(abs / 100);
  return `${p < 0 ? "−" : ""}৳${text}`;
};
const MONTH = dhakaMonth();
const PREV = dhakaMonth(-1);
const EXPENSE_PAISA = 123400;

let admin: Page;
let owner: Page;
let wasOpen: string[] = [];
/** Home's month = the latest open month (Rule 1) — earlier specs may leave next month open too. */
let HOME_MONTH = MONTH;

async function loggedIn(browser: Browser, identifier: string, password: string, viewport = { width: 1280, height: 900 }): Promise<BrowserContext> {
  const baseURL = test.info().project.use.baseURL!;
  const context = await browser.newContext({ baseURL, viewport });
  const res = await context.request.post("/api/v1/auth/login", { data: { identifier, password, remember: false }, headers: { origin: new URL(baseURL).origin } });
  expect(res.status(), `${identifier} onboarded by earlier specs`).toBe(200);
  return context;
}

async function write(page: Page, path: string, data: unknown) {
  const baseURL = test.info().project.use.baseURL!;
  const csrf = (await page.context().cookies()).find((c) => c.name === "bh_csrf")!.value;
  return page.request.post(`/api/v1${path}`, { data, headers: { origin: new URL(baseURL).origin, "x-csrf-token": csrf } });
}

const api = async (page: Page, path: string) => (await (await page.request.get(`/api/v1${path}`)).json()).data;

test.beforeAll(async ({ browser }) => {
  await resetRateLimits();
  wasOpen = await openMonths();
  admin = await (await loggedIn(browser, ADMIN.username, ADMIN.password)).newPage();
  owner = await (await loggedIn(browser, OWNER.username, OWNER.password)).newPage();
  HOME_MONTH = (await api(owner, "/dashboard")).month.key;
  expect(wasOpen, "Home shows the latest open month").toContain(HOME_MONTH);
  expect(HOME_MONTH).toBe(wasOpen.at(-1));
});

test.afterAll(async () => {
  await admin?.context().close();
  await owner?.context().close();
  await resetRateLimits();
});

test("an Owner sees their balance, this month and the house — but no desk, reminders or quick actions (F2, F3, F7, §3)", async () => {
  await owner.goto("/en");
  await expect(owner.getByRole("heading", { level: 1, name: /^Hello, / })).toBeVisible();
  const hero = owner.getByRole("region", { name: "Your current balance" });
  const amount = (await hero.getByTestId("hero-amount").textContent())!;
  await expect(hero.getByText(/^(Owed|Advance outstanding|Settled)$/)).toBeVisible();
  await expect(owner.getByRole("list", { name: "This month for me" })).toContainText(`Entitlement · ${label(HOME_MONTH)} (preview)`);
  await expect(owner.getByRole("region", { name: "Bookkeeper's desk" })).toHaveCount(0);
  await expect(owner.getByRole("note")).toHaveCount(0);
  await expect(owner.getByRole("button", { name: "Expense" })).toHaveCount(0);
  await expect(owner.getByRole("link", { name: "Request money" })).toHaveAttribute("href", "/en/requests?new=1");

  // Hero = the Owners page balance and the statement (Rule 2).
  await owner.getByRole("link", { name: /My statement/ }).click();
  await expect(owner).toHaveURL(/\/en\/owners\/[0-9a-f-]{36}$/);
  await expect(owner.getByRole("heading", { level: 1, name: "Nasrin Ahmed" })).toBeVisible();
  await owner.goto("/en/owners");
  const card = owner.getByRole("list", { name: "Owners" }).getByRole("link").filter({ has: owner.getByRole("heading", { name: "Nasrin Ahmed" }) });
  await expect(card).toContainText(amount === "৳0" ? "Settled" : amount.replace("−", ""));
});

test("the staircase on Home matches Distribution for the month, with the Draft tag (F7, Rule 4)", async () => {
  await owner.goto("/en");
  const house = owner.getByRole("region", { name: /The house this month/ });
  await expect(house.getByText("Draft")).toBeVisible();
  const homeTotal = (await house.getByTestId("home-distributable").locator(".stat-value").textContent())!;
  await owner.goto(`/en/distribution?month=${HOME_MONTH}`);
  await expect(owner.getByTestId("distributable").locator(".stat-value")).toHaveText(homeTotal);
});

test("the Super Admin's desk matches the fund accounts and the request queue; See details breaks the formula down (F5, G8)", async () => {
  await admin.goto("/en");
  const desk = admin.getByRole("region", { name: "Bookkeeper's desk" });
  await expect(desk.getByText("Super Admin only")).toBeVisible();
  const funds: { isActive: boolean; balancePaisa: number }[] = (await api(admin, "/fund-accounts?active=true")).items;
  await expect(desk.getByTestId("fund-total")).toHaveText(money(funds.reduce((s, f) => s + f.balancePaisa, 0)));
  const queue = await api(admin, "/requests");
  await expect(desk.getByTestId("pending-count")).toHaveText(String(queue.pending.length));
  await expect(desk.getByText(/^(Balanced|Check)$/)).toBeVisible();
  await desk.getByRole("button", { name: "See details" }).click();
  const dialog = admin.getByRole("dialog", { name: "Reconciliation details" });
  await expect(dialog.getByRole("row", { name: /Difference/ })).toBeVisible();
  await admin.keyboard.press("Escape");
});

test("+ Expense on Home opens the usual drawer and Home updates without a reload (F1, F11)", async () => {
  await admin.goto("/en");
  const house = admin.getByRole("region", { name: /The house this month/ });
  const before = (await house.getByRole("link", { name: /^Expense/ }).locator(".stat-value").textContent())!;
  await admin.getByRole("button", { name: "Expense", exact: true }).click();
  const drawer = admin.getByRole("dialog", { name: "New expense" });
  await drawer.locator("#e-amount").fill("1,234");
  await drawer.locator("#e-vendor").fill("E2E Home shortcut");
  await drawer.getByRole("button", { name: /Save expense/ }).click();
  await expect(drawer).toBeHidden();
  await expect(admin).toHaveURL(/\/en$/);
  await expect(admin.getByRole("list", { name: "Latest activity" }).getByRole("link").first()).toContainText("−৳1,234");
  await expect(house.getByRole("link", { name: /^Expense/ }).locator(".stat-value")).not.toHaveText(before);
});

test("the close-the-month reminder shows while last month is open and Hide today survives a reload (F6, Rule 9)", async () => {
  await setPeriodStatus(PREV, "OPEN");
  await admin.goto("/en");
  const strip = admin.getByRole("note").filter({ hasText: `Close-the-month reminder. ${label(PREV)} is open.` });
  await expect(strip).toBeVisible();
  await expect(strip.getByRole("link", { name: /Review distribution/ })).toHaveAttribute("href", `/en/distribution?month=${PREV}`);
  await strip.getByRole("button", { name: "Hide today" }).click();
  await expect(strip).toHaveCount(0);
  await admin.reload();
  await expect(admin.getByRole("region", { name: "Bookkeeper's desk" })).toBeVisible();
  await expect(admin.getByText(`Close-the-month reminder. ${label(PREV)} is open.`)).toHaveCount(0);
});

test("on a phone the Super Admin gets Home · Entries · + · Distribution · More, and More reaches Settings (§4 Mobile)", async ({ browser }) => {
  const phone = await (await loggedIn(browser, ADMIN.username, ADMIN.password, { width: 360, height: 780 })).newPage();
  await phone.goto("/en");
  const nav = phone.locator("nav.bottom-nav");
  const labels = await nav.locator(":scope > *").evaluateAll((els) => els.map((el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").split(" · ")[0]));
  expect(labels).toEqual(["Home", "Income & expenses", "Add expense", "Distribution", "More"]);
  await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("button", { name: "More" }).click();
  const sheet = phone.getByRole("dialog", { name: "All sections" });
  await expect(sheet.getByRole("button", { name: /Log out/ })).toBeVisible();
  await sheet.getByRole("link", { name: /Settings/ }).click();
  await expect(phone).toHaveURL(/\/en\/settings$/);
  await expect(sheet).toBeHidden();
  await phone.context().close();
});

test("in বাংলা at 360px the owner's Home fits with no sideways scroll (F10, Rule 11)", async ({ browser }) => {
  await resetRateLimits();
  const phone = await (await loggedIn(browser, OWNER.username, OWNER.password, { width: 360, height: 780 })).newPage();
  await phone.goto("/bn");
  await expect(phone.getByRole("heading", { level: 1, name: /^স্বাগতম, / })).toBeVisible();
  await expect(phone.getByTestId("hero-amount")).toHaveText(/৳[০-৯]/);
  const labels = await phone.locator("nav.bottom-nav > *").evaluateAll((els) => els.map((el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").split(" · ")[0]));
  expect(labels).toEqual(["হোম", "আমার হিসাব", "অনুরোধ", "আয় ও ব্যয়", "আরও"]);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await phone.screenshot({ path: ".context/screens/mobile-bn-home.png", fullPage: true });
  await phone.context().close();
});

test("cleanup: the expense is voided and last month's status restored", async () => {
  const list = await api(admin, `/transactions?period=${HOME_MONTH}&kind=EXPENSE&limit=200`);
  const mine = list.items.find((t: { vendor: string | null; amountPaisa: number; voidedAt: string | null }) => t.vendor === "E2E Home shortcut" && t.amountPaisa === EXPENSE_PAISA && !t.voidedAt);
  expect(mine, "expense recorded from Home").toBeTruthy();
  expect((await write(admin, `/transactions/${mine.id}/void`, { reason: "E2E: undo the Home shortcut expense" })).status()).toBe(200);
  if (!wasOpen.includes(PREV)) await setPeriodStatus(PREV, "CLOSED");
});
