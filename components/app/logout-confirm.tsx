"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import { useQueryClient } from "@tanstack/react-query";
import { translator, type Locale } from "@/lib/i18n";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Logout behind a confirmation (AUTH-05). Returns `ask()` for any number of
 * triggers plus one `dialog` element to render once.
 */
export function useLogoutConfirm({
  locale,
  onLoggedOut,
  title,
  description,
}: {
  locale: Locale;
  onLoggedOut: () => void;
  title?: string;
  description?: string;
}) {
  const tr = translator(locale);
  const qc = useQueryClient();
  const logoutMutation = useApiMutation(["auth", "logout"], () => apiFetch("/auth/logout", { method: "POST" }));
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    const res = await logoutMutation.run();
    // 401 = already logged out. Anything else means the session may still be
    // live, and /login would bounce us straight back into the app.
    if (res.ok || res.status === 401) {
      qc.clear(); // drop this user's cached data before anyone else signs in
      onLoggedOut();
      return; // stay "leaving" while the page navigates away
    }
    setLeaving(false);
    setOpen(false);
    toast.error(tr("common.logoutFailed"));
  }

  const dialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title={title ?? tr("confirm.logout.title")}
      description={description ?? tr("confirm.logout.body")}
      confirmLabel={tr("nav.logout")}
      cancelLabel={tr("common.cancel")}
      busy={leaving}
      onConfirm={logout}
    />
  );

  return { ask: () => setOpen(true), leaving, dialog };
}
