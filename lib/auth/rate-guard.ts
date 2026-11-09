// Applies the /api/v1/auth/* limits (AUTH-04) and builds the 429 response.
import { apiError } from "@/lib/api/errors";
import { hit, LIMITS, type Limit } from "./rate-limit";
import { clientIp } from "./request-meta";

function tooMany(retryAfterSeconds: number) {
  return apiError("RATE_LIMITED", {
    headers: { "Retry-After": String(retryAfterSeconds) },
    details: { retryAfter: retryAfterSeconds },
  });
}

/** Per-IP limit for every public auth endpoint. Skipped when the IP is unknown (no trusted proxy). */
export async function limitByIp(req: Request): Promise<Response | null> {
  const ip = clientIp(req);
  if (ip === "unknown") return null;
  const r = await hit(LIMITS.authPerIp, ip);
  return r.allowed ? null : tooMany(r.retryAfterSeconds);
}

export async function limitBy(limit: Limit, subject: string): Promise<Response | null> {
  const r = await hit(limit, subject);
  return r.allowed ? null : tooMany(r.retryAfterSeconds);
}
