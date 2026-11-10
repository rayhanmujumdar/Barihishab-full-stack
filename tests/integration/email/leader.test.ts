import { afterEach, describe, expect, it } from "vitest";
import { createLeaderLock, type LeaderLock } from "@/lib/email/leader";

const open: LeaderLock[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((l) => l.release()));
});

function lock() {
  const l = createLeaderLock(process.env.DATABASE_URL!, "test-email-leader");
  open.push(l);
  return l;
}

describe("dev email worker leader lock", () => {
  it("lets exactly one process per database hold the lock", async () => {
    const a = lock();
    const b = lock();
    expect(await a.tryAcquire()).toBe(true);
    expect(await a.tryAcquire()).toBe(true); // re-check while held is cheap and stable
    expect(await b.tryAcquire()).toBe(false);
  });

  it("hands over when the holder releases (e.g. that dev server stopped)", async () => {
    const a = lock();
    const b = lock();
    expect(await a.tryAcquire()).toBe(true);
    await a.release();
    expect(await b.tryAcquire()).toBe(true);
  });
});
