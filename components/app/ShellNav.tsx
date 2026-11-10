"use client";

import { ArrowRightStartOnRectangleIcon, EllipsisHorizontalIcon, PlusIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { hardNavigate } from "@/components/auth/navigate";
import { UserAvatar } from "@/components/users/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toBanglaDigits, translator, type Locale, type MessageKey } from "@/lib/i18n";
import { localePath, stripLocale } from "@/lib/i18n/paths";
import type { Permission, Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useLogoutConfirm } from "./logout-confirm";
import { bottomNav, PLUS, visibleItems, type NavItem } from "./nav";

/** `avatarUrl`: same-origin profile photo, initials shown when absent (add-profile-photo). */
export type ShellViewer = { name: string; initials: string; avatarUrl?: string | null; roles: Role[]; permissions: Permission[] };

/** Where the new-expense drawer opens (Entries `?new=`). */
const NEW_EXPENSE = "/entries?new=EXPENSE";

/** Top-bar primary action (Home PRD §4): + New entry for bookkeepers, + Request money for owners. */
export function TopbarAction({ locale, action }: { locale: Locale; action: "entry" | "request" | null }) {
  if (!action) return null;
  const tr = translator(locale);
  return (
    <Button asChild className="topbar-action">
      <Link href={localePath(locale, action === "entry" ? NEW_EXPENSE : "/requests?new=1")}>
        <PlusIcon data-icon="inline-start" />
        {tr(action === "entry" ? "shell.newEntry" : "shell.requestMoney")}
      </Link>
    </Button>
  );
}

/**
 * Sidebar (≥ 860px) and bottom bar + More sheet (< 860px) (Home PRD §4).
 * `requestBadge`: pending requests (Super Admin) or own unseen decisions (Requests PRD F1, F14).
 */
export function ShellNav({
  locale,
  viewer,
  pendingInvites,
  requestBadge = 0,
  houseName = null,
  monthOpen = true,
}: {
  locale: Locale;
  viewer: ShellViewer;
  pendingInvites: number;
  requestBadge?: number;
  houseName?: string | null;
  /** Some month is open: the [+] cell adds an expense to it. */
  monthOpen?: boolean;
}) {
  const tr = translator(locale);
  const pathname = stripLocale(usePathname() ?? "/");
  const [moreOpen, setMoreOpen] = useState(false);
  // AUTH-05 + safety rule: logout always asks first (sidebar and More sheet share one dialog).
  const { ask: askLogout, leaving, dialog: logoutDialog } = useLogoutConfirm({
    locale,
    onLoggedOut: () => hardNavigate(localePath(locale, "/login")),
  });
  const items = visibleItems(viewer);
  const { slots, more } = bottomNav(viewer, { monthOpen });

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const count = (i: NavItem) => (i.badge === "requests" ? requestBadge : i.badge === "invites" ? pendingInvites : 0);
  const badge = (i: NavItem) => {
    const n = count(i);
    return n ? (locale === "bn" ? toBanglaDigits(String(n)) : String(n)) : null;
  };
  const roleLabel = viewer.roles.map((r) => tr(`role.${r}` as MessageKey)).join(" · ");
  const moreActive = more.some((i) => isActive(i.href));

  return (
    <>
      <aside className="sidebar" aria-label={tr("nav.main")}>
        <div className="flex flex-col gap-1">
          <Link href={localePath(locale, "/")} className="brand-mark" style={{ display: "inline-flex" }}>
            {tr("app.name")}
          </Link>
          {houseName ? <p className="kicker pl-[38px]">{houseName}</p> : null}
        </div>
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
                      {badge(i) ? <Badge className="ml-auto bg-signal font-extrabold text-foreground">{badge(i)}</Badge> : null}
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
            <UserAvatar name={viewer.name} avatarUrl={viewer.avatarUrl ?? null} />
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
        {slots.map((i) => {
          if (i === PLUS)
            return (
              <Link key="plus" href={localePath(locale, NEW_EXPENSE)} className="bottom-nav-plus" aria-label={tr("shell.addExpense")}>
                <PlusIcon className="size-7" />
              </Link>
            );
          const Icon = i.icon;
          return (
            <Link
              key={i.href}
              href={localePath(locale, i.href)}
              aria-current={isActive(i.href) ? "page" : undefined}
              aria-label={i.short ? tr(i.label) : undefined}
            >
              <Icon className="size-[22px]" />
              <span className="max-w-full truncate">
                {tr(i.short ?? i.label)}
                {badge(i) ? ` · ${badge(i)}` : ""}
              </span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setMoreOpen(true)} data-active={moreActive || undefined} aria-haspopup="dialog">
          <EllipsisHorizontalIcon className="size-[22px]" />
          <span className="max-w-full truncate">{tr("shell.more")}</span>
        </button>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" aria-describedby={undefined} className="gap-0 border-t-2 border-foreground bg-background p-0 pb-[60px]" lang={locale}>
          <SheetHeader className="border-b-2 border-foreground px-4 py-3">
            <SheetTitle className="text-lg font-extrabold">{tr("shell.moreTitle")}</SheetTitle>
          </SheetHeader>
          <ul className="more-grid">
            {more.map((i) => {
              const Icon = i.icon;
              return (
                <li key={i.href}>
                  <Link href={localePath(locale, i.href)} aria-current={isActive(i.href) ? "page" : undefined} onClick={() => setMoreOpen(false)}>
                    <Icon className="size-5" />
                    <span className="min-w-0 flex-1 truncate">{tr(i.label)}</span>
                    {badge(i) ? <Badge className="bg-signal font-extrabold text-foreground">{badge(i)}</Badge> : null}
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                className="text-destructive"
                onClick={() => {
                  setMoreOpen(false);
                  askLogout();
                }}
                disabled={leaving}
              >
                <ArrowRightStartOnRectangleIcon className="size-5" />
                <span>{tr("nav.logout")}</span>
              </button>
            </li>
          </ul>
        </SheetContent>
      </Sheet>
      {logoutDialog}
    </>
  );
}
