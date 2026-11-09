// CSRF defence (Auth PRD §7–8, design D7): every state-changing request must
// come from our own origin, and cookie-authenticated ones must also echo the
// session-bound token in X-CSRF-Token (double submit).
import { verifyCsrfToken } from "./tokens";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function allowedOrigins(req: Request): Set<string> {
  const allowed = new Set<string>([new URL(process.env.APP_URL ?? "http://localhost:3000").origin]);
  // The request's own origin (from the Host header). Browsers can't forge
  // Host on a cross-site request, so same-origin still holds; this keeps
  // dev servers on other ports (and preview URLs) working.
  allowed.add(new URL(req.url).origin);
  return allowed;
}

export function checkOrigin(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return true;
  const origin = req.headers.get("origin");
  return origin !== null && allowedOrigins(req).has(origin);
}

export function checkCsrf(req: Request, sessionId: string): boolean {
  if (SAFE_METHODS.has(req.method)) return true;
  return checkOrigin(req) && verifyCsrfToken(sessionId, req.headers.get("x-csrf-token"));
}
