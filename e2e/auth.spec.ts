import { readFileSync } from "node:fs";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { latestEmailToken } from "./db";
import { ADMIN, STATE_FILE } from "./global-setup";

// One story, in order: the seeded Super Admin onboards, invites an Owner, and
// we walk every door and guard of the auth PRD (§9 acceptance criteria).
test.describe.configure({ mode: "serial" });

const KARIM = { username: "karim", email: "karim@example.com", password: "Karim!secure-77", newPassword: "Karim!fresh-88" };

let admin: Page;
let owner: BrowserContext;

async function loginWith(page: Page, identifier: string, password: string, lang: "bn" | "en" = "bn") {
  await page.goto(`/${lang}/login`);
  await page.locator("#identifier").fill(identifier);
  await page.locator("#password").fill(password);
  await page.locator('form button[type="submit"]').click();
}

/** Logout always asks first (destructive-action-confirm). */
async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Log out" }).click();
}

async function newContext(browser: Browser, locale?: string) {
  return browser.newContext({ baseURL: test.info().project.use.baseURL, ...(locale ? { locale } : {}) });
}

test.afterAll(async () => {
  await owner?.close();
});

test("the first Super Admin accepts the seed invite (Bangla by default) and lands on Home", async ({ browser }) => {
  const { inviteUrl } = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { inviteUrl: string };
  admin = await (await newContext(browser)).newPage();
  await admin.goto(inviteUrl);
  await expect(admin.getByRole("heading", { name: /স্বাগতম/ })).toBeVisible();
  await expect(admin.locator("#invite-username")).toHaveValue(ADMIN.username);
  await admin.locator("#invite-new").fill(ADMIN.password);
  await admin.locator("#invite-repeat").fill(ADMIN.password);
  await admin.getByRole("radio", { name: "English" }).check();
  await admin.locator('form button[type="submit"]').click();
  await expect(admin).toHaveURL(/\/en$/);
  await expect(admin.getByRole("heading", { name: "Bookkeeper's desk" })).toBeVisible();

  // The invite link works once.
  const again = await (await newContext(browser)).newPage();
  await again.goto(inviteUrl);
  await expect(again.getByText(/আগেই ব্যবহার করা হয়েছে/)).toBeVisible();
  await again.context().close();
});

test("logout asks first: Cancel keeps the session, confirm logs out", async () => {
  await admin.getByRole("button", { name: "Log out" }).first().click();
  const dialog = admin.getByRole("alertdialog", { name: "Log out?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await admin.reload();
  await expect(admin.getByRole("heading", { name: "Bookkeeper's desk" })).toBeVisible();
});

test("logs out and back in with the username and with the email, in any letter case", async () => {
  await logout(admin);
  await expect(admin).toHaveURL(/\/login/);
  await loginWith(admin, "BookKeeper", ADMIN.password, "en");
  await expect(admin).toHaveURL(/\/en$/);
  await logout(admin);
  await loginWith(admin, "Admin@Example.COM", ADMIN.password, "en");
  await expect(admin.getByRole("heading", { name: "Bookkeeper's desk" })).toBeVisible();
});

test("the Super Admin creates an Owner from the Users screen and an invite is queued", async () => {
  await admin.goto("/admin/users");
  await admin.getByRole("button", { name: /New user/ }).click();
  const drawer = admin.getByRole("dialog", { name: "New user" });
  await drawer.locator("#u-username").fill(KARIM.username);
  await drawer.locator("#u-email").fill(KARIM.email);
  await drawer.locator("#u-first").fill("Karim");
  await drawer.locator("#u-resp").fill("Electricity bill");
  await drawer.getByRole("button", { name: /Save and send invite/ }).click();
  await expect(admin.getByText(`Invite sent to ${KARIM.email}.`)).toBeVisible();
  await expect(admin.getByRole("row", { name: /Karim/ })).toContainText("Invited");
});

test("revoking an invite asks first; Cancel sends nothing, confirm kills it", async ({ browser }) => {
  await admin.goto("/admin/users");
  await admin.getByRole("button", { name: /New user/ }).click();
  const drawer = admin.getByRole("dialog", { name: "New user" });
  await drawer.locator("#u-username").fill("rafi");
  await drawer.locator("#u-email").fill("rafi@example.com");
  await drawer.locator("#u-first").fill("Rafi");
  await drawer.getByRole("button", { name: /Save and send invite/ }).click();
  await expect(admin.getByRole("row", { name: /Rafi/ })).toContainText("Invited");

  const openRevoke = async () => {
    await admin.getByRole("button", { name: "Actions for Rafi" }).click();
    await admin.getByRole("menuitem", { name: "Revoke invite" }).click();
    return admin.getByRole("alertdialog", { name: "Revoke Rafi's invite?" });
  };
  let dialog = await openRevoke();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(admin.getByText("Invite revoked.")).toHaveCount(0);

  dialog = await openRevoke();
  await dialog.getByRole("button", { name: "Revoke invite" }).click();
  await expect(admin.getByText("Invite revoked.")).toBeVisible();

  // The emailed link is dead at once (INV-05).
  const token = await latestEmailToken("rafi@example.com", "INVITE");
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await page.goto(`/bn/invite/${token}`);
  await expect(page.getByText(/আগেই ব্যবহার করা হয়েছে/)).toBeVisible();
  await expect(page.locator("#invite-new")).toHaveCount(0);
  await ctx.close();
});

test("the Owner accepts the invite in another browser and is refused admin pages and APIs", async ({ browser }) => {
  const token = await latestEmailToken(KARIM.email, "INVITE");
  owner = await newContext(browser);
  const page = await owner.newPage();
  await page.goto(`/bn/invite/${token}`);
  await expect(page.getByText(/মেয়াদ শেষ হবে \S+ ঘণ্টায়/)).toBeVisible();
  await page.locator("#invite-new").fill(KARIM.password);
  await page.locator("#invite-repeat").fill(KARIM.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/bn$/);

  // Owner never sees admin navigation or blocks.
  await expect(page.getByRole("link", { name: /ব্যবহারকারী/ })).toHaveCount(0);
  await expect(page.getByText("হিসাবরক্ষকের ডেস্ক")).toHaveCount(0);

  // Direct navigation → "no access" page without user data; direct API call → HTTP 403 with no data.
  await page.goto("/admin/users");
  await expect(page.getByText("এখানে আপনার প্রবেশাধিকার নেই")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  const api = await owner.request.get("/api/v1/users");
  expect(api.status()).toBe(403);
  const body = await api.json();
  expect(body.data).toBeUndefined();
  expect(body.error.code).toBe("FORBIDDEN");
});

test("five wrong passwords lock the account for 15 minutes", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  // Use the email here so the username's per-identifier rate-limit bucket stays free.
  for (let i = 1; i <= 5; i++) {
    await loginWith(page, KARIM.email, "definitely-wrong");
    const alert = page.locator("#login-error");
    if (i < 5) await expect(alert).toContainText("ভুল");
    if (i === 3) await expect(alert).toContainText("২টি চেষ্টা বাকি");
  }
  await expect(page.locator("#login-error")).toContainText("১৫ মিনিট");
  await ctx.close();
});

test("forgot password gives the same answer for real and fake emails; the reset link logs out other devices", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  for (const email of ["nobody@example.com", KARIM.email]) {
    await page.goto("/bn/forgot");
    await page.locator("#email").fill(email);
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByText("ইমেইলটির অ্যাকাউন্ট থাকলে একটি লিংক পাঠানো হচ্ছে।")).toBeVisible();
  }
  const token = await latestEmailToken(KARIM.email, "RESET");
  await page.goto(`/bn/reset/${token}`);
  await page.locator("#pw-new").fill(KARIM.newPassword);
  await page.locator("#pw-repeat").fill(KARIM.newPassword);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/bn$/);

  // The Owner's other browser is signed out at once (strict page check).
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/bn/me");
  await expect(ownerPage).toHaveURL(/\/login/);

  // The link works only once.
  await page.goto(`/bn/reset/${token}`);
  await expect(page.getByText("এই লিংকের মেয়াদ শেষ")).toBeVisible();
  await owner.close();
  owner = ctx; // keep the freshly reset session for the next step
});

test("log out all devices ends the session in a second browser", async ({ browser }) => {
  const second = await newContext(browser);
  const p2 = await second.newPage();
  await loginWith(p2, "KARIM", KARIM.newPassword);
  await expect(p2).toHaveURL(/\/bn$/);

  const p1 = await owner.newPage();
  await p1.goto("/bn/me");
  await p1.getByRole("button", { name: "সব ডিভাইস থেকে লগ আউট" }).click();
  await p1.getByRole("alertdialog").getByRole("button", { name: "সব ডিভাইস থেকে লগ আউট" }).click();
  await expect(p1).toHaveURL(/\/login/);

  await p2.goto("/bn/me");
  await expect(p2).toHaveURL(/\/login/);
  await second.close();
});

test("a deactivated user is logged out everywhere and cannot log in", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await loginWith(page, KARIM.username, KARIM.newPassword);
  await expect(page).toHaveURL(/\/bn$/);

  await admin.goto("/admin/users");
  await admin.getByRole("button", { name: "Actions for Karim" }).click();
  await admin.getByRole("menuitem", { name: "Deactivate" }).click();
  const dialog = admin.getByRole("alertdialog", { name: "Deactivate Karim?" });
  await dialog.getByLabel("Reason").fill("Moved abroad");
  await dialog.getByRole("button", { name: "Deactivate" }).click();
  await expect(admin.getByText(/deactivated and logged out everywhere/)).toBeVisible();
  await expect(admin.getByRole("row", { name: /Karim/ })).toContainText("Inactive");

  await page.goto("/bn/me");
  await expect(page).toHaveURL(/\/login/);
  await loginWith(page, KARIM.username, KARIM.newPassword);
  await expect(page.locator("#login-error")).toContainText("ভুল");
  await ctx.close();
});

test("the last active Super Admin cannot be deactivated (UI disabled)", async () => {
  await admin.goto("/admin/users");
  await admin.getByRole("button", { name: /Actions for bookkeeper/ }).click();
  await expect(admin.getByRole("menuitem", { name: "Deactivate" })).toBeDisabled();
});

test("pages are translated on the server: raw HTML already holds the right language", async ({ request }) => {
  const en = await (await request.get("/en/login")).text();
  expect(en).toContain('<html lang="en"');
  expect(en).toContain("Username or email");
  const bn = await (await request.get("/bn/login")).text();
  expect(bn).toContain('<html lang="bn"');
  expect(bn).toContain("ইউজারনেম বা ইমেইল");
});

test("/en/admin/users renders the admin users page in English (server-side)", async ({ request }) => {
  const html = await (await admin.context().request.get("/en/admin/users")).text();
  expect(html).toContain('<html lang="en"');
  expect(html).toContain("Super Admin only");
  expect(html).toContain("House responsibility");
  await admin.goto("/en/admin/users");
  await expect(admin.getByRole("heading", { name: "Users" })).toBeVisible();
  void request;
});

test("URLs without a language redirect; unsupported languages 404; the toggle keeps the path", async ({ browser }) => {
  // A Bangla-preferring browser (Accept-Language bn-BD).
  const ctx = await newContext(browser, "bn-BD");
  const page = await ctx.newPage();
  await page.goto("/forgot");
  await expect(page).toHaveURL(/\/bn\/forgot$/);
  const res = await page.goto("/xx/login");
  expect(res?.status()).toBe(404);

  await page.goto("/bn/forgot");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/forgot$/);
  await expect(page.getByRole("heading", { name: "Forgot password" })).toBeVisible();
  // The choice is remembered for prefix-less URLs.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/en\/login$/);
  await ctx.close();
});

test("internal links keep the current language", async () => {
  await admin.goto("/en");
  await admin.getByRole("link", { name: "Users" }).first().click();
  await expect(admin).toHaveURL(/\/en\/admin\/users$/);
  await admin.getByRole("link", { name: "Profile" }).first().click();
  await expect(admin).toHaveURL(/\/en\/me$/);
});

test("pages send the security headers (noindex, CSP, framing, HSTS in production)", async ({ request }) => {
  const res = await request.get("/en/login");
  const h = res.headers();
  expect(h["x-robots-tag"]).toBe("noindex, nofollow");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin");
  expect(h["strict-transport-security"]).toContain("max-age=31536000"); // E2E runs `next start` (production)
  const html = await res.text();
  expect(html).toMatch(/<meta name="robots" content="noindex, nofollow/);
});
