"use client";

import { ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** shadcn Alert (destructive) that takes focus when its message changes (Auth PRD §8 a11y). */
export function ErrorStrip({ message, id }: { message: string | null | undefined; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  if (!message) return null;
  return (
    <Alert ref={ref} id={id} variant="destructive" tabIndex={-1}>
      <ExclamationCircleIcon className="size-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
