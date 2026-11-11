// The app's navigation items and how they split between the mobile bottom
// bar and the More sheet (Home PRD §4; main PRD §8.1). Pure and client-safe.
import { BanknotesIcon, CreditCardIcon, Cog6ToothIcon, DocumentChartBarIcon, HomeIcon, InboxArrowDownIcon, ScaleIcon, UserGroupIcon, UserIcon, UsersIcon } from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";
import type { MessageKey } from "@/lib/i18n";
import { can, type Permission } from "@/lib/permissions";

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type BadgeKey = "requests" | "invites";

export type NavItem = { href: string; label: MessageKey; short?: MessageKey; icon: HeroIcon; permission?: Permission; anyOf?: Permission[]; badge?: BadgeKey };

/** Sidebar order (RBAC-05: the same permission keys the server checks). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "nav.home", icon: HomeIcon },
  { href: "/entries", label: "nav.entries", short: "nav.entriesShort", icon: BanknotesIcon, permission: "transaction.view" },
  { href: "/distribution", label: "nav.distribution", icon: ScaleIcon, permission: "distribution.view" },
  { href: "/owners", label: "nav.owners", icon: UserGroupIcon, permission: "owner.view" },
  { href: "/advances", label: "nav.advances", short: "nav.advancesShort", icon: CreditCardIcon, permission: "loan.view" },
  { href: "/reports", label: "nav.reports", icon: DocumentChartBarIcon, permission: "report.view" },
  { href: "/requests", label: "nav.requests", icon: InboxArrowDownIcon, permission: "request.view", badge: "requests" },
  { href: "/admin/users", label: "nav.users", icon: UsersIcon, permission: "user.list", badge: "invites" },
  { href: "/settings", label: "nav.settings", icon: Cog6ToothIcon, anyOf: ["unit.manage", "fund.manage", "category.manage", "settings.manage"] },
  { href: "/me", label: "nav.profile", icon: UserIcon },
];

type Viewer = { permissions: readonly Permission[] };

export const visibleItems = (viewer: Viewer) =>
  NAV_ITEMS.filter((i) => (!i.permission || can(viewer, i.permission)) && (!i.anyOf || i.anyOf.some((p) => can(viewer, p))));

/** The yellow [+] cell: a new expense (Super Admin bottom bar). */
export const PLUS = "PLUS" as const;

/**
 * Four bottom-bar slots + More (§4 Mobile). Bookkeepers: Home · Entries · [+] ·
 * Distribution. Everyone else: Home + the first three permitted of Accounts
 * (Reports) · Requests · Entries · Advances (Notices doesn't exist yet).
 */
export function bottomNav(viewer: Viewer, opts: { monthOpen?: boolean } = {}): { slots: (NavItem | typeof PLUS)[]; more: NavItem[] } {
  const items = visibleItems(viewer);
  const at = (href: string) => items.find((i) => i.href === href);
  // [+] only while a month is open (nothing to add an expense to otherwise); Owners takes the fourth slot.
  const bookkeeper = opts.monthOpen === false ? [at("/"), at("/entries"), at("/distribution"), at("/owners")] : [at("/"), at("/entries"), PLUS, at("/distribution")];
  const picked: (NavItem | typeof PLUS)[] = can(viewer, "transaction.create")
    ? bookkeeper.filter((x): x is NavItem | typeof PLUS => x !== undefined)
    : [
        at("/")!,
        ...["/reports", "/requests", "/entries", "/advances"]
          .map(at)
          .filter((x): x is NavItem => x !== undefined)
          .slice(0, 3)
          // An owner's "Accounts" (হিসাব) is Reports (Reports PRD G16; main PRD §8.1).
          .map((i) => (i.href === "/reports" ? { ...i, label: "shell.accounts" as const, short: undefined } : i)),
      ];
  const used = new Set(picked.filter((s): s is NavItem => s !== PLUS).map((s) => s.href));
  return { slots: picked, more: items.filter((i) => !used.has(i.href)) };
}
