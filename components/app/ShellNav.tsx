"use client";

import { ArrowRightStartOnRectangleIcon, BanknotesIcon, CreditCardIcon, Cog6ToothIcon, HomeIcon, ScaleIcon, UserGroupIcon, UserIcon, UsersIcon } from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardNavigate } from "@/components/auth/navigate";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toBanglaDigits, translator, type Locale, type MessageKey } from "@/lib/i18n";
import { localePath, stripLocale } from "@/lib/i18n/paths";
import { can, type Permission, type Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useLogoutConfirm } from "./logout-confirm";

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

type NavItem = { href: string; label: MessageKey; short?: MessageKey; icon: HeroIcon; permission?: Permission; anyOf?: Permission[]; badge?: number };

export type ShellViewer = { name: string; initials: string; roles: Role[]; permissions: Permission[] };

export function ShellNav({ locale, viewer, pendingInvites }: { locale: Locale; viewer: ShellViewer; pendingInvites: number }) {
  const tr = translator(locale);
  const pathname = stripLocale(usePathname() ?? "/");
  // AUTH-05 + safety rule: logout always asks first (sidebar and bottom nav share one dialog).
  const { ask: askLogout, leaving, dialog: logoutDialog } = useLogoutConfirm({
    locale,
    onLoggedOut: () => hardNavigate(localePath(locale, "/login")),
  });
  // RBAC-05: the same permission keys the server checks decide what's shown.
  const items: NavItem[] = (
    [
      { href: "/", label: "nav.home", icon: HomeIcon },
      { href: "/entries", label: "nav.entries", short: "nav.entriesShort", icon: BanknotesIcon, permission: "transaction.view" },
      { href: "/distribution", label: "nav.distribution", icon: ScaleIcon, permission: "distribution.view" },
      { href: "/owners", label: "nav.owners", icon: UserGroupIcon, permission: "owner.view" },
      { href: "/advances", label: "nav.advances", short: "nav.advancesShort", icon: CreditCardIcon, permission: "loan.view" },
      { href: "/admin/users", label: "nav.users", icon: UsersIcon, permission: "user.list", badge: pendingInvites },
      { href: "/settings", label: "nav.settings", icon: Cog6ToothIcon, anyOf: ["unit.manage", "fund.manage", "category.manage", "settings.manage"] },
      { href: "/me", label: "nav.profile", icon: UserIcon },
    ] satisfies NavItem[]
  ).filter((i: NavItem) => (!i.permission || can(viewer, i.permission)) && (!i.anyOf || i.anyOf.some((p) => can(viewer, p))));

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const badge = (n?: number) => (n ? (locale === "bn" ? toBanglaDigits(String(n)) : String(n)) : null);

  const roleLabel = viewer.roles.map((r) => tr(`role.${r}` as MessageKey)).join(" · ");

  return (
    <>
      <aside className="sidebar" aria-label={tr("nav.main")}>
        <Link href={localePath(locale, "/")} className="brand-mark" style={{ display: "inline-flex" }}>
          {tr("app.name")}
        </Link>
        <nav aria-label={tr("nav.main")}>
          <ul className="flex flex-col gap-0.5">
            {items.map((i) => {
              const active = isActive(i.href);
              const Icon = i.icon;
              return (
                <li key={i.href}>
                  <Button
                    asChild
                    variant="ghost"
                    className={cn("w-full justify-start font-semibold", active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground")}
                  >
                    <Link href={localePath(locale, i.href)} aria-current={active ? "page" : undefined}>
                      <Icon data-icon="inline-start" />
                      {tr(i.label)}
                      {badge(i.badge) ? <Badge className="ml-auto bg-signal font-extrabold text-foreground">{badge(i.badge)}</Badge> : null}
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <Separator />
          <div className="flex items-center gap-2.5">
            <Avatar aria-hidden="true">
              <AvatarFallback>{viewer.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{viewer.name}</div>
              <div className="muted">{roleLabel}</div>
            </div>
            <Button variant="ghost" size="icon" className="text-destructive" aria-label={tr("nav.logout")} title={tr("nav.logout")} onClick={askLogout} disabled={leaving}>
              <ArrowRightStartOnRectangleIcon />
            </Button>
          </div>
        </div>
      </aside>
      <nav className="bottom-nav" aria-label={tr("nav.main")}>
        {items.map((i) => {
          const Icon = i.icon;
          return (
            <Button key={i.href} asChild variant="ghost" className="h-auto min-h-[60px] min-w-0 flex-col gap-0.5 px-1 text-[11px] font-bold">
              <Link href={localePath(locale, i.href)} aria-current={isActive(i.href) ? "page" : undefined} aria-label={i.short ? tr(i.label) : undefined}>
                <Icon className="size-[22px]" />
                <span className="max-w-full truncate">
                  {tr(i.short ?? i.label)}
                  {badge(i.badge) ? ` · ${badge(i.badge)}` : ""}
                </span>
              </Link>
            </Button>
          );
        })}
        <Button variant="ghost" className="h-auto min-h-[60px] min-w-0 flex-col gap-0.5 px-1 text-[11px] font-bold text-destructive" onClick={askLogout} disabled={leaving}>
          <ArrowRightStartOnRectangleIcon className="size-[22px]" />
          <span className="max-w-full truncate">{tr("nav.logout")}</span>
        </Button>
      </nav>
      {logoutDialog}
    </>
  );
}
