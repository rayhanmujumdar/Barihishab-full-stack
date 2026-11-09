// Server logging that never leaks secrets (Auth PRD §8 Logging): masks emails,
// long opaque tokens/JWTs and password-ish key=value pairs.
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const OPAQUE = /\b[A-Za-z0-9_-]{32,}\b/g;
const SECRET_KV = /\b(password|passwd|pwd|token|secret|cookie|authorization)(["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}]+)/gi;

export function mask(input: string): string {
  return input
    .replace(SECRET_KV, (_m, k: string, sep: string) => `${k}${sep}[redacted]`)
    .replace(JWT, "[jwt]")
    .replace(OPAQUE, "[token]")
    .replace(EMAIL, "$1***@$2");
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function logError(scope: string, err: unknown): void {
  console.error(`[${scope}] ${mask(describe(err))}`);
}

export function logInfo(scope: string, message: string): void {
  console.info(`[${scope}] ${mask(message)}`);
}
