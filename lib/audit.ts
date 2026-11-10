// Append-only audit trail (Auth PRD AUD-01/02). Always called with the same
// transaction client as the change it describes.
import type { Prisma } from "@/lib/generated/prisma/client";

export const AUDIT_ACTIONS = [
  "auth.login.success",
  "auth.login.failed",
  "auth.locked",
  "auth.logout",
  "auth.logout_all",
  "auth.password.changed",
  "auth.password.reset",
  "auth.invite.sent",
  "auth.invite.accepted",
  "auth.invite.revoked",
  "user.created",
  "user.updated",
  "user.role.changed",
  "user.deactivated",
  "user.reactivated",
  "user.sessions.revoked",
  "user.avatar.updated",
  "user.avatar.removed",
  // Income & Expenses PRD §12.1 (all financial: owners may see them)
  "transaction.created",
  "transaction.updated",
  "transaction.voided",
  "transaction.rent_generated",
  "transaction.adjustment_created",
  "attachment.added",
  "attachment.removed",
  "unit.created",
  "unit.updated",
  "fund_account.created",
  "fund_account.updated",
  "category.created",
  "category.updated",
  // Owners PRD §11 (financial)
  "owner.created",
  "owner.updated",
  "share_set.saved",
  "ledger.opening_set",
  "ledger.payout_created",
  "ledger.advance_created",
  "ledger.voided",
  "ledger.adjustment_created",
  "loan.created",
  // Distribution PRD §6 (financial)
  "loan.updated",
  "period.closed",
  "period.reopened",
  "period.reserve_overridden",
  "period.reserve_reset",
  "settings.reserve_updated",
  // Advances & Loans PRD §12 (financial)
  "loan.repaid_cash",
  "loan.repaid_deduction",
  "loan.repayment_voided",
  "loan.cancelled",
  "loan.written_off",
  "settings.advance_limit_updated",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntry = {
  actorId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

const SECRET_KEY = /password|token|hash|secret|cookie|csrf/i;

/** Recursively drops secret-looking keys so they can never reach the log. */
export function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k)) continue;
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}

type Db = Pick<Prisma.TransactionClient, "auditLog">;

export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: e.actorId ?? null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      before: e.before === undefined ? undefined : (scrub(e.before) as Prisma.InputJsonValue),
      after: e.after === undefined ? undefined : (scrub(e.after) as Prisma.InputJsonValue),
      reason: e.reason ?? null,
      ip: e.ip ?? null,
      userAgent: e.userAgent ?? null,
    },
  });
}
