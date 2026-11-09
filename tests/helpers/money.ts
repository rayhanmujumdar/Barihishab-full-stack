// Shared helpers for the Income & Expenses API tests.
import { randomUUID } from "node:crypto";
import { apiRequest, type Login } from "./http";

/** A POST that money-creating endpoints accept (with a fresh Idempotency-Key unless given). */
export function moneyPost(path: string, login: Login, body: unknown, key: string = randomUUID()) {
  return apiRequest(path, { login, body, headers: { "idempotency-key": key } });
}

export const freezeDhaka = async (vi: typeof import("vitest").vi, iso = "2026-10-20T06:00:00Z") =>
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(iso) });
