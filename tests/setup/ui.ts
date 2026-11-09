import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom gaps that Radix (shadcn/ui) primitives and Sonner rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

// QueryClients created by the `render` wrapper below; cleared after each test
// so their garbage-collection timers don't outlive it.
const queryClients = vi.hoisted(() => new Set<{ clear(): void }>());

afterEach(() => {
  cleanup();
  for (const c of queryClients) c.clear();
  queryClients.clear();
});

// Components read/write through TanStack Query (lib/api/query.ts), so every
// `render` gets its own QueryClient: no cache leaks between tests, no retries.
vi.mock("@testing-library/react", async (orig) => {
  const rtl = await orig<typeof import("@testing-library/react")>();
  const { createElement } = await import("react");
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const render: typeof rtl.render = ((ui: Parameters<typeof rtl.render>[0], options?: Parameters<typeof rtl.render>[1]) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } } });
    queryClients.add(client);
    const Outer = options?.wrapper;
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client }, Outer ? createElement(Outer, null, children) : children);
    return rtl.render(ui, { ...options, wrapper });
  }) as typeof rtl.render;
  return { ...rtl, render };
});
