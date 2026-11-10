// Sends one test email through the configured provider, bypassing the outbox:
//   pnpm email:test you@example.com
//   pnpm email:test you@example.com --from "BariHisab <onboarding@resend.dev>"
// Prints the provider message id, or the provider's exact error and a fix hint.
import "dotenv/config";
import { runEmailTest } from "../lib/email/test-send";
import { ConsoleTransport, ResendTransport } from "../lib/email/transport";

void runEmailTest(process.argv.slice(2), {
  apiKey: process.env.RESEND_API_KEY || undefined,
  defaultFrom: process.env.EMAIL_FROM ?? "BariHisab <no-reply@barihisab.local>",
  makeTransport: (apiKey, from) => (apiKey ? new ResendTransport(apiKey, from) : new ConsoleTransport()),
  out: (line) => console.log(line),
}).then((code) => process.exit(code));
