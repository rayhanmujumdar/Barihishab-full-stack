"use client";

import { ErrorView } from "@/components/app/ErrorView";

// Errors in the auth / print routes, or in the app shell layout itself.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} standalone />;
}
