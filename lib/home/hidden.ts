// "Hide today" for Home reminder strips (Home PRD F6, Rule 9; design D8): a
// per-device cookie of `KEY@YYYY-MM-DD` pairs, read on the server so a hidden
// strip never flashes on reload. Pure and client-safe.

export const HIDDEN_COOKIE = "bh_home_hidden";

const pairs = (value: string | null | undefined) =>
  (value ?? "")
    .split("|")
    .map((p) => {
      const at = p.lastIndexOf("@");
      return at > 0 ? { key: p.slice(0, at), day: p.slice(at + 1) } : null;
    })
    .filter((p): p is { key: string; day: string } => p !== null && /^\d{4}-\d{2}-\d{2}$/.test(p.day));

/** Keys hidden on `today` (Asia/Dhaka "YYYY-MM-DD"). */
export function hiddenToday(value: string | null | undefined, today: string): string[] {
  return pairs(value)
    .filter((p) => p.day === today)
    .map((p) => p.key);
}

/** The cookie value after hiding `key` today; older days are dropped. */
export function hideToday(value: string | null | undefined, key: string, today: string): string {
  const keys = new Set([...hiddenToday(value, today), key]);
  return [...keys].map((k) => `${k}@${today}`).join("|");
}

/** This cookie's decoded value from a `Cookie` header. */
export function readCookie(header: string | null | undefined): string | null {
  for (const part of (header ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== HIDDEN_COOKIE) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return null; // hand-edited or truncated: nothing hidden
    }
  }
  return null;
}
