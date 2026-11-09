"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EllipsisHorizontalIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog, menuTriggerOfFocused } from "@/components/app/confirm-dialog";
import { ErrorStrip } from "@/components/forms/error-strip";
import { SelectField, TextField } from "@/components/forms/fields";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";
import { formatDateTime, translator, type Locale, type MessageKey } from "@/lib/i18n";
import type { PublicUser } from "@/lib/users/dto";
import { initials } from "@/lib/users/initials";
import { UserForm } from "./UserForm";

export type UserPage = { items: PublicUser[]; nextCursor: string | null; activeSuperAdminCount: number };

type ConfirmKind = "deactivate" | "reactivate" | "logout" | "revokeInvite" | "resendInvite";
/** `returnTo`: the row's actions button — the menu item that opened the dialog is gone by close time. */
type Confirm = { kind: ConfirmKind; user: PublicUser; returnTo: HTMLElement | null } | null;

/** Every row action that ends sessions, kills a link or removes access asks first. */
const CONFIRM: Record<
  ConfirmKind,
  { path: string; title: MessageKey; body: MessageKey; action: MessageKey; toast: MessageKey; tone: "destructive" | "default"; needsReason: boolean }
> = {
  deactivate: { path: "deactivate", title: "users.dialog.deactivate", body: "users.dialog.deactivateBody", action: "users.action.deactivate", toast: "users.toast.deactivated", tone: "destructive", needsReason: true },
  reactivate: { path: "reactivate", title: "users.dialog.reactivate", body: "users.dialog.reactivateBody", action: "users.action.reactivate", toast: "users.toast.reactivated", tone: "default", needsReason: true },
  logout: { path: "revoke-sessions", title: "users.dialog.logout", body: "users.dialog.logoutBody", action: "users.action.logoutEverywhere", toast: "users.toast.loggedOut", tone: "destructive", needsReason: false },
  revokeInvite: { path: "revoke-invite", title: "users.dialog.revokeInvite", body: "users.dialog.revokeInviteBody", action: "users.action.revokeInvite", toast: "users.toast.revoked", tone: "destructive", needsReason: false },
  resendInvite: { path: "resend-invite", title: "users.dialog.resendInvite", body: "users.dialog.resendInviteBody", action: "users.action.resend", toast: "users.toast.resent", tone: "destructive", needsReason: false },
};

const STATUS_VARIANT = { INVITED: "accent", ACTIVE: "pos", INACTIVE: "neutral" } as const;

function isActiveAdmin(u: PublicUser | undefined) {
  return !!u && u.status === "ACTIVE" && u.roles.includes("SUPER_ADMIN");
}

function isLastActiveAdmin(u: PublicUser, activeSuperAdminCount: number) {
  return u.status === "ACTIVE" && u.roles.includes("SUPER_ADMIN") && activeSuperAdminCount <= 1;
}

/** User management (Auth PRD §4 A6). Every action is re-checked by the API. */
export function UsersManager({ locale, viewerId, initial }: { locale: Locale; viewerId: string; initial: UserPage }) {
  // Stable per locale: `reload` depends on it, and a new function each render
  // would re-fetch the list after every render.
  const tr = useMemo(() => translator(locale), [locale]);
  const [page, setPage] = useState<UserPage>(initial);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [drawer, setDrawer] = useState<{ user: PublicUser | null; key: number } | null>(null);
  // Target kept separate from `open` so the dialog text doesn't blank during its close animation.
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstLoad = useRef(true);
  // Only the newest list request may write state (typing fast, then "Load more").
  const requestSeq = useRef(0);
  const router = useRouter();

  const query = useCallback(
    (cursor?: string) => {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (role) sp.set("role", role);
      if (status) sp.set("status", status);
      if (cursor) sp.set("cursor", cursor);
      return `/users${sp.size ? `?${sp}` : ""}`;
    },
    [q, role, status],
  );

  const reload = useCallback(async () => {
    const seq = ++requestSeq.current;
    const res = await apiFetch<UserPage>(query());
    if (seq !== requestSeq.current) return; // a newer request superseded this one
    if (res.ok) setPage(res.data);
    else setError(res.status === 0 ? tr("common.network") : res.error.message);
  }, [query, tr]);

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    const t = setTimeout(reload, 250);
    return () => clearTimeout(t);
  }, [reload]);

  async function loadMore() {
    if (!page.nextCursor) return;
    const seq = ++requestSeq.current;
    const res = await apiFetch<UserPage>(query(page.nextCursor));
    if (seq !== requestSeq.current) return; // filters changed meanwhile
    if (res.ok) setPage((p) => ({ ...res.data, items: [...p.items, ...res.data.items] }));
  }

  function replaceUser(u: PublicUser) {
    setPage((p) => {
      const before = p.items.find((x) => x.id === u.id);
      const items = before ? p.items.map((x) => (x.id === u.id ? u : x)) : [u, ...p.items];
      // The list may be filtered, so adjust the server's total by this one
      // user's change instead of recounting the visible rows.
      const activeSuperAdminCount = p.activeSuperAdminCount - Number(isActiveAdmin(before)) + Number(isActiveAdmin(u));
      return { ...p, items, activeSuperAdminCount };
    });
    router.refresh(); // sidebar badge / names come from the server layout
  }

  function ask(kind: ConfirmKind, user: PublicUser) {
    setConfirm({ kind, user, returnTo: menuTriggerOfFocused() });
    setReason("");
    setConfirmOpen(true);
  }

  async function runConfirm() {
    if (!confirm) return;
    const { kind, user } = confirm;
    const spec = CONFIRM[kind];
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ user?: PublicUser } | null>(`/users/${user.id}/${spec.path}`, {
      method: "POST",
      ...(spec.needsReason ? { body: { reason: reason.trim() } } : {}),
    });
    setBusy(false);
    setConfirmOpen(false);
    if (!res.ok) {
      setError(res.status === 0 ? tr("common.network") : res.error.message);
      return;
    }
    if (res.data?.user) replaceUser(res.data.user);
    else router.refresh();
    toast(tr(spec.toast, { name: user.name }));
  }

  const roleLabel = (u: PublicUser) => u.roles.map((r) => tr(`role.${r}` as MessageKey)).join(" · ");

  return (
    <div className="page-stack" lang={locale}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">{tr("users.kicker")}</p>
          <h1 className="page-title">{tr("users.title")}</h1>
        </div>
        <Button onClick={() => setDrawer({ user: null, key: Date.now() })}>
          <PlusIcon data-icon="inline-start" />
          {tr("users.new")}
        </Button>
      </div>

      <ErrorStrip message={error} />

      <div className="toolbar" role="search">
        <TextField id="users-q" type="search" label={tr("users.search")} placeholder={tr("ph.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <SelectField
          id="users-role"
          label={tr("users.filterRole")}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          options={[
            { value: "", label: tr("users.filterAll") },
            { value: "SUPER_ADMIN", label: tr("role.SUPER_ADMIN") },
            { value: "OWNER", label: tr("role.OWNER") },
          ]}
        />
        <SelectField
          id="users-status"
          label={tr("users.filterStatus")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "", label: tr("users.filterAll") },
            { value: "INVITED", label: tr("users.status.INVITED") },
            { value: "ACTIVE", label: tr("users.status.ACTIVE") },
            { value: "INACTIVE", label: tr("users.status.INACTIVE") },
          ]}
        />
      </div>

      <section>
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{tr("users.col.person")}</TableHead>
              <TableHead scope="col">{tr("users.col.role")}</TableHead>
              <TableHead scope="col">{tr("users.col.responsibility")}</TableHead>
              <TableHead scope="col">{tr("users.col.status")}</TableHead>
              <TableHead scope="col">{tr("users.col.lastLogin")}</TableHead>
              <TableHead scope="col">
                <span className="sr-only">{tr("users.col.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="muted">
                  {tr("users.empty")}
                </TableCell>
              </TableRow>
            ) : (
              page.items.map((u) => {
                const lastAdmin = isLastActiveAdmin(u, page.activeSuperAdminCount);
                return (
                  <TableRow key={u.id} aria-label={u.name}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar aria-hidden="true">
                          <AvatarFallback>{initials(u.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-bold">{u.name}</div>
                          <div className="muted">@{u.username}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{roleLabel(u)}</TableCell>
                    <TableCell>{u.houseResponsibility ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[u.status]}>{tr(`users.status.${u.status}` as MessageKey)}</Badge>
                    </TableCell>
                    <TableCell className="muted">{formatDateTime(locale, u.lastLoginAt) ?? tr("common.never")}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={tr("users.actionsFor", { name: u.name })}>
                            <EllipsisHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-56 rounded-none border-2 border-foreground">
                          <DropdownMenuItem onSelect={() => setDrawer({ user: u, key: Date.now() })}>{tr("users.action.edit")}</DropdownMenuItem>
                          {u.status === "INVITED" ? (
                            <>
                              <DropdownMenuItem onSelect={() => ask("resendInvite", u)}>{tr("users.action.resend")}</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => ask("revokeInvite", u)}>{tr("users.action.revokeInvite")}</DropdownMenuItem>
                            </>
                          ) : null}
                          {u.status === "INACTIVE" ? (
                            <DropdownMenuItem onSelect={() => ask("reactivate", u)}>{tr("users.action.reactivate")}</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={lastAdmin}
                              title={lastAdmin ? tr("users.lastAdmin") : undefined}
                              onSelect={() => ask("deactivate", u)}
                            >
                              {tr("users.action.deactivate")}
                            </DropdownMenuItem>
                          )}
                          {u.status === "ACTIVE" && u.id !== viewerId ? (
                            <DropdownMenuItem onSelect={() => ask("logout", u)}>{tr("users.action.logoutEverywhere")}</DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {page.nextCursor ? (
          <Button variant="outline" className="mt-4" onClick={loadMore}>
            {tr("users.loadMore")}
          </Button>
        ) : null}
      </section>

      {drawer ? (
        <UserForm
          key={drawer.key}
          locale={locale}
          open
          user={drawer.user}
          roleLocked={drawer.user ? isLastActiveAdmin(drawer.user, page.activeSuperAdminCount) : false}
          onClose={() => setDrawer(null)}
          onProfileSaved={replaceUser}
          onSaved={(u, created) => {
            replaceUser(u);
            setDrawer(null);
            toast(created ? tr("users.toast.created", { email: u.email }) : tr("users.toast.saved"));
          }}
        />
      ) : null}

      {confirm ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={tr(CONFIRM[confirm.kind].title, { name: confirm.user.name })}
          description={tr(CONFIRM[confirm.kind].body)}
          confirmLabel={tr(CONFIRM[confirm.kind].action)}
          cancelLabel={tr("common.cancel")}
          tone={CONFIRM[confirm.kind].tone}
          busy={busy}
          confirmDisabled={CONFIRM[confirm.kind].needsReason && !reason.trim()}
          onConfirm={runConfirm}
          returnFocusTo={() => confirm.returnTo}
        >
          {CONFIRM[confirm.kind].needsReason ? (
            <TextField id="confirm-reason" label={tr("users.field.reason")} placeholder={tr("ph.reason")} value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={500} />
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
