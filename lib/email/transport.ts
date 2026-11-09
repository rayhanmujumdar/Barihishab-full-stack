// Email delivery behind one interface so the worker is provider-agnostic.
import { Resend } from "resend";
import { logInfo } from "@/lib/log";

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };
export interface Transport {
  send(message: OutgoingEmail): Promise<{ id: string }>;
}

export class ResendTransport implements Transport {
  private client: Resend;
  constructor(apiKey: string, private from: string) {
    this.client = new Resend(apiKey);
  }
  async send(m: OutgoingEmail) {
    const { data, error } = await this.client.emails.send({ from: this.from, to: m.to, subject: m.subject, html: m.html, text: m.text });
    if (error || !data) throw new Error(`Resend: ${error?.name ?? "unknown"} ${error?.message ?? ""}`.trim());
    return { id: data.id };
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
