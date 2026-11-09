import type { EmailTemplate } from "@/lib/generated/prisma/client";
import type { OutboxPayload } from "./outbox";
import { inviteEmail } from "./templates/invite";
import type { RenderedEmail } from "./templates/layout";
import { passwordChangedEmail } from "./templates/password-changed";
import { resetEmail } from "./templates/reset";

export function renderEmail<T extends EmailTemplate>(
  template: T,
  locale: "bn" | "en",
  payload: OutboxPayload[T],
  appUrl: string,
): RenderedEmail {
  const base = appUrl.replace(/\/$/, "");
  switch (template) {
    case "INVITE":
      return inviteEmail(locale, payload as OutboxPayload["INVITE"], base);
    case "RESET":
      return resetEmail(locale, payload as OutboxPayload["RESET"], base);
    case "PASSWORD_CHANGED":
      return passwordChangedEmail(locale, payload as OutboxPayload["PASSWORD_CHANGED"], base);
    default:
      throw new Error(`Unknown email template: ${template satisfies never}`);
  }
}
