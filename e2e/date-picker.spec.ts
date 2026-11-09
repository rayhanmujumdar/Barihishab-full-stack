import { expect, test } from "@playwright/test";
import { ADMIN } from "./global-setup";

// Runs after auth.spec.ts (files run in order, one worker), which onboards ADMIN.
test.use({ viewport: { width: 1280, height: 380 } });

test("birthday calendar in the users drawer stays wheel-scrollable on a short screen", async ({ page, context, baseURL }) => {
  const res = await context.request.post("/api/v1/auth/login", {
    data: { identifier: ADMIN.username, password: ADMIN.password, remember: false },
    headers: { origin: new URL(baseURL!).origin },
  });
  expect(res.status()).toBe(200);

  await page.goto("/en/admin/users");
  await page.getByRole("button", { name: /Actions for bookkeeper/ }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();

  await page.locator("#u-birthday").click();
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(page.locator('[data-slot="calendar"]')).toBeVisible();
  await popover.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));

  // The short viewport forces the popover to cap its height and scroll internally.
  const { scrollHeight, clientHeight } = await popover.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(scrollHeight, "popover overflows on a short screen").toBeGreaterThan(clientHeight);

  const box = (await popover.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => popover.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: ".context/screens/desktop-en-users-drawer-birthday.png" });
});
