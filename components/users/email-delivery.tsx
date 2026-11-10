"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { FailureCode } from "@/lib/email/errors";
import type { InviteEmailState } from "@/lib/email/status";
import type { OutboxStatusDto } from "@/app/api/v1/email/outbox/status/schema";
import { formatDateTime, type Locale, type MessageKey } from "@/lib/i18n";

type Tr = (key: MessageKey, vars?: Record<string, string | number>) => string;

function reason(tr: Tr, code: FailureCode | null) {
  return tr(`email.reason.${code ?? "UNKNOWN"}` as MessageKey);
}

/** One line under an INVITED user's status: where their latest invite email is. */
export function InviteEmailLine({ state, locale, tr }: { state: InviteEmailState | null | undefined; locale: Locale; tr: Tr }) {
  if (!state) return null;
  if (state.status === "FAILED") {
    // Text carries the meaning; the negative tone only reinforces it.
    return <p className="mt-1 text-xs font-semibold text-destructive">{tr("users.invite.failed", { reason: reason(tr, state.failureCode) })}</p>;
  }
  if (state.status === "SENT") {
    return <p className="muted mt-1 text-xs">{tr("users.invite.sent", { time: formatDateTime(locale, state.sentAt) ?? "" })}</p>;
  }
  return <p className="muted mt-1 text-xs">{tr("users.invite.queued")}</p>;
}

/** Super Admin warning when the outbox is stalled or emails failed recently (PRD §11). */
export function EmailDeliveryBanner({ status, tr }: { status: OutboxStatusDto | null | undefined; tr: Tr }) {
  if (!status) return null;
  let message: string | null = null;
  if (status.stalled) message = tr("email.banner.stalled");
  else if (status.failedLast7Days > 0) {
    message = tr("email.banner.failed", { count: status.failedLast7Days, reason: reason(tr, status.lastFailure?.failureCode ?? null) });
  }
  if (!message) return null;
  return (
    <Alert variant="destructive" role="status" aria-label={tr("email.banner.label")}>
      <ExclamationTriangleIcon className="size-4" aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
