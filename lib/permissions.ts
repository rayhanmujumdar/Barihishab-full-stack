// Role → permission map (Auth PRD §2, RBAC-02). Code checks permissions by
// name — `can(user, 'user.create')` — never role names, so adding Accountant
// or Viewer later is a change to this file only.

export const ROLES = ["SUPER_ADMIN", "OWNER", "ACCOUNTANT", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

/** Roles that can be granted in v1. P3 roles exist but are not assignable. */
export const ENABLED_ROLES = ["SUPER_ADMIN", "OWNER"] as const satisfies readonly Role[];
export type EnabledRole = (typeof ENABLED_ROLES)[number];

export const ALL_PERMISSIONS = [
  "user.create",
  "user.update",
  "user.deactivate",
  "user.invite.resend",
  "user.list",
  "user.session.revoke",
  "profile.update.self",
  "profile.password.self",
  "profile.identity.self",
  "session.manage.self",
  "audit.view.all",
  "audit.view.financial",
  "dashboard.admin",
  "settings.manage",
  // Income & Expenses PRD §4 (P1)
  "transaction.view",
  "transaction.create",
  "transaction.update",
  "transaction.void",
  "transaction.adjust",
  "attachment.view",
  "category.manage",
  "unit.manage",
  "fund.manage",
  // Owners PRD §4 (P1)
  "owner.view",
  "owner.manage",
  "share.manage",
  "payout.create",
  "advance.create",
  "ledger.void",
  "ledger.adjust",
  // Distribution PRD §4 (P1)
  "distribution.view",
  "period.close",
  "period.reopen",
  "reserve.override",
  "loan.manage",
  // Advances & Loans PRD §4 (P1)
  "loan.view",
  "loan.create",
  "loan.repay",
  // Requests PRD §5
  "request.create",
  "request.view",
  "request.view.all",
  "request.decide",
  "request.disburse",
  "request.record",
] as const;
export type Permission = (typeof ALL_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  OWNER: [
    "profile.update.self",
    "profile.password.self",
    "session.manage.self",
    "audit.view.financial",
    "transaction.view",
    "attachment.view",
    "owner.view",
    "distribution.view",
    "loan.view",
    "request.create",
    "request.view",
  ],
  ACCOUNTANT: [],
  VIEWER: [],
};

/** Effective permissions = union over every role the user holds. */
export function permissionsFor(roles: readonly Role[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) set.add(permission);
  }
  return [...set];
}

type Subject = { roles?: readonly Role[]; permissions?: readonly string[] } | null | undefined;

/**
 * RBAC-01. `resource` is reserved for property/ownership scoping (RBAC-06);
 * v1 has a single property, so grants are global.
 */
export function can(user: Subject, permission: Permission, _resource?: { propertyId?: string }): boolean {
  if (!user) return false;
  if (user.permissions) return user.permissions.includes(permission);
  return (user.roles ?? []).some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}
