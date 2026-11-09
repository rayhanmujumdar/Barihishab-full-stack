import { describe, expect, it } from "vitest";
import { withIdempotency } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { createProperty } from "../../helpers/factory";
import { json } from "../../helpers/http";

const USER = "00000000-0000-4000-8000-00000000a001";
const OTHER_USER = "00000000-0000-4000-8000-00000000a002";

const req = (key?: string) =>
  new Request("http://localhost:3000/api/v1/transactions", { method: "POST", headers: key ? { "idempotency-key": key } : {} });

/** A stand-in write: one category row per run, saved with the key in one transaction. */
function makeRun(propertyId: string, delayMs = 0) {
  let runs = 0;
  const run = (save: Parameters<Parameters<typeof withIdempotency>[4]>[0]) =>
    prisma.$transaction(async (tx) => {
      runs += 1;
      const row = await tx.category.create({ data: { propertyId, kind: "EXPENSE", code: `X${runs}_${Math.random()}`, nameEn: "x", nameBn: "x" } });
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      const data = { id: row.id };
      await save(tx, data);
      return ok(data, { status: 201 });
    });
  return { run, runs: () => runs };
}

describe("Idempotency-Key (DUP-01)", () => {
  it("requires the header", async () => {
    const p = await createProperty();
    const res = await withIdempotency(req(), p.id, USER, { a: 1 }, makeRun(p.id).run);
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fields["Idempotency-Key"]).toBeTruthy();
  });

  it("replays the first response for the same key and body (IE-14)", async () => {
    const p = await createProperty();
    const w = makeRun(p.id);
    const first = await json(await withIdempotency(req("key-0001"), p.id, USER, { amount: 1 }, w.run));
    const second = await withIdempotency(req("key-0001"), p.id, USER, { amount: 1 }, w.run);
    expect(second.status).toBe(201);
    expect(await json(second)).toEqual(first);
    expect(w.runs()).toBe(1);
    expect(await prisma.category.count()).toBe(1);
  });

  it("rejects the same key with a different body", async () => {
    const p = await createProperty();
    const w = makeRun(p.id);
    await withIdempotency(req("key-0002"), p.id, USER, { amount: 1 }, w.run);
    const res = await withIdempotency(req("key-0002"), p.id, USER, { amount: 2 }, w.run);
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("writes once when two requests race with one key", async () => {
    const p = await createProperty();
    const w = makeRun(p.id, 150);
    const [a, b] = await Promise.all([
      withIdempotency(req("key-0003"), p.id, USER, { amount: 1 }, w.run),
      withIdempotency(req("key-0003"), p.id, USER, { amount: 1 }, w.run),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await json(a)).toEqual(await json(b));
    expect(await prisma.category.count()).toBe(1);
  });

  it("does not replay another user's response for the same key and body", async () => {
    const p = await createProperty();
    const w = makeRun(p.id);
    await withIdempotency(req("key-0005"), p.id, USER, { amount: 1 }, w.run);
    const res = await withIdempotency(req("key-0005"), p.id, OTHER_USER, { amount: 1 }, w.run);
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(w.runs()).toBe(1);
  });

  it("treats a key older than 24 hours as new", async () => {
    const p = await createProperty();
    const w = makeRun(p.id);
    await withIdempotency(req("key-0004"), p.id, USER, { amount: 1 }, w.run);
    await prisma.idempotencyKey.updateMany({ data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    const res = await withIdempotency(req("key-0004"), p.id, USER, { amount: 2 }, w.run);
    expect(res.status).toBe(201);
    expect(w.runs()).toBe(2);
  });
});
