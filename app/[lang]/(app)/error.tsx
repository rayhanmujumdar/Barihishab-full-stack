"use client";

import { ErrorView } from "@/components/app/ErrorView";

// Errors in a signed-in page: shown inside the shell so navigation still works.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} />;
}
