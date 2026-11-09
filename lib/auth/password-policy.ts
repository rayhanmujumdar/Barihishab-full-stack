// Password rules shared by invite accept, reset and change (Auth PRD §4).
import { COMMON_PASSWORDS } from "./data/common-passwords";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export type PasswordProblem = "TOO_SHORT" | "TOO_LONG" | "MATCHES_IDENTITY" | "TOO_COMMON";
export type PasswordCheck = { ok: true } | { ok: false; reason: PasswordProblem };

let common: Set<string> | undefined;
const commonSet = () => (common ??= new Set(COMMON_PASSWORDS));

export function checkPassword(
  password: string,
  identity: { username?: string | null; email?: string | null } = {},
): PasswordCheck {
  if (password.length < PASSWORD_MIN) return { ok: false, reason: "TOO_SHORT" };
  if (password.length > PASSWORD_MAX) return { ok: false, reason: "TOO_LONG" };

  const lowered = password.toLowerCase();
  for (const value of [identity.username, identity.email]) {
    if (value && lowered === value.toLowerCase()) return { ok: false, reason: "MATCHES_IDENTITY" };
  }
  if (commonSet().has(lowered)) return { ok: false, reason: "TOO_COMMON" };
  return { ok: true };
}

export const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  TOO_SHORT: `Use at least ${PASSWORD_MIN} characters.`,
  TOO_LONG: `Use at most ${PASSWORD_MAX} characters.`,
  MATCHES_IDENTITY: "Password can't be the same as your username or email.",
  TOO_COMMON: "This password is too common. Choose another.",
};
