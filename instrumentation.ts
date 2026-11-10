// Runs once when the server starts: fail fast on a broken environment instead
// of every request silently returning 401 (e.g. a missing AUTH_JWT_SECRET).
// In development it also starts the email outbox worker in-process, so
// `pnpm dev` alone delivers invites (EMAIL_WORKER=auto|on|off, see .env.example).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("./lib/env");
    const e = env();
    // Production never loads the worker modules: it runs `pnpm email:worker`.
    if (process.env.NODE_ENV === "development") {
      const { bootEmail } = await import("./lib/email/boot");
      bootEmail(e);
    }
  }
}
