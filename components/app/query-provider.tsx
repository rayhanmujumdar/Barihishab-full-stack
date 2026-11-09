"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";
import { makeQueryClient } from "@/lib/api/query";

/**
 * One QueryClient per browser tab (created lazily, so it survives re-renders
 * but is never shared between server requests). Devtools render in
 * development only; the package ships a no-op build for production.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" ? <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" position="right" /> : null}
    </QueryClientProvider>
  );
}
