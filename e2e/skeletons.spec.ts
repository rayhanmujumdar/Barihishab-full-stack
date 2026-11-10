import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { resetRateLimits } from "./db";
import { ADMIN } from "./global-setup";

// loading-skeletons spec. Named to run after auth.spec (admin) and owners.spec (owners).
// Page skeletons: on client navigation the prefetched fallback renders at once
// while the page's dynamic RSC request is held open here.
// Shell skeleton: a hard load with JavaScript off never swaps streamed content
// in, so the layout fallback stays on screen to be measured.

mkdirSync(".context/screens", { recursive: true });

const NEUTRAL_200 = "rgb(234, 231, 231)"; // --color-neutral-200 #eae7e7

const AUTH_STATE = ".context/e2e-skeletons-auth.json";

// One login for the whole file (the auth limit is 10/min per IP); every test reuses the cookie.
test.beforeAll(async ({ browser, baseURL }) => {
  await resetRateLimits();
  // Fresh, cookie-less context: test.use() below would otherwise inject the not-yet-written state.
  const context = await browser.newContext({ baseURL, storageState: undefined });
  const res = await context.request.post("/api/v1/auth/login", {
    data: { identifier: ADMIN.username, password: ADMIN.password, remember: false },
    headers: { origin: new URL(baseURL!).origin },
  });
  test.skip(res.status() !== 200, "needs the admin onboarded by auth.spec — run `pnpm test:e2e`");
  await context.storageState({ path: AUTH_STATE });
  await context.close();
});
test.afterAll(() => resetRateLimits());
test.use({ storageState: AUTH_STATE });

/** Holds the next navigation RSC request for `pathname` until `release()`. */
async function holdNavigation(page: Page, pathname: string) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let held = false;
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      const h = route.request().headers();
      // Next's own App Router request headers (internal, may change on upgrade):
      // `rsc: 1` marks a client-navigation data fetch; the two prefetch headers mark
      // prefetches, which must pass so the fallback is ready. If this test starts
      // timing out after a Next upgrade, check these names first.
      const navigationRsc = h["rsc"] === "1" && !h["next-router-prefetch"] && !h["next-router-segment-prefetch"];
      if (navigationRsc && !held) {
        held = true;
        await gate;
      }
      await route.continue();
    },
  );
  return () => release();
}

const VISIBLE_LOADING_TEXT = /^(Loading|লোড হচ্ছে)…$|Loading owners…|Checking the month…/;

const PAGES: { name: string; locale: "en" | "bn"; path: string; label: string }[] = [
  { name: "owners", locale: "en", path: "/owners", label: "Loading owners…" },
  { name: "distribution", locale: "bn", path: "/distribution", label: "বণ্টনের হিসাব লোড হচ্ছে…" },
  { name: "advances", locale: "en", path: "/advances", label: "Loading advances and loans…" },
  { name: "requests", locale: "en", path: "/requests", label: "Loading requests…" },
  { name: "users", locale: "en", path: "/admin/users", label: "Loading users…" },
  { name: "settings", locale: "en", path: "/settings", label: "Loading settings…" },
  { name: "me", locale: "en", path: "/me", label: "Loading your profile…" },
];

test.describe("page skeletons while a page streams in", () => {
  for (const p of PAGES) {
    test(`${p.name} (${p.locale}) shows its skeleton, then the page`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "sidebar navigation runs on desktop");
      // Start from Home so the sidebar link (and its prefetch) is there.
      await page.goto(`/${p.locale}`);
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.waitForLoadState("networkidle");

      const target = `/${p.locale}${p.path}`;
      const release = await holdNavigation(page, target);
      await page.locator(`.sidebar a[href="${target}"]`).click();

      const region = page.locator(`main [aria-busy="true"][aria-label="${p.label}"]`);
      await expect(region).toBeVisible();
      expect(await region.locator(".skeleton").count()).toBeGreaterThan(3);
      await expect(page.locator("main p", { hasText: VISIBLE_LOADING_TEXT })).toHaveCount(0);
      await page.screenshot({ path: `.context/screens/skeleton-${p.name}-loading.png` });

      release();
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
      await page.screenshot({ path: `.context/screens/skeleton-${p.name}-loaded.png` });
    });
  }

  test("owner detail shows its skeleton from the owners list", async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop", "desktop only");
    const ownerId: string | undefined = (await (await context.request.get("/api/v1/owners")).json()).data?.owners?.[0]?.id;
    test.skip(!ownerId, "needs an owner (created by earlier specs)");
    await page.goto("/en/owners");
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    const target = `/en/owners/${ownerId}`;
    const release = await holdNavigation(page, target);
    await page.locator(`main a[href="${target}"]`).first().click();
    const region = page.locator('main [aria-busy="true"][aria-label="Loading the owner…"]');
    await expect(region).toBeVisible();
    await expect(region.locator(".stats > .stat")).toHaveCount(5);
    await page.screenshot({ path: ".context/screens/skeleton-owner-loading.png" });
    release();
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  });
});

test.describe("app shell skeleton on a hard load", () => {
  async function shellPage(browser: Browser, opts: { width: number; height: number; reducedMotion?: "reduce" }) {
    const noJs = await browser.newContext({
      javaScriptEnabled: false,
      storageState: AUTH_STATE,
      viewport: { width: opts.width, height: opts.height },
      reducedMotion: opts.reducedMotion ?? "no-preference",
      locale: "en-US",
    });
    const page = await noJs.newPage();
    await page.goto("/en/owners");
    const shell = page.locator('[aria-busy="true"][aria-label="Loading BariHisab…"]');
    await expect(shell).toBeVisible();
    return { page, shell, close: () => noJs.close() };
  }

  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "viewports are set per test");
  });

  test("desktop: 252px sidebar and top bar, no bottom nav", async ({ browser }) => {
    const { page, shell, close } = await shellPage(browser, { width: 1280, height: 800 });
    const sidebar = shell.locator(".sidebar");
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())!.width).toBe(252);
    await expect(shell.locator(".topbar")).toBeVisible();
    await expect(shell.locator(".bottom-nav")).toBeHidden();
    await page.screenshot({ path: ".context/screens/skeleton-shell-1280.png" });
    await close();
  });

  test("mobile: no sidebar, 5-cell bottom nav fixed to the bottom", async ({ browser }) => {
    const { page, shell, close } = await shellPage(browser, { width: 375, height: 780 });
    await expect(shell.locator(".sidebar")).toBeHidden();
    const nav = shell.locator(".bottom-nav");
    await expect(nav).toBeVisible();
    await expect(nav.locator("[data-skeleton='nav-cell']")).toHaveCount(5);
    const box = (await nav.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(780);
    await page.screenshot({ path: ".context/screens/skeleton-shell-375.png" });
    await close();
  });

  test("360px: no horizontal scroll", async ({ browser }) => {
    const { page, close } = await shellPage(browser, { width: 360, height: 780 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await close();
  });

  test("design tokens: square, flat, neutral-200 blocks; no pulse under reduced motion", async ({ browser }) => {
    const { page, close } = await shellPage(browser, { width: 1280, height: 800, reducedMotion: "reduce" });
    const styles = await page.locator(".skeleton").evaluateAll((els) =>
      els.map((e) => {
        const s = getComputedStyle(e);
        return { radius: s.borderRadius, shadow: s.boxShadow, bg: s.backgroundColor, animation: s.animationName };
      }),
    );
    expect(styles.length).toBeGreaterThan(10);
    for (const s of styles) {
      expect(s.radius).toBe("0px");
      expect(s.shadow).toBe("none");
      expect(s.bg).toBe(NEUTRAL_200);
      expect(s.animation).toBe("none");
    }
    await close();
  });
});
