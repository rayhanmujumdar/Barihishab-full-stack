// `pnpm email:test <to> [--from <sender>]`: one test message straight through
// the configured transport — no outbox row, no DB. An operator check that a
// key and sender actually deliver (fix-email-delivery D7). EML-01 still holds:
// this is a CLI, never an API path.
import { z } from "zod";
import { mask } from "@/lib/log";
import { EmailSendError } from "./errors";
import { SANDBOX_SENDER } from "./sender";
import type { Transport } from "./transport";

export type EmailTestDeps = {
  apiKey: string | undefined;
  defaultFrom: string;
  makeTransport: (apiKey: string | undefined, from: string) => Transport;
  out: (line: string) => void;
};

const USAGE = 'Usage: pnpm email:test <to> [--from "Name <sender@verified-domain>"]';

/** Returns the process exit code: 0 sent, 1 send failed, 2 usage error. */
export async function runEmailTest(argv: string[], deps: EmailTestDeps): Promise<number> {
  const fromIdx = argv.indexOf("--from");
  const from = fromIdx >= 0 ? argv[fromIdx + 1] : deps.defaultFrom;
  const positional = argv.filter((a, i) => !a.startsWith("--") && !(fromIdx >= 0 && i === fromIdx + 1));
  const to = positional[0];
  if (!to || !z.email().safeParse(to).success || !from) {
    deps.out(USAGE);
    return 2;
  }

  const hide = (s: string) => (deps.apiKey ? s.split(deps.apiKey).join("re_***") : s);
  const at = new Date().toISOString();
  const text = `BariHisab email service test.\nSent ${at} from ${from}.\nIf you can read this, email delivery works.`;
  deps.out(`Sending a test email to ${to} from ${from}…`);
  try {
    const { id } = await deps.makeTransport(deps.apiKey, from).send({
      to,
      subject: "BariHisab email service test",
      text,
      html: `<p>BariHisab email service test.</p><p>Sent ${at} from ${from.replace(/</g, "&lt;")}.</p><p>If you can read this, email delivery works.</p>`,
    });
    if (!deps.apiKey) {
      deps.out(`Printed to the console (id ${id}) — RESEND_API_KEY is empty, so no real email was sent.`);
    } else {
      deps.out(`Sent. Provider message id: ${id}`);
    }
    return 0;
  } catch (err) {
    if (err instanceof EmailSendError) {
      deps.out(`Failed: ${err.code}${err.providerName ? ` (${err.providerName}${err.statusCode ? ` ${err.statusCode}` : ""})` : ""}`);
      deps.out(`  ${hide(err.message)}`);
      if (err.code === "SENDER_NOT_VERIFIED") {
        deps.out(`  Fix: send from a domain verified in Resend, or use --from "${SANDBOX_SENDER}" (sandbox: delivers only to the Resend account's own address).`);
      }
    } else {
      deps.out(`Failed: ${hide(mask(err instanceof Error ? err.message : String(err)))}`);
    }
    return 1;
  }
}
