// Email delivery behind one interface so the worker is provider-agnostic.
import { Resend } from "resend";
import { logInfo } from "@/lib/log";
import { classifyResendError, EmailSendError } from "./errors";

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };
export interface Transport {
  /** Throws EmailSendError; `permanent` errors must not be retried. */
  send(message: OutgoingEmail): Promise<{ id: string }>;
}

type ProviderError = { name?: string | null; message?: string | null; statusCode?: number | null };
/** The slice of the Resend client the transport uses (injectable for tests). */
export type ResendLike = {
  emails: {
    send(p: { from: string; to: string; subject: string; html: string; text: string }): Promise<{ data: { id: string } | null; error: ProviderError | null }>;
  };
};

export class ResendTransport implements Transport {
  private client: ResendLike;
  constructor(apiKey: string, private from: string, client?: ResendLike) {
    this.client = client ?? (new Resend(apiKey) as unknown as ResendLike);
  }
  async send(m: OutgoingEmail) {
    let res: Awaited<ReturnType<ResendLike["emails"]["send"]>>;
    try {
      res = await this.client.emails.send({ from: this.from, to: m.to, subject: m.subject, html: m.html, text: m.text });
    } catch (err) {
      // Network failure / timeout: nothing reached the provider.
      throw new EmailSendError("TRANSIENT", err instanceof Error ? err.message : String(err));
    }
    if (res.error || !res.data) throw classifyResendError(res.error);
    return { id: res.data.id };
  }
}

/**
 * Development only: prints the email (including its link) to the console so
 * invites and resets work without a provider. Refuses to run in production.
 */
export class ConsoleTransport implements Transport {
  async send(m: OutgoingEmail) {
    if (process.env.NODE_ENV === "production") throw new Error("ConsoleTransport is disabled in production");
    const id = `console_${Date.now()}`;
    // Deliberately unmasked: this is the dev "mailbox".
    console.log(`\n✉  ${m.subject}\n   to: ${m.to}\n${m.text.replace(/^/gm, "   ")}\n`);
    logInfo("email", `console transport delivered ${id}`);
    return { id };
  }
}

export function transportFromEnv(): Transport {
  const key = process.env.RESEND_API_KEY;
  if (key) return new ResendTransport(key, process.env.EMAIL_FROM ?? "BariHisab <no-reply@barihisab.local>");
  if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is required in production");
  return new ConsoleTransport();
}
