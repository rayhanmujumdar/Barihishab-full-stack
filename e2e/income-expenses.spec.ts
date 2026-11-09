import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { latestEmailToken, setPeriodStatus } from "./db";
import { ADMIN } from "./global-setup";

// One story through the Income & Expenses PRD §14 acceptance criteria. Runs
// after auth.spec.ts (files run in order, one worker), which onboards ADMIN.
test.describe.configure({ mode: "serial" });

const OWNER = { username: "nasrin", email: "nasrin@example.com", password: "Nasrin!ledger-42" };
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

const dhakaMonth = (offset = 0) => {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit" }).format(new Date()).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return d.toISOString().slice(0, 7);
};
const label = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
const MONTH = dhakaMonth();
const PREV = dhakaMonth(-1);

let admin: Page;
let ownerContext: BrowserContext;

async function loggedIn(browser: Browser, identifier: string, password: string): Promise<BrowserContext> {
  const baseURL = test.info().project.use.baseURL!;
  const context = await browser.newContext({ baseURL });
  const res = await context.request.post("/api/v1/auth/login", { data: { identifier, password, remember: false }, headers: { origin: new URL(baseURL).origin } });
  expect(res.status(), "admin onboarded by auth.spec").toBe(200);
  return context;
}

async function csrf(context: BrowserContext) {
  return (await context.cookies()).find((c) => c.name === "bh_csrf")!.value;
}

const entries = (page: Page) => page.getByRole("list", { name: "Entries" }).getByRole("button");

test.afterAll(async () => {
  await admin?.context().close();
  await ownerContext?.close();
});

test("the Super Admin sets up fund accounts and units in Settings (MST-01/02)", async ({ browser }) => {
  admin = await (await loggedIn(browser, ADMIN.username, ADMIN.password)).newPage();
  await admin.goto("/en/settings");
  await expect(admin.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

  for (const [name, type] of [["Cash box", "CASH"], ["DBBL savings", "BANK"]] as const) {
    await admin.getByRole("region", { name: "Fund accounts" }).getByRole("button", { name: "Add" }).click();
    await admin.locator("#m-name").fill(name);
    await admin.locator("#m-type").selectOption(type);
    await admin.getByRole("button", { name: /^Save/ }).click();
    await expect(admin.getByRole("listitem", { name })).toBeVisible();
  }

  for (const [name, tenant, rent] of [["Flat 1A", "Kamal Uddin", "18,000"], ["Flat 1B", "Shirin Akter", "18,000"], ["Flat 3A", "Nusrat Jahan", "22,000"]]) {
    await admin.getByRole("region", { name: "Units" }).getByRole("button", { name: "Add" }).click();
    await admin.locator("#m-name").fill(name);
    await admin.locator("#m-tenant").fill(tenant);
    await admin.locator("#m-rent").fill(rent);
    await admin.locator("#m-fund").selectOption({ label: "DBBL savings" });
    await admin.getByRole("button", { name: /^Save/ }).click();
    await expect(admin.getByRole("listitem", { name })).toBeVisible();
  }
  // System categories are locked.
  await expect(admin.getByRole("listitem", { name: "House rent" }).getByText("System")).toBeVisible();
});

test("Generate rent drafts every unit; an unticked unit is the only one offered next time (INC-04)", async () => {
  await admin.goto(`/en/entries?period=${MONTH}&type=INCOME`);
  await expect(admin.getByText(`No income added for ${label(MONTH)} yet.`)).toBeVisible();

  await admin.getByRole("button", { name: "Generate rent", exact: true }).click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog.getByTestId("rent-total")).toHaveText("৳58,000");
  await dialog.getByRole("checkbox", { name: "Include Flat 3A" }).click();
  await expect(dialog.getByTestId("rent-total")).toHaveText("৳36,000");
  await dialog.getByRole("button", { name: "Save rent entries" }).click();
  await expect(admin.getByText("2 rent entries saved")).toBeVisible();
  await expect(entries(admin)).toHaveCount(2);
  await expect(admin.getByRole("button", { name: /^Income/ })).toContainText("2 entries · ৳36,000");

  await admin.getByRole("button", { name: "Generate rent", exact: true }).click();
  await expect(dialog.getByRole("checkbox")).toHaveCount(1);
  await expect(dialog.getByRole("checkbox", { name: "Include Flat 3A" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("an expense with a bill photo is saved once even on a double click, and its bill opens (EXP-01, ATT-01, DUP-01)", async () => {
  await admin.getByRole("button", { name: "Add expense" }).click();
  const drawer = admin.getByRole("dialog", { name: "New expense" });
  await drawer.locator("#e-amount").fill("6,300");
  await drawer.locator("#e-vendor").fill("DESCO");
  await drawer.getByTestId("bill-input").setInputFiles({ name: "desco.png", mimeType: "image/png", buffer: PNG_1PX });
  await expect(drawer.getByText("Uploading…")).toHaveCount(0);
  await expect(drawer.getByRole("img", { name: "desco.png" })).toBeVisible();
  await drawer.getByRole("button", { name: /Save expense/ }).dblclick();
  await expect(admin.getByText(`Expense of ৳6,300 added to ${label(MONTH)}`)).toBeVisible();

  await admin.getByRole("button", { name: /^Expense/ }).click();
  await expect(admin.getByRole("button", { name: /^Expense/ })).toContainText("1 entry · ৳6,300");
  await expect(entries(admin)).toHaveCount(1);
  await expect(entries(admin).first().getByLabel("1 files attached")).toBeVisible();

  await entries(admin).first().click();
  const detail = admin.getByRole("dialog", { name: "Electricity" });
  const bill = detail.getByRole("button", { name: "Open desco.jpg" });
  await expect(bill).toBeVisible();
  // The thumbnail loads from the private bucket through a signed URL (and the CSP allows it).
  await expect.poll(() => bill.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
});

test("a correction needs a reason and shows Corrected with before → after (COR-01)", async () => {
  const detail = admin.getByRole("dialog", { name: "Electricity" });
  await detail.getByRole("button", { name: "Correct" }).click();
  const drawer = admin.getByRole("dialog", { name: "Correct entry" });
  await drawer.locator("#e-amount").fill("6,400");
  await drawer.getByRole("button", { name: /Save correction/ }).click();
  await expect(drawer.getByText("Write a short reason — every owner can see it.")).toBeVisible();
  await drawer.locator("#e-reason").fill("Typo — the DESCO bill reads ৳6,400");
  await drawer.getByRole("button", { name: /Save correction/ }).click();
  await expect(admin.getByText("Correction saved")).toBeVisible();

  await expect(entries(admin).first()).toContainText("Corrected");
  await entries(admin).first().click();
  const again = admin.getByRole("dialog", { name: "Electricity" });
  await expect(again.getByText("৳6,300 → ৳6,400")).toBeVisible();
  await expect(again.getByText("“Typo — the DESCO bill reads ৳6,400”")).toBeVisible();
  await admin.keyboard.press("Escape");
});

test("voiding asks for a reason; the row stays struck through and leaves the total (VOD-01)", async () => {
  await admin.getByRole("button", { name: "Add expense" }).click();
  const drawer = admin.getByRole("dialog", { name: "New expense" });
  await drawer.locator("#e-amount").fill("1000");
  await drawer.getByRole("button", { name: /Save expense/ }).click();
  await expect(admin.getByRole("button", { name: /^Expense/ })).toContainText("2 entries · ৳7,400");

  await entries(admin).filter({ hasText: "৳1,000" }).click();
  await admin.getByRole("dialog", { name: "Electricity" }).getByRole("button", { name: "Void" }).click();
  const confirm = admin.getByRole("alertdialog", { name: "Void this entry?" });
  await expect(confirm.getByRole("button", { name: "Void entry" })).toBeDisabled();
  await confirm.getByLabel("Reason").fill("Duplicate entry");
  await confirm.getByRole("button", { name: "Void entry" }).click();
  await expect(admin.getByText("Void · Duplicate entry")).toBeVisible();
  await expect(confirm).toBeHidden();
  // Focus stays in the drawer (the Void button is gone), so Escape still closes it.
  await expect(admin.getByRole("dialog", { name: "Electricity" }).getByRole("button", { name: "Close" })).toBeFocused();
  await admin.keyboard.press("Escape");

  await expect(entries(admin).filter({ hasText: "৳1,000" })).toHaveAttribute("data-void", "true");
  await expect(admin.getByRole("button", { name: /^Expense/ })).toContainText("৳6,400");
  await expect(admin.locator(".entry-total")).toContainText("৳6,400");
});

test("a Closed month shows the lock banner and no create buttons (LCK-01)", async () => {
  await setPeriodStatus(PREV, "CLOSED");
  await admin.goto(`/en/entries?period=${PREV}&type=EXPENSE`);
  await expect(admin.getByText(`${label(PREV)} is closed and locked.`, { exact: false })).toBeVisible();
  await expect(admin.getByText(/reopen it from Distribution/)).toBeVisible();
  await expect(admin.getByRole("button", { name: "Generate rent", exact: true })).toHaveCount(0);
  await expect(admin.getByRole("button", { name: "Add expense" })).toHaveCount(0);
  await admin.screenshot({ path: ".context/screens/desktop-en-entries-closed.png", fullPage: true });
});

test("an Owner sees everything read-only and gets 403 on writes (IE-15)", async ({ browser, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const created = await admin.context().request.post("/api/v1/users", {
    data: { username: OWNER.username, email: OWNER.email, role: "OWNER", locale: "en" },
    headers: { origin, "x-csrf-token": await csrf(admin.context()) },
  });
  expect(created.status()).toBe(201);
  ownerContext = await browser.newContext({ baseURL });
  const accepted = await ownerContext.request.post("/api/v1/auth/accept-invite", {
    data: { token: await latestEmailToken(OWNER.email, "INVITE"), password: OWNER.password, locale: "en" },
    headers: { origin },
  });
  expect(accepted.status()).toBe(200);

  const page = await ownerContext.newPage();
  await page.goto(`/en/entries?period=${MONTH}&type=EXPENSE`);
  await expect(entries(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Add expense" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate rent", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);

  await entries(page).filter({ hasText: "৳6,400" }).click();
  const detail = page.getByRole("dialog", { name: "Electricity" });
  await expect(detail.getByRole("button", { name: "Open desco.jpg" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Correct" })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "Void" })).toHaveCount(0);

  const write = await ownerContext.request.post("/api/v1/transactions", {
    data: {},
    headers: { origin, "x-csrf-token": await csrf(ownerContext), "idempotency-key": "owner-try-1" },
  });
  expect(write.status()).toBe(403);
  await page.goto("/en/settings");
  await expect(page.getByTestId("forbidden")).toBeVisible();
});
