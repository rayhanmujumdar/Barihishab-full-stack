// Idempotency-Key for money-creating POSTs (Income & Expenses PRD DUP-01).
// The key row is written in the SAME transaction as the data, so a racing
// duplicate blocks on the primary key and then replays the stored response.
import { createHash } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { addMs, HOUR, now } from "@/lib/clock";
import { prisma } from "@/lib/prisma";
import { apiError, fieldError } from "./errors";
import { ok } from "./response";

type Tx = Prisma.TransactionClient;
/** Stores the 201 response data with the key, inside the caller's transaction. */
export type SaveIdempotent = (tx: Tx, data: unknown) => Promise<void>;

const TTL_MS = 24 * HOUR;
const KEY = /^[\w.:-]{8,100}$/;

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "P2002";

async function replay(propertyId: string, key: string, hash: string): Promise<Response | null> {
  const row = await prisma.idempotencyKey.findUnique({ where: { propertyId_key: { propertyId, key } } });
  if (!row) return null;
  if (row.createdAt < addMs(now(), -TTL_MS)) {
    await prisma.idempotencyKey.delete({ where: { propertyId_key: { propertyId, key } } });
    return null;
  }
  if (row.requestHash !== hash) return apiError("IDEMPOTENCY_CONFLICT");
  return ok(row.body, { status: row.status });
}

/**
 * Keys are stored per property, but the request hash includes the actor, so a
 * key reused by another user conflicts instead of replaying someone else's response.
 */
export async function withIdempotency(
  req: Request,
  propertyId: string,
  actorId: string,
  payload: unknown,
  run: (save: SaveIdempotent) => Promise<Response>,
): Promise<Response> {
  const key = req.headers.get("idempotency-key")?.trim();
  if (!key || !KEY.test(key)) return fieldError("Idempotency-Key", "Send an Idempotency-Key header (8–100 characters).");
  const hash = createHash("sha256")
    .update(`${actorId} ${req.method} ${new URL(req.url).pathname} ${JSON.stringify(payload)}`)
    .digest("hex");

  const stored = await replay(propertyId, key, hash);
  if (stored) return stored;

  const save: SaveIdempotent = async (tx, data) => {
    await tx.idempotencyKey.create({ data: { propertyId, key, requestHash: hash, status: 201, body: data as Prisma.InputJsonValue } });
  };
  try {
    return await run(save);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Lost the race: the winner committed — replay its response.
    const winner = await replay(propertyId, key, hash);
    if (winner) return winner;
    throw err; // some other unique constraint
  }
}
