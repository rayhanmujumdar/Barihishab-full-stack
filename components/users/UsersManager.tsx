"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { EllipsisHorizontalIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog, menuTriggerOfFocused } from "@/components/app/confirm-dialog";
import { ErrorStrip } from "@/components/forms/error-strip";
import { SelectField, TextField } from "@/components/forms/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";
import { apiGet, qk, queryErrorMessage, useApiMutation, useServerSeed, type UserListFilter } from "@/lib/api/query";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { formatDateTime, translator, type Locale, type MessageKey } from "@/lib/i18n";
import type { PublicUser } from "@/lib/users/dto";
import { UserForm } from "./UserForm";
import { UserAvatar } from "./UserAvatar";

export type UserPage = { items: PublicUser[]; nextCursor: string | null; activeSuperAdminCount: number };

function usersPath(f: UserListFilter, cursor?: string | null) {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.role) sp.set("role", f.role);
  if (f.status) sp.set("status", f.status);
  if (cursor) sp.set("cursor", cursor);
  return `/users${sp.size ? `?${sp}` : ""}`;
}

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
  const tr = useMemo(() => translator(locale), [locale]);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [drawer, setDrawer] = useState<{ user: PublicUser | null; key: number } | null>(null);
  // Target kept separate from `open` so the dialog text doesn't blank during its close animation.
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // One cached list per (debounced) filter set. TanStack keys replace the old
  // request-sequence guard: a slow response for stale filters can't win.
  const debounced = useDebouncedValue<UserListFilter>(useMemo(() => ({ q: q.trim(), role, status }), [q, role, status]));
  const unfiltered = !debounced.q && !debounced.role && !debounced.status;
  const listKey = qk.users.list(debounced);
  const list = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) => apiGet<UserPage>(usersPath(debounced, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // The server render is page 1 of the unfiltered list.
    initialData: unfiltered ? { pages: [initial], pageParams: [null] } : undefined,
    placeholderData: keepPreviousData,
  });
  // A fresh server render (router.refresh) wins over the older cached unfiltered list.
  useServerSeed(qk.users.list({ q: "", role: "", status: "" }), initial, (p) => ({ pages: [p], pageParams: [null] }));
  const pages = list.data?.pages ?? [initial];
  const page: UserPage = {
    items: pages.flatMap((p) => p.items),
    nextCursor: pages[pages.length - 1].nextCursor,
    activeSuperAdminCount: pages[0].activeSuperAdminCount,
  };
  const shownError = error ?? queryErrorMessage(list.error, tr("common.network"));

  const rowAction = useApiMutation(["users", "row-action"], (v: { id: string; path: string; body?: { reason: string } }) =>
    apiFetch<{ user?: PublicUser } | null>(`/users/${v.id}/${v.path}`, { method: "POST", ...(v.body ? { body: v.body } : {}) }),
  );
  const busy = rowAction.isPending;

  /** Patch the cached list in place, then mark every user list stale for its next use. */
  function replaceUser(u: PublicUser) {
    qc.setQueryData<InfiniteData<UserPage, string | null>>(listKey, (data) => {
      if (!data) return data;
      const before = data.pages.flatMap((p) => p.items).find((x) => x.id === u.id);
      // The list may be filtered, so adjust the server's total by this one
      // user's change instead of recounting the visible rows.
      const activeSuperAdminCount = data.pages[0].activeSuperAdminCount - Number(isActiveAdmin(before)) + Number(isActiveAdmin(u));
      const pages = data.pages.map((p, i) => ({
        ...p,
        activeSuperAdminCount,
        items: before ? p.items.map((x) => (x.id === u.id ? u : x)) : i === 0 ? [u, ...p.items] : p.items,
      }));
      return { ...data, pages };
    });
    void qc.invalidateQueries({ queryKey: qk.users.all, refetchType: "none" });
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
    setError(null);
    const res = await rowAction.run({ id: user.id, path: spec.path, ...(spec.needsReason ? { body: { reason: reason.trim() } } : {}) });
    setConfirmOpen(false);
    if (!res.ok) {
      setError(res.status === 0 ? tr("common.network") : res.error.message);
      return;
    }
    if (res.data?.user) replaceUser(res.data.user);
    else router.refresh(); // no row changed (e.g. sessions revoked)
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

      <ErrorStrip message={shownError} />

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
                        <UserAvatar name={u.name} avatarUrl={u.avatarUrl} />
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
          <Button variant="outline" className="mt-4" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
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
