// Argon2id password hashing (Auth PRD §8): memory 19 MiB, 2 iterations,
// parallelism 1. Plugged into better-auth via emailAndPassword.password.
import { hash, parseOptions, verify } from "@node-rs/argon2";

const ARGON2ID = 2; // Algorithm.Argon2id (const enum; inlined for isolatedModules)

export const ARGON2_PARAMS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

/** True when the stored hash isn't Argon2id with the current parameters. */
export function needsRehash(hashed: string): boolean {
  if (!hashed.startsWith("$argon2id$")) return true;
  try {
    const p = parseOptions(hashed);
    return (
      p.memoryCost !== ARGON2_PARAMS.memoryCost ||
      p.timeCost !== ARGON2_PARAMS.timeCost ||
      p.parallelism !== ARGON2_PARAMS.parallelism
    );
  } catch {
    return true;
  }
}

// Verifying against this when the user doesn't exist keeps response time
// constant, so timing can't reveal whether an account exists (§8 Enumeration).
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword("barihisab-timing-equaliser-not-a-real-password"));
}
