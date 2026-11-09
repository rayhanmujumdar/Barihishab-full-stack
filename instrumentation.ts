// Runs once when the server starts: fail fast on a broken environment instead
// of every request silently returning 401 (e.g. a missing AUTH_JWT_SECRET).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("./lib/env");
    env();
  }
}
