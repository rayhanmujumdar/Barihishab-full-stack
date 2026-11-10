"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/users/initials";

/**
 * A user's profile photo, or their initials square when there is none or it
 * fails to load (add-profile-photo D7). Radix only swaps the image in once it
 * has loaded, so a broken URL never shows a broken-image icon.
 */
export function UserAvatar({
  name,
  avatarUrl,
  size = "default",
  decorative = true,
  className,
}: {
  name: string;
  avatarUrl: string | null;
  size?: "default" | "sm" | "lg";
  /** Next to a visible name the avatar adds nothing for screen readers. */
  decorative?: boolean;
  className?: string;
}) {
  return (
    <Avatar size={size} aria-hidden={decorative ? true : undefined} className={cn("rounded-none", className)}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={decorative ? "" : name} /> : null}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
