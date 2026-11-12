import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ADMIN } from "./global-setup";

// Screens A1–A4, A5–A7 in both languages; must be usable at 360px (no page-level horizontal scroll).
const PUBLIC = [
  ["login", "/login"],
  ["forgot", "/forgot"],
  ["reset-expired", "/reset/not-a-real-token"],
  ["invite-expired", "/invite/not-a-real-token"],
] as const;
const PRIVATE = [
  ["home", "/"],
  ["users", "/admin/users"],
  ["me", "/me"],
  // The current month (it has entries; later months may exist once a month was closed).
  ["entries", `/entries?type=EXPENSE&period=${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit" }).format(new Date())}`],
  ["settings", "/settings"],
  ["distribution", "/distribution"],
  ["requests", "/requests"],
  ["notices", "/notices"],
  ["reports-monthly", "/reports/monthly"],
  ["reports-yearly", "/reports/yearly"],
] as const;

mkdirSync(".context/screens", { recursive: true });

for (const locale of ["bn", "en"] as const) {
  test(`auth screens render cleanly in ${locale}`, async ({ page, context, baseURL }, info) => {
    test.setTimeout(150_000); // may wait out the shared auth rate limit once
    const url = new URL(baseURL!);

    for (const [name, path] of PUBLIC) {
      await page.goto(`/${locale}${path}`);
      await expect(page.locator(".auth-panel h1, .auth-panel h2").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${name} horizontal overflow`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `.context/screens/${info.project.name}-${locale}-${name}.png`, fullPage: true });
    }

    // Log in through the API (shares the cookie jar) — username on one project, email on the other.
    const identifier = info.project.name === "desktop" ? ADMIN.username : ADMIN.email;
    const login = () =>
      context.request.post("/api/v1/auth/login", { data: { identifier, password: ADMIN.password, remember: false }, headers: { origin: url.origin } });
    let res = await login();
    // Earlier specs share the per-IP auth limit (10/min): wait it out once instead of skipping.
    if (res.status() === 429) {
      await page.waitForTimeout((Number(res.headers()["retry-after"] ?? 60) + 1) * 1000);
      res = await login();
    }
    // The admin exists only after auth.spec accepted the seed invite; run the full suite.
    test.skip(res.status() !== 200, "needs the admin onboarded by auth.spec — run `pnpm test:e2e`");

    // Owners screens (owners-ui): the list and the first owner's statement.
    const ownersRes = await context.request.get("/api/v1/owners");
    const ownerId: string | undefined = (await ownersRes.json()).data?.owners?.[0]?.id;
    const pages: (readonly [string, string])[] = [...PRIVATE, ["owners", "/owners"], ...(ownerId ? ([["owner", `/owners/${ownerId}`]] as const) : [])];

    for (const [name, path] of pages) {
      await page.goto(path === "/" ? `/${locale}` : `/${locale}${path}`);
      await expect(page.locator("main h1").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${name} horizontal overflow`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `.context/screens/${info.project.name}-${locale}-${name}.png`, fullPage: true });

      // The fixed bottom nav must fit too (it isn't part of the page scroll width).
      const nav = await page.locator(".bottom-nav").evaluate((el) => (getComputedStyle(el).display === "none" ? 0 : el.scrollWidth - el.clientWidth));
      expect(nav, `${name} bottom nav overflow`).toBeLessThanOrEqual(0);

      if (name === "entries") {
        // < 860px the header actions move to the yellow + FAB (PRD §6.1 Mobile).
        const fab = page.getByRole("button", { name: locale === "bn" ? "ব্যয় যোগ করুন" : "Add expense" }).locator("visible=true");
        await expect(fab).toHaveCount(1);
        if (info.project.name === "mobile-360") {
          await expect(page.locator(".entries-fab")).toBeVisible();
          // Scrolled to the end, the floating buttons must not cover the total.
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          const total = (await page.locator(".entry-total").boundingBox())!;
          const fab = (await page.locator(".entries-fab").boundingBox())!;
          expect(fab.y, "FAB clears the list total").toBeGreaterThanOrEqual(total.y + total.height);
        }
      }

      if (name === "home") {
        // Logout confirmation: sidebar on desktop, the More sheet at 360px (Home PRD §4).
        if (info.project.name === "mobile-360") await page.locator("nav.bottom-nav").getByRole("button", { name: locale === "bn" ? "আরও" : "More" }).click();
        await page.getByRole("button", { name: locale === "bn" ? "লগ আউট" : "Log out" }).locator("visible=true").first().click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toBeVisible();
        await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
        const box = (await dialog.boundingBox())!;
        expect(box.x + box.width, "logout dialog fits the viewport").toBeLessThanOrEqual(page.viewportSize()!.width);
        await page.screenshot({ path: `.context/screens/${info.project.name}-${locale}-confirm-logout.png` });
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
      }

      if (name === "me") {
        // Birthday uses the shadcn Calendar popover, never the native date picker.
        await expect(page.locator('input[type="date"]')).toHaveCount(0);
        await page.locator("#me-birthday").click();
        const calendar = page.locator('[data-slot="calendar"]');
        await expect(calendar).toBeVisible();
        await page.locator('[data-slot="popover-content"]').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
        const box = await calendar.boundingBox();
        const pop = (await page.locator('[data-slot="popover-content"]').boundingBox())!;
        const vp = page.viewportSize()!;
        expect(box!.x + box!.width, "calendar fits the viewport width").toBeLessThanOrEqual(vp.width);
        expect(pop.y, "popover not clipped at the top").toBeGreaterThanOrEqual(0);
        expect(pop.y + pop.height, "popover not clipped at the bottom").toBeLessThanOrEqual(vp.height);
        await page.screenshot({ path: `.context/screens/${info.project.name}-${locale}-me-birthday.png` });
        await page.keyboard.press("Escape");

        await page.getByRole("button", { name: locale === "bn" ? "সব ডিভাইস থেকে লগ আউট" : "Log out all devices" }).click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toBeVisible();
        await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
        await page.screenshot({ path: `.context/screens/${info.project.name}-${locale}-confirm-logout-all.png` });
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
      }
    }
  });
}
