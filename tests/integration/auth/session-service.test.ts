import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  findActiveSession,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  touchSession,
} from "@/lib/auth/session-service";
import { hashToken } from "@/lib/auth/tokens";
import { createUser } from "../../helpers/factory";

const T0 = new Date("2026-11-09T00:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function freeze(date: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(date);
}

afterEach(() => vi.useRealTimers());

describe("session service", () => {
  it("creates a 30-day session with remember me and stores only the hash", async () => {
    freeze(T0);
    const user = await createUser();
    const { session, refreshToken } = await createSession({ userId: user.id, remember: true, ip: "1.2.3.4", userAgent: "UA" });
    expect(session.tokenHash).toBe(hashToken(refreshToken));
    expect(session.expiresAt).toEqual(at(30 * DAY));
    expect(session.idleExpiresAt).toBeNull();
    const rows = await prisma.authSession.findMany();
    expect(JSON.stringify(rows)).not.toContain(refreshToken);
  });

  it("creates a 12 h idle / 7 day absolute session without remember me", async () => {
    freeze(T0);
    const user = await createUser();
    const { session } = await createSession({ userId: user.id, remember: false });
    expect(session.idleExpiresAt).toEqual(at(12 * HOUR));
    expect(session.expiresAt).toEqual(at(7 * DAY));
  });

  it("rotates: old token dies, new token works, family and absolute expiry are kept", async () => {
    freeze(T0);
    const user = await createUser();
    const first = await createSession({ userId: user.id, remember: false });
    freeze(at(10 * MIN));
    const r1 = await rotateSession({ refreshToken: first.refreshToken });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.refreshToken).not.toBe(first.refreshToken);
    expect(r1.session.familyId).toBe(first.session.familyId);
    expect(r1.session.expiresAt).toEqual(first.session.expiresAt);
    expect(r1.session.idleExpiresAt).toEqual(at(10 * MIN + 12 * HOUR)); // idle window slides
    const old = await prisma.authSession.findUniqueOrThrow({ where: { id: first.session.id } });
    expect(old.revokedReason).toBe("rotated");
    expect(old.replacedById).toBe(r1.session.id);
  });

  it("detects reuse of a rotated token after the grace window and revokes the family", async () => {
    freeze(T0);
    const user = await createUser();
    const first = await createSession({ userId: user.id, remember: true });
    const r1 = await rotateSession({ refreshToken: first.refreshToken });
    expect(r1.ok).toBe(true);
    freeze(at(31_000));
    const reuse = await rotateSession({ refreshToken: first.refreshToken });
    expect(reuse).toMatchObject({ ok: false, reason: "REUSED", userId: user.id });
    const live = await prisma.authSession.count({ where: { familyId: first.session.familyId, revokedAt: null } });
    expect(live).toBe(0);
  });

  it("tolerates a parallel refresh inside the 30 s grace window", async () => {
    freeze(T0);
    const user = await createUser();
    const first = await createSession({ userId: user.id, remember: true });
    const r1 = await rotateSession({ refreshToken: first.refreshToken });
    freeze(at(5_000));
    const r2 = await rotateSession({ refreshToken: first.refreshToken });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok) return;
    expect(await findActiveSession(r1.session.id)).not.toBeNull();
  });

  it("rejects unknown, expired, idle-expired and revoked tokens", async () => {
    freeze(T0);
    const user = await createUser();
    expect(await rotateSession({ refreshToken: "nope" })).toMatchObject({ ok: false, reason: "INVALID" });

    const idle = await createSession({ userId: user.id, remember: false });
    freeze(at(12 * HOUR + 1));
    expect(await rotateSession({ refreshToken: idle.refreshToken })).toMatchObject({ ok: false, reason: "EXPIRED" });

    freeze(T0);
    const remembered = await createSession({ userId: user.id, remember: true });
    freeze(at(30 * DAY + 1));
    expect(await rotateSession({ refreshToken: remembered.refreshToken })).toMatchObject({ ok: false, reason: "EXPIRED" });

    freeze(T0);
    const revoked = await createSession({ userId: user.id, remember: true });
    await revokeSession(revoked.session.id, "logout");
    expect(await rotateSession({ refreshToken: revoked.refreshToken })).toMatchObject({ ok: false, reason: "REVOKED" });
  });

  it("refuses to refresh for a user who is no longer ACTIVE", async () => {
    const user = await createUser();
    const s = await createSession({ userId: user.id, remember: true });
    await prisma.user.update({ where: { id: user.id }, data: { status: "INACTIVE" } });
    expect(await rotateSession({ refreshToken: s.refreshToken })).toMatchObject({ ok: false, reason: "INACTIVE" });
  });

  it("revokes one or all sessions, optionally keeping the current one", async () => {
    const user = await createUser();
    const a = await createSession({ userId: user.id, remember: true });
    const b = await createSession({ userId: user.id, remember: true });
    const c = await createSession({ userId: user.id, remember: true });
    await revokeSession(a.session.id, "logout");
    expect(await findActiveSession(a.session.id)).toBeNull();
    const n = await revokeAllSessions(prisma, user.id, "password_changed", { exceptSessionId: c.session.id });
    expect(n).toBe(1);
    expect(await findActiveSession(b.session.id)).toBeNull();
    expect(await findActiveSession(c.session.id)).not.toBeNull();
  });

  it("writes last_seen_at at most once per 5 minutes", async () => {
    freeze(T0);
    const user = await createUser();
    const s = await createSession({ userId: user.id, remember: true });
    freeze(at(4 * MIN));
    await touchSession(s.session);
    expect((await prisma.authSession.findUniqueOrThrow({ where: { id: s.session.id } })).lastSeenAt).toEqual(T0);
    freeze(at(6 * MIN));
    await touchSession(s.session);
    expect((await prisma.authSession.findUniqueOrThrow({ where: { id: s.session.id } })).lastSeenAt).toEqual(at(6 * MIN));
  });
});
