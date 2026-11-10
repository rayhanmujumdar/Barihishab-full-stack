"use client";

import type { CSSProperties } from "react";
import { Avatar as AvatarPrimitive } from "radix-ui";
import { AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * The square owner box (`.owner-avatar`): the linked login's profile photo
 * when there is one, otherwise the owner's own initials ("Ray", "NA").
 * Radix swaps the photo in only after it loads, so a missing or broken photo
 * keeps the initials instead of a broken-image icon. Always decorative —
 * the owner's name is printed next to it.
 */
export function OwnerAvatar({
  initials,
  avatarUrl,
  className,
  style,
}: {
  initials: string;
  avatarUrl: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <AvatarPrimitive.Root className={cn("owner-avatar overflow-hidden", className)} style={style} aria-hidden="true">
      {avatarUrl ? <AvatarImage src={avatarUrl} /> : null}
      <AvatarPrimitive.Fallback>{initials}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
