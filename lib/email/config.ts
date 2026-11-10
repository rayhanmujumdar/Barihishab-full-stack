// Email settings on their own, so the standalone worker validates only what it
// uses (no auth secrets needed in a worker container). lib/env.ts reuses the
// same fields and the same sender rule for the app.
import { z } from "zod";
import { senderProblem } from "./sender";

export const EmailEnvFields = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("BariHisab <no-reply@barihisab.local>"),
  // Development only. auto: run the outbox worker inside `next dev` when a
  // provider key is set; on: always (console transport too); off: never.
  EMAIL_WORKER: z.enum(["auto", "on", "off"]).default("auto"),
};

const EmailEnvSchema = z.object(EmailEnvFields);
export type EmailEnv = z.infer<typeof EmailEnvSchema>;

/** Production refuses an unsendable EMAIL_FROM; development only warns at boot. */
export function assertSendableSender(e: Pick<EmailEnv, "NODE_ENV" | "EMAIL_FROM" | "RESEND_API_KEY">): void {
  const problem = senderProblem(e.EMAIL_FROM, Boolean(e.RESEND_API_KEY));
  if (problem && e.NODE_ENV === "production") throw new Error(`Invalid server environment — ${problem}`);
}

export function emailEnv(source: Record<string, string | undefined>): EmailEnv {
  const parsed = EmailEnvSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid email environment — ${fields}`);
  }
  assertSendableSender(parsed.data);
  return parsed.data;
}
