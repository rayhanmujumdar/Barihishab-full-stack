// Shared by the invite page (server, computes it) and the invite form (client
// fallback). Not in a "use client" module so server code can call it.
export function hoursLeft(expiresAt: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 3600_000));
}
