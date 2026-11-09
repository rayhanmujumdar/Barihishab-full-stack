// Request metadata for rate limiting and audit rows.
export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY === "true") {
    // Rightmost hop = the address our trusted proxy saw; the left part is client-controlled.
    const hops = req.headers.get("x-forwarded-for")?.split(",").map((h) => h.trim()).filter(Boolean);
    const forwarded = hops?.[hops.length - 1];
    if (forwarded) return forwarded.slice(0, 64);
    const real = req.headers.get("x-real-ip")?.trim();
    if (real) return real.slice(0, 64);
  }
  // Without a trusted proxy the socket address isn't exposed to route
  // handlers; Next dev/standalone sets x-forwarded-for itself, so in that
  // setup TRUST_PROXY=true is safe. Otherwise rate limits fall back to the
  // per-identifier key.
  return "unknown";
}

export function userAgent(req: Request): string | null {
  return req.headers.get("user-agent")?.slice(0, 512) ?? null;
}

export function requestMeta(req: Request) {
  return { ip: clientIp(req), userAgent: userAgent(req) };
}
