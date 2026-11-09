// One DB transaction that ends in a service Result: throw `Abort` anywhere
// inside to roll back and return its failure instead of a 500.
import type { Prisma } from "@/lib/generated/prisma/client";
import { isPeriodClosedError } from "@/lib/periods/period-service";
import { prisma } from "@/lib/prisma";
import { failWith, type Fail, type Result } from "./result";

/** Thrown inside a DB transaction to roll it back and return a failure. */
export class Abort {
  constructor(readonly fail: Fail) {}
}

export async function inTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, opts: { timeout?: number } = {}): Promise<Result<T>> {
  try {
    return { ok: true, ...(await prisma.$transaction(fn, opts)) } as Result<T>;
  } catch (err) {
    if (err instanceof Abort) return err.fail;
    if (isPeriodClosedError(err)) return failWith("PERIOD_CLOSED");
    throw err;
  }
}
