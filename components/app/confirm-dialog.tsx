"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** The action verb ("Log out", "Revoke invite"). Never a generic "OK". */
  confirmLabel: string;
  cancelLabel: string;
  /** Destructive actions get the red confirm button. Default: "destructive". */
  tone?: "destructive" | "default";
  /** A confirmed request is in flight: both buttons disabled, dialog can't be dismissed. */
  busy?: boolean;
  /** Confirm not allowed yet (e.g. required reason is empty). */
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  /** Extra body content, e.g. a required reason field. */
  children?: ReactNode;
  /**
   * Where focus goes on close when the element that opened the dialog is gone
   * (e.g. the revoked session's row was removed). Without it Radix drops focus
   * on <body> and keyboard users lose their place.
   */
  returnFocusTo?: () => HTMLElement | null;
};

/**
 * The button that opened the Radix menu holding the focused item. Call it from
 * a menu item's `onSelect`, before the menu unmounts, and pass the result to
 * `returnFocusTo` — the menu item itself is gone by the time the dialog closes.
 */
export function menuTriggerOfFocused(): HTMLElement | null {
  const menu = document.activeElement?.closest('[role="menu"]');
  const id = menu?.getAttribute("aria-labelledby");
  return id ? document.getElementById(id) : null;
}

/**
 * The one confirmation modal for every destructive action (logout, revoke,
 * deactivate, delete, void...). Nothing is sent until the user confirms;
 * Cancel gets focus on open so a stray Enter does nothing harmful.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "destructive",
  busy = false,
  confirmDisabled = false,
  onConfirm,
  children,
  returnFocusTo,
}: ConfirmDialogProps) {
  // A ref, not state: a double click fires both events before React re-renders
  // with `busy`, so only a synchronous guard stops the second request.
  const inFlight = useRef(false);
  // Radix only restores focus to an <AlertDialogTrigger>. Our call sites open the
  // dialog from state (menus, buttons with async work), so remember the opener
  // ourselves. Layout effect: runs before Radix moves focus to Cancel.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      opener.current = document.activeElement;
    }
  }, [open]);

  async function confirm() {
    if (inFlight.current || busy || confirmDisabled) return;
    inFlight.current = true;
    try {
      await onConfirm();
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => (busy && !o ? undefined : onOpenChange(o))}>
      <AlertDialogContent
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onCloseAutoFocus={(e) => {
          const el = opener.current;
          opener.current = null;
          const target = el?.isConnected ? el : returnFocusTo?.();
          if (target?.isConnected) {
            e.preventDefault();
            target.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          {/* Plain Button, not AlertDialogAction: Action auto-closes, but async
              confirms must stay open until the caller knows the outcome. */}
          <Button
            type="button"
            data-tone={tone}
            className={cn(tone === "destructive" && "bg-destructive text-primary-foreground hover:bg-neg-800 active:bg-neg-800")}
            disabled={busy || confirmDisabled}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
