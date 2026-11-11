"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 859.98px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** True below the 860px breakpoint (phones): charts switch to month initials. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
